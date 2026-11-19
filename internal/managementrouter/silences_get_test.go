package managementrouter_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/openshift/monitoring-plugin/internal/managementrouter"
	"github.com/openshift/monitoring-plugin/pkg/k8s"
)

func TestGetSilences(t *testing.T) {
	f := newAGFixture(t)
	f.mockPrometheusAlerts.FetchSilencesFunc = func(ctx context.Context, namespace string) ([]k8s.Silence, []string, error) {
		if namespace != "team-a" {
			t.Errorf("namespace = %q", namespace)
		}
		if k8s.BearerTokenFromContext(ctx) != "test-token" {
			t.Error("caller token not forwarded")
		}
		return []k8s.Silence{{ID: "silence-id", Comment: "not enriched", Matchers: []k8s.SilenceMatcher{{Name: "namespace", Value: "team-a"}}, Status: k8s.SilenceStatus{State: "active"}}}, []string{"partial failure"}, nil
	}
	w := f.get(t, "/api/v1/alerting/silences?namespace=team-a")
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("headers: %v", w.Header())
	}
	var resp managementrouter.GetSilencesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data.Silences) != 1 || resp.Data.Silences[0].Comment != "not enriched" || resp.Warnings == nil {
		t.Fatalf("response: %+v", resp)
	}
}

func TestGetSilencesEmpty(t *testing.T) {
	f := newAGFixture(t)
	f.mockPrometheusAlerts.FetchSilencesFunc = func(context.Context, string) ([]k8s.Silence, []string, error) { return nil, nil, nil }
	w := f.get(t, "/api/v1/alerting/silences")
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != `{"data":{"silences":[]}}` {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
}

func TestGetSilencesValidation(t *testing.T) {
	for _, query := range []string{"namespace=a&namespace=b", "namespace=&namespace=", "state=active", "unknown=value"} {
		t.Run(query, func(t *testing.T) {
			f := newAGFixture(t)
			f.mockPrometheusAlerts.FetchSilencesFunc = func(context.Context, string) ([]k8s.Silence, []string, error) {
				t.Fatal("fetch called for invalid query")
				return nil, nil, nil
			}
			if w := f.get(t, "/api/v1/alerting/silences?"+query); w.Code != http.StatusBadRequest {
				t.Fatalf("status %d: %s", w.Code, w.Body)
			}
		})
	}
}

func TestGetSilencesAuthentication(t *testing.T) {
	f := newAGFixture(t)
	f.mockPrometheusAlerts.FetchSilencesFunc = func(context.Context, string) ([]k8s.Silence, []string, error) {
		t.Fatal("fetch called without auth")
		return nil, nil, nil
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/alerting/silences", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", w.Code)
	}
}

func TestGetSilencesError(t *testing.T) {
	f := newAGFixture(t)
	f.mockPrometheusAlerts.FetchSilencesFunc = func(context.Context, string) ([]k8s.Silence, []string, error) {
		return nil, nil, errors.New("upstream failure")
	}
	w := f.get(t, "/api/v1/alerting/silences")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", w.Code)
	}
}
