package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const alertmanagerSilencesPath = "/api/v2/silences"
const alertmanagerTenancyPort = 9092

// Silence is an Alertmanager v2 silence, returned without enrichment.
type Silence struct {
	ID        string           `json:"id"`
	Matchers  []SilenceMatcher `json:"matchers"`
	StartsAt  time.Time        `json:"startsAt"`
	EndsAt    time.Time        `json:"endsAt"`
	UpdatedAt time.Time        `json:"updatedAt"`
	CreatedBy string           `json:"createdBy"`
	Comment   string           `json:"comment"`
	Status    SilenceStatus    `json:"status"`
}

type SilenceMatcher struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	IsRegex bool   `json:"isRegex"`
	IsEqual *bool  `json:"isEqual,omitempty"`
}

type SilenceStatus struct {
	State string `json:"state"`
}

// FetchSilences tries cluster-wide access before falling back to namespace
// tenancy. Namespace discovery uses the plugin's client; every Alertmanager
// request is authorized independently using the caller's bearer token.
func (pa *prometheusAlerts) FetchSilences(ctx context.Context, namespace string) ([]Silence, []string, error) {
	sources := []struct{ namespace, name string }{
		{ClusterMonitoringNamespace, PlatformAlertmanagerRouteName},
		{UserWorkloadMonitoringNamespace, UserWorkloadAlertmanagerRouteName},
	}
	out := make([]Silence, 0)
	var warnings []string
	successes := 0
	var lastErr error
	for i, source := range sources {
		// A separate user-workload Alertmanager is optional.
		if i > 0 {
			if pa.coreClient == nil {
				continue
			}
			_, err := pa.coreClient.Services(source.namespace).Get(ctx, source.name, metav1.GetOptions{})
			if apierrors.IsNotFound(err) {
				continue
			}
			if err != nil {
				lastErr = err
				warnings = append(warnings, fmt.Sprintf("%s: %v", source.name, err))
				continue
			}
		}
		silences, sourceWarnings, err := pa.fetchAlertmanagerSilences(ctx, source.namespace, source.name, namespace)
		warnings = append(warnings, sourceWarnings...)
		if err != nil {
			if apierrors.IsUnauthorized(err) {
				return nil, nil, err
			}
			lastErr = err
			warnings = append(warnings, fmt.Sprintf("%s: %v", source.name, err))
			continue
		}
		successes++
		out = append(out, silences...)
	}
	if successes == 0 && lastErr != nil {
		return nil, nil, lastErr
	}
	return out, warnings, nil
}

func (pa *prometheusAlerts) fetchAlertmanagerSilences(ctx context.Context, alertmanagerNamespace, alertmanagerName, namespaceFilter string) ([]Silence, []string, error) {
	if namespaceFilter == "" {
		silences, err := pa.getAlertmanagerSilences(ctx, alertmanagerNamespace, alertmanagerName, "")
		// A separate UWM Alertmanager may have no exposed route. Its
		// namespace tenancy API is still available through the service.
		if !isForbiddenResponse(err) && !apierrors.IsNotFound(err) {
			return silences, nil, err
		}
	}
	namespaces := []string{namespaceFilter}
	if namespaceFilter == "" {
		if pa.coreClient == nil {
			return nil, nil, fmt.Errorf("core client is not configured")
		}
		namespaceList, err := pa.coreClient.Namespaces().List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, nil, fmt.Errorf("discover silence namespaces: %w", err)
		}
		namespaces = make([]string, 0, len(namespaceList.Items))
		for _, ns := range namespaceList.Items {
			namespaces = append(namespaces, ns.Name)
		}
		sort.Strings(namespaces)
	}
	out := make([]Silence, 0)
	seenSilenceIDs := map[string]bool{}
	var warnings []string
	var lastErr error
	successes := 0
	for _, ns := range namespaces {
		silences, err := pa.getAlertmanagerSilences(ctx, alertmanagerNamespace, alertmanagerName, ns)
		if apierrors.IsUnauthorized(err) {
			return nil, nil, err
		}
		if isForbiddenResponse(err) {
			successes++
			continue
		}
		if err != nil {
			lastErr = err
			warnings = append(warnings, fmt.Sprintf("%s namespace %s: %v", alertmanagerName, ns, err))
			continue
		}
		successes++
		for _, silence := range silences {
			if !seenSilenceIDs[silence.ID] {
				seenSilenceIDs[silence.ID] = true
				out = append(out, silence)
			}
		}
	}
	if successes == 0 && lastErr != nil {
		return nil, nil, lastErr
	}
	return out, warnings, nil
}

func (pa *prometheusAlerts) getAlertmanagerSilences(ctx context.Context, alertmanagerNamespace, alertmanagerName, namespaceFilter string) ([]Silence, error) {
	var responseBody []byte
	var err error
	if namespaceFilter == "" {
		responseBody, err = pa.getMonitoringRouteResponse(ctx, alertmanagerNamespace, alertmanagerName, alertmanagerSilencesPath)
	} else {
		requestURL := fmt.Sprintf("https://%s.%s.svc:%d%s?namespace=%s", alertmanagerName, alertmanagerNamespace, alertmanagerTenancyPort, alertmanagerSilencesPath, url.QueryEscape(namespaceFilter))
		var client *http.Client
		client, err = pa.alertmanagerTenancyHTTPClient(ctx, alertmanagerNamespace, alertmanagerName)
		if err == nil {
			responseBody, err = pa.executeRequest(ctx, client, requestURL)
		}
	}
	if err != nil {
		if httpErr, ok := err.(*upstreamHTTPError); ok && httpErr.statusCode == http.StatusUnauthorized {
			return nil, apierrors.NewUnauthorized("Alertmanager authentication failed")
		}
		return nil, err
	}
	silences := make([]Silence, 0)
	if err := json.Unmarshal(responseBody, &silences); err != nil {
		return nil, fmt.Errorf("decode alertmanager silences: %w", err)
	}
	if silences == nil {
		silences = []Silence{}
	}
	return silences, nil
}
