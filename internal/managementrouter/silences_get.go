package managementrouter

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/openshift/monitoring-plugin/pkg/k8s"
)

func (hr *httpRouter) GetSilences(w http.ResponseWriter, req *http.Request, _ GetSilencesParams) {
	query := req.URL.Query()
	for key, values := range query {
		if key != "namespace" || len(values) != 1 {
			writeError(w, http.StatusBadRequest, "only a single namespace query parameter is supported")
			return
		}
	}
	silences, warnings, err := hr.managementClient.GetSilences(req.Context(), strings.TrimSpace(query.Get("namespace")))
	if err != nil {
		handleError(w, err)
		return
	}
	if silences == nil {
		silences = []k8s.Silence{}
	}
	resp := GetSilencesResponse{}
	resp.Data.Silences = silences
	if len(warnings) > 0 {
		resp.Warnings = &warnings
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.WithError(err).Warn("failed to encode silences response")
	}
}
