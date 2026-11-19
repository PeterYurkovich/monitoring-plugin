package k8s

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	routev1 "github.com/openshift/api/route/v1"
	routefake "github.com/openshift/client-go/route/clientset/versioned/fake"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	ktesting "k8s.io/client-go/testing"
)

func silenceTestClient(t *testing.T, handler http.HandlerFunc) *prometheusAlerts {
	t.Helper()
	t.Setenv("KUBECONFIG", "test-kubeconfig")
	ca, cert := mustServiceServerCert(t, "localhost", "alertmanager-main.openshift-monitoring.svc", "alertmanager-user-workload.openshift-user-workload-monitoring.svc")
	path := filepath.Join(t.TempDir(), "ca.crt")
	if err := os.WriteFile(path, ca, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv(serviceCAFileEnv, path)
	listener, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{cert}})
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: time.Second}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
	_, port, _ := net.SplitHostPort(listener.Addr().String())
	routes := routefake.NewSimpleClientset(&routev1.Route{
		ObjectMeta: metav1.ObjectMeta{Name: PlatformAlertmanagerRouteName, Namespace: ClusterMonitoringNamespace},
		Spec:       routev1.RouteSpec{Host: "localhost:" + port},
	})
	core := fake.NewClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "a"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "b"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "openshift-monitoring"}},
	)
	pa := newPrometheusAlerts(routes, core.CoreV1(), &rest.Config{BearerToken: "plugin-token"}, nil)
	pa.platformAlertmanagerTunnel.localAddress = listener.Addr().String()
	pa.userWorkloadAlertmanagerTunnel.localAddress = listener.Addr().String()
	return pa
}

func TestFetchSilencesClusterWide(t *testing.T) {
	calls := 0
	pa := silenceTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != alertmanagerSilencesPath || r.URL.RawQuery != "" {
			t.Errorf("unexpected URL: %s", r.URL)
		}
		if r.Header.Get("Authorization") != "Bearer caller-token" {
			t.Error("caller token not forwarded")
		}
		fmt.Fprint(w, `[{"id":"global","matchers":[],"comment":"unchanged","status":{"state":"active"}}]`)
	})
	got, warnings, err := pa.FetchSilences(WithBearerToken(context.Background(), "caller-token"), "")
	if err != nil || len(warnings) != 0 || len(got) != 1 || got[0].Comment != "unchanged" || calls != 1 {
		t.Fatalf("got %v warnings %v error %v calls %d", got, warnings, err, calls)
	}
}

func TestFetchSilencesFanOut(t *testing.T) {
	for _, mode := range []string{"visible", "denied", "partial", "empty", "broken"} {
		t.Run(mode, func(t *testing.T) {
			var queried []string
			pa := silenceTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				ns := r.URL.Query().Get("namespace")
				if r.Header.Get("Authorization") != "Bearer caller-token" {
					t.Error("caller token not forwarded")
				}
				if ns == "" {
					w.WriteHeader(http.StatusForbidden)
					return
				}
				queried = append(queried, ns)
				if ns == "b" || mode == "denied" {
					w.WriteHeader(http.StatusForbidden)
					return
				}
				if mode == "broken" || (mode == "partial" && ns == "openshift-monitoring") {
					w.WriteHeader(http.StatusServiceUnavailable)
					return
				}
				if mode == "empty" {
					fmt.Fprint(w, `[]`)
					return
				}
				// Same ID visible through multiple namespaces must appear once.
				fmt.Fprint(w, `[{"id":"same","matchers":[]}]`)
			})
			got, warnings, err := pa.FetchSilences(WithBearerToken(context.Background(), "caller-token"), "")
			if err != nil {
				t.Fatal(err)
			}
			if strings.Join(queried, ",") != "a,b,openshift-monitoring" {
				t.Fatalf("not all namespaces queried: %v", queried)
			}
			expected := 1
			if mode == "denied" || mode == "empty" || mode == "broken" {
				expected = 0
			}
			if len(got) != expected {
				t.Fatalf("got %v", got)
			}
			if (mode == "partial" || mode == "broken") != (len(warnings) > 0) {
				t.Fatalf("warnings %v", warnings)
			}
		})
	}
}

func TestFetchSilencesExplicitNamespace(t *testing.T) {
	calls := 0
	pa := silenceTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Query().Get("namespace") != "a" {
			t.Errorf("namespace scope lost: %s", r.URL)
		}
		fmt.Fprint(w, `[]`)
	})
	got, _, err := pa.FetchSilences(WithBearerToken(context.Background(), "caller-token"), "a")
	if err != nil || got == nil || len(got) != 0 || calls != 1 {
		t.Fatalf("got %v error %v calls %d", got, err, calls)
	}
}

func TestFetchSilencesFailures(t *testing.T) {
	for _, body := range []string{"server-error", "invalid-json"} {
		t.Run(body, func(t *testing.T) {
			calls := 0
			pa := silenceTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
				calls++
				if body == "server-error" {
					w.WriteHeader(http.StatusInternalServerError)
				}
				fmt.Fprint(w, body)
			})
			if _, _, err := pa.FetchSilences(context.Background(), ""); err == nil {
				t.Fatal("expected error")
			}
			if calls != 1 {
				t.Fatal("unexpected fallback for a non-RBAC failure")
			}
		})
	}
}

func TestFetchSilencesSeparateUserWorkload(t *testing.T) {
	pa := silenceTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `[{"id":%q,"matchers":[]}]`, r.TLS.ServerName)
	})
	_, err := pa.coreClient.Services(UserWorkloadMonitoringNamespace).Create(context.Background(), &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: UserWorkloadAlertmanagerRouteName}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	for _, namespace := range []string{"a", ""} {
		// Explicit scope uses both tenancy hosts. Without a scope, the
		// platform uses its route and the unrouted UWM service fans out.
		got, warnings, err := pa.FetchSilences(context.Background(), namespace)
		if err != nil || len(warnings) != 0 || len(got) != 2 || got[0].ID == got[1].ID {
			t.Fatalf("namespace %q: got %v warnings %v error %v", namespace, got, warnings, err)
		}
	}
}

func TestFetchSilencesUnauthorized(t *testing.T) {
	for _, namespace := range []string{"", "a"} {
		t.Run(namespace, func(t *testing.T) {
			pa := silenceTestClient(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) })
			if _, _, err := pa.FetchSilences(context.Background(), namespace); !apierrors.IsUnauthorized(err) {
				t.Fatalf("expected authentication failure, got %v", err)
			}
		})
	}
}

func TestFetchSilencesDiscoveryFailure(t *testing.T) {
	pa := silenceTestClient(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusForbidden) })
	core := fake.NewClientset()
	core.PrependReactor("list", "namespaces", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("namespace discovery failed")
	})
	pa.coreClient = core.CoreV1()
	if _, _, err := pa.FetchSilences(context.Background(), ""); err == nil {
		t.Fatal("discovery failure must not look like an empty success")
	}
}

func TestFetchSilencesAllTenancyRequestsFail(t *testing.T) {
	pa := silenceTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("namespace") == "" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	if _, _, err := pa.FetchSilences(context.Background(), ""); err == nil {
		t.Fatal("expected a fatal error when all namespaces fail")
	}
}
