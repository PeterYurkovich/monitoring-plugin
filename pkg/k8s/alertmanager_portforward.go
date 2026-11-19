package k8s

import (
	"context"
	"fmt"
	"net/http"
)

func (pa *prometheusAlerts) alertmanagerTenancyHTTPClient(ctx context.Context, alertmanagerNamespace, alertmanagerName string) (*http.Client, error) {
	if !hasOutOfClusterKubeconfig() {
		return pa.createHTTPClient()
	}
	tunnel := &pa.platformAlertmanagerTunnel
	instance := "main"
	if alertmanagerNamespace == UserWorkloadMonitoringNamespace {
		tunnel = &pa.userWorkloadAlertmanagerTunnel
		instance = "user-workload"
	}
	podLabelSelector := fmt.Sprintf("app.kubernetes.io/name=alertmanager,app.kubernetes.io/instance=%s", instance)
	localAddress, err := tunnel.address(alertmanagerName, func(onEnd func(error)) (string, error) {
		return pa.openServicePortForward(ctx, alertmanagerNamespace, podLabelSelector, alertmanagerTenancyPort, onEnd)
	})
	if err != nil {
		return nil, err
	}
	return pa.portForwardHTTPClient(ctx, localAddress)
}
