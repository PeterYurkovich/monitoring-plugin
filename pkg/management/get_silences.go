package management

import (
	"context"

	"github.com/openshift/monitoring-plugin/pkg/k8s"
)

func (c *client) GetSilences(ctx context.Context, namespace string) ([]k8s.Silence, []string, error) {
	return c.k8sClient.PrometheusAlerts().FetchSilences(ctx, namespace)
}
