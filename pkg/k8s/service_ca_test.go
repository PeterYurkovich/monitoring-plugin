package k8s

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestServiceCAFromConfigMapData(t *testing.T) {
	bundle := "-----BEGIN CERTIFICATE-----\nbundle\n-----END CERTIFICATE-----\n"
	injected := "-----BEGIN CERTIFICATE-----\ninjected\n-----END CERTIFICATE-----\n"

	got, err := serviceCAFromConfigMapData(map[string]string{
		openshiftServiceCABundleKey:   bundle,
		openshiftServiceCAInjectedKey: injected,
	})
	if err != nil {
		t.Fatalf("prefer bundle key: %v", err)
	}
	if string(got) != bundle {
		t.Fatalf("got %q, want bundle key", got)
	}

	got, err = serviceCAFromConfigMapData(map[string]string{
		openshiftServiceCAInjectedKey: injected,
	})
	if err != nil {
		t.Fatalf("injected key: %v", err)
	}
	if string(got) != injected {
		t.Fatalf("got %q, want injected key", got)
	}

	if _, err := serviceCAFromConfigMapData(map[string]string{
		openshiftServiceCABundleKey: "not a certificate",
	}); err == nil {
		t.Fatal("expected error when no certificate is present")
	}
}

func TestLoadOutOfClusterServiceCAFromConfigMap(t *testing.T) {
	pemData := "-----BEGIN CERTIFICATE-----\nfrom-api\n-----END CERTIFICATE-----\n"
	client := fake.NewClientset(&corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      openshiftServiceCAConfigMap,
			Namespace: openshiftServiceCANamespace,
		},
		Data: map[string]string{openshiftServiceCABundleKey: pemData},
	})
	pa := &prometheusAlerts{coreClient: client.CoreV1()}

	got, err := pa.loadOutOfClusterServiceCA(context.Background())
	if err != nil {
		t.Fatalf("fetch service CA: %v", err)
	}
	if string(got) != pemData {
		t.Fatalf("got %q", got)
	}

	pa.coreClient = nil
	got, err = pa.loadOutOfClusterServiceCA(context.Background())
	if err != nil {
		t.Fatalf("cached service CA: %v", err)
	}
	if string(got) != pemData {
		t.Fatalf("cached got %q", got)
	}

	pa.coreClient = client.CoreV1()
	configMap, err := client.CoreV1().ConfigMaps(openshiftServiceCANamespace).Get(context.Background(), openshiftServiceCAConfigMap, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get service CA configmap: %v", err)
	}
	configMap.Data[openshiftServiceCABundleKey] = "-----BEGIN CERTIFICATE-----\nrotated\n-----END CERTIFICATE-----\n"
	if _, err := client.CoreV1().ConfigMaps(openshiftServiceCANamespace).Update(context.Background(), configMap, metav1.UpdateOptions{}); err != nil {
		t.Fatalf("rotate service CA: %v", err)
	}
	pa.serviceCAExpiresAt = time.Now().Add(-time.Second)
	got, err = pa.loadOutOfClusterServiceCA(context.Background())
	if err != nil {
		t.Fatalf("refresh service CA: %v", err)
	}
	if string(got) != configMap.Data[openshiftServiceCABundleKey] {
		t.Fatalf("refreshed got %q", got)
	}
}
