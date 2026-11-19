//go:build e2e

package e2e

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"testing"
	"time"

	routev1 "github.com/openshift/api/route/v1"
	"k8s.io/apimachinery/pkg/util/wait"

	"github.com/openshift/monitoring-plugin/pkg/k8s"
	"github.com/openshift/monitoring-plugin/test/e2e/framework"
)

// TestRBAC_GetSilences creates silences in namespaces without PrometheusRules:
// discovery must not be restricted to namespaces containing alert rules.
func TestRBAC_GetSilences(t *testing.T) {
	f, err := framework.New()
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	nsA, cleanupA, err := f.CreateUserNamespace(ctx, "test-silences-a")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := cleanupA(); err != nil {
			t.Log(err)
		}
	})
	nsB, cleanupB, err := f.CreateUserNamespace(ctx, "test-silences-b")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := cleanupB(); err != nil {
			t.Log(err)
		}
	})
	scoped, err := f.CreateUserWithClusterRole(ctx, "silences-editor", nsA, "monitoring-rules-edit")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := scoped.Cleanup(); err != nil {
			t.Log(err)
		}
	})
	denied, err := f.CreateAnonymousUser(ctx, "silences-denied", nsB)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := denied.Cleanup(); err != nil {
			t.Log(err)
		}
	})

	raw, err := f.Clientset.CoreV1().RESTClient().Get().AbsPath("/apis/route.openshift.io/v1/namespaces/openshift-monitoring/routes/alertmanager-main").Do(ctx).Raw()
	if err != nil {
		t.Fatalf("get Alertmanager route: %v", err)
	}
	var route routev1.Route
	if err := json.Unmarshal(raw, &route); err != nil {
		t.Fatal(err)
	}
	amURL := "https://" + route.Spec.Host + route.Spec.Path + "/api/v2/silences"
	// Test-only route client: ingress certificates need not be publicly trusted.
	amClient := &http.Client{Timeout: 30 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: true}}}
	t.Cleanup(func() { amClient.CloseIdleConnections() })
	ids := map[string]string{}
	for _, ns := range []string{nsA, nsB, ""} {
		matchers := []k8s.SilenceMatcher{{Name: "alertname", Value: fmt.Sprintf("E2ESilences-%s", nsA)}}
		if ns != "" {
			matchers = append(matchers, k8s.SilenceMatcher{Name: "namespace", Value: ns})
		}
		body, err := json.Marshal(map[string]interface{}{
			"matchers": matchers, "startsAt": time.Now().UTC(), "endsAt": time.Now().Add(time.Hour).UTC(),
			"createdBy": "monitoring-plugin-e2e", "comment": "GET silences RBAC test",
		})
		if err != nil {
			t.Fatal(err)
		}
		req, err := f.AuthorizedRequest(ctx, http.MethodPost, amURL, bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := amClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		var created struct {
			SilenceID string `json:"silenceID"`
		}
		decodeErr := json.NewDecoder(resp.Body).Decode(&created)
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusOK || decodeErr != nil || created.SilenceID == "" {
			t.Fatalf("create silence: HTTP %d, error %v", resp.StatusCode, decodeErr)
		}
		ids[ns] = created.SilenceID
		t.Cleanup(func() {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			req, err := f.AuthorizedRequest(cleanupCtx, http.MethodDelete, amURL+"/"+created.SilenceID, nil)
			if err != nil {
				t.Log(err)
				return
			}
			resp, err := amClient.Do(req)
			if err != nil {
				t.Log(err)
				return
			}
			_ = resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				t.Errorf("delete silence: HTTP %d", resp.StatusCode)
			}
		})
	}
	cases := []struct {
		name, token, namespace string
		visible                []string
	}{
		{"admin-all", f.BearerToken, "", []string{nsA, nsB, ""}},
		{"admin-namespace", f.BearerToken, nsA, []string{nsA}},
		{"scoped-fanout", scoped.Token, "", []string{nsA}},
		{"scoped-namespace", scoped.Token, nsA, []string{nsA}},
		{"scoped-other-namespace", scoped.Token, nsB, nil},
		{"denied-fanout", denied.Token, "", nil},
		{"denied-namespace", denied.Token, nsA, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			expected := map[string]bool{}
			for _, ns := range tc.visible {
				expected[ids[ns]] = true
			}
			// Allow for Alertmanager gossip replication and RBAC propagation.
			err := wait.PollUntilContextTimeout(ctx, 2*time.Second, time.Minute, true, func(ctx context.Context) (bool, error) {
				endpoint := f.PluginURL + "/api/v1/alerting/silences"
				if tc.namespace != "" {
					endpoint += "?namespace=" + url.QueryEscape(tc.namespace)
				}
				req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
				if err != nil {
					return false, err
				}
				req.Header.Set("Authorization", "Bearer "+tc.token)
				resp, err := f.HTTPClient().Do(req)
				if err != nil {
					return false, err
				}
				defer resp.Body.Close()
				if resp.StatusCode != http.StatusOK {
					t.Logf("GET silences: HTTP %d", resp.StatusCode)
					return false, nil
				}
				var result struct {
					Data struct {
						Silences []k8s.Silence `json:"silences"`
					} `json:"data"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
					return false, err
				}
				found := map[string]bool{}
				for _, silence := range result.Data.Silences {
					found[silence.ID] = true
				}
				for _, id := range ids {
					if found[id] && !expected[id] {
						return false, fmt.Errorf("unauthorized silence %s leaked", id)
					}
					if expected[id] && !found[id] {
						return false, nil
					}
				}
				return true, nil
			})
			if err != nil {
				t.Fatal(err)
			}
		})
	}
	t.Run("missing-token", func(t *testing.T) {
		resp, err := f.HTTPClient().Get(f.PluginURL + "/api/v1/alerting/silences")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("HTTP %d", resp.StatusCode)
		}
	})
}
