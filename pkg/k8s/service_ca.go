package k8s

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	// openshift-config-managed/openshift-service-ca.crt publishes the
	// cluster service CA under ca-bundle.crt (service-ca-operator
	// BundleDataKey). Injected copies use service-ca.crt.
	openshiftServiceCANamespace   = "openshift-config-managed"
	openshiftServiceCAConfigMap   = "openshift-service-ca.crt"
	openshiftServiceCABundleKey   = "ca-bundle.crt"
	openshiftServiceCAInjectedKey = "service-ca.crt"
)

func (pa *prometheusAlerts) outOfClusterServiceTLSConfig(ctx context.Context) (*tls.Config, error) {
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}

	pemBytes, pemErr := pa.loadOutOfClusterServiceCA(ctx)
	if pemErr == nil && !pool.AppendCertsFromPEM(pemBytes) {
		pemErr = fmt.Errorf("parse service CA from configmap %s/%s", openshiftServiceCANamespace, openshiftServiceCAConfigMap)
	}

	_, fileRequired := serviceCAFilePath()
	if fileRequired {
		if err := appendServiceCA(pool); err != nil {
			return nil, err
		}
		if pemErr != nil {
			pa.serviceCAFallbackWarningOnce.Do(func() {
				prometheusLog.WithError(pemErr).Warn("using MONITORING_PLUGIN_SERVICE_CA_FILE without the cluster service CA configmap")
			})
		}
	} else if pemErr != nil {
		return nil, pemErr
	}

	return &tls.Config{
		MinVersion: tls.VersionTLS12,
		RootCAs:    pool,
	}, nil
}

func (pa *prometheusAlerts) loadOutOfClusterServiceCA(ctx context.Context) ([]byte, error) {
	pa.serviceCAMu.Lock()
	defer pa.serviceCAMu.Unlock()

	if len(pa.serviceCAPEM) > 0 && time.Now().Before(pa.serviceCAExpiresAt) {
		return append([]byte(nil), pa.serviceCAPEM...), nil
	}
	if pa.coreClient == nil {
		return nil, fmt.Errorf("core client is not configured")
	}

	configMap, err := pa.coreClient.ConfigMaps(openshiftServiceCANamespace).Get(ctx, openshiftServiceCAConfigMap, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get service CA configmap %s/%s: %w", openshiftServiceCANamespace, openshiftServiceCAConfigMap, err)
	}
	pemBytes, err := serviceCAFromConfigMapData(configMap.Data)
	if err != nil {
		return nil, err
	}
	pa.serviceCAPEM = pemBytes
	pa.serviceCAExpiresAt = time.Now().Add(serviceCACacheTTL)
	return append([]byte(nil), pemBytes...), nil
}

func serviceCAFromConfigMapData(data map[string]string) ([]byte, error) {
	for _, key := range []string{openshiftServiceCABundleKey, openshiftServiceCAInjectedKey} {
		pemData := data[key]
		if strings.Contains(pemData, "BEGIN CERTIFICATE") {
			return []byte(pemData), nil
		}
	}
	return nil, fmt.Errorf("configmap %s/%s has no service CA certificate", openshiftServiceCANamespace, openshiftServiceCAConfigMap)
}
