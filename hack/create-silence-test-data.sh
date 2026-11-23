#!/usr/bin/env bash
set -euo pipefail

# Creates active, pending, and expired silences in:
# - openshift-monitoring
# - openshift-cluster-observability-operator
# - default
# - kube-system
# Also creates an active ClusterNotUpgradeable silence in openshift-cluster-version.

local_port=19094

umask 077
work_dir=$(mktemp -d)
port_forward_pid=
release_resources() {
    if [[ -n "$port_forward_pid" ]]; then
        kill "$port_forward_pid" 2>/dev/null || true
        wait "$port_forward_pid" 2>/dev/null || true
    fi
    rm -rf "$work_dir"
}
trap release_resources EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Keep the bearer token out of curl's command-line arguments and logs
token=$(oc whoami --show-token)
[[ -n "$token" ]] || {
    echo 'An oc login with a bearer token is required.' >&2
    exit 1
}
printf 'header = "Authorization: Bearer %s"\n' "$token" >"$work_dir/curl.conf"
unset token

oc -n openshift-monitoring port-forward --address=127.0.0.1 \
    svc/alertmanager-main "$local_port:9094" >"$work_dir/port-forward.log" 2>&1 &
port_forward_pid=$!
base_url="https://127.0.0.1:$local_port/api/v2"

api() {
    local method=$1 path=$2
    shift 2
    # The service certificate does not cover 127.0.0.1. The connection is restricted
    # to loopback and tunneled by oc through the authenticated Kubernetes API.
    curl --silent --show-error --fail-with-body --insecure --noproxy '*' \
        --connect-timeout 2 --max-time 20 --config "$work_dir/curl.conf" \
        --request "$method" "$base_url/$path" "$@"
}

ready=false
for ((attempt = 0; attempt < 30; attempt++)); do
    if ! kill -0 "$port_forward_pid" 2>/dev/null; then
        echo "Port-forward exited; check permissions and whether port $local_port is already in use." >&2
        exit 1
    fi
    if api GET status --max-time 2 >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
[[ "$ready" == true ]] || {
    echo 'Alertmanager did not become accessible.' >&2
    exit 1
}

created_by=monitoring-plugin-silence-test
now_seconds=$(date +%s)
seed() {
    local namespace=$1 state=$2 alert_names=$3
    local comment="Silence RBAC test: $namespace / $state / $alert_names"
    local start_seconds end_seconds body id
    start_seconds=$((now_seconds - 60))
    end_seconds=$((now_seconds + 7200))
    if [[ "$state" == pending ]]; then
        start_seconds=$((now_seconds + 3600))
    fi
    body=$(jq -n --arg namespace "$namespace" --arg alerts "$alert_names" \
        --arg comment "$comment" --arg creator "$created_by" \
        --argjson start "$start_seconds" --argjson end "$end_seconds" '{
      matchers: [
        {name: "namespace", value: $namespace, isRegex: false, isEqual: true},
        {name: "alertname", value: $alerts, isRegex: true, isEqual: true}
      ],
      startsAt: ($start | strftime("%Y-%m-%dT%H:%M:%SZ")),
      endsAt: ($end | strftime("%Y-%m-%dT%H:%M:%SZ")),
      createdBy: $creator,
      comment: $comment
    }')
    id=$(api POST silences --header 'Content-Type: application/json' --data-binary "$body" | jq -er '.silenceID')

    if [[ "$state" == expired ]]; then
        # Alertmanager rejects creation with an end time in the past. Create, then expire.
        api DELETE "silence/$id" >/dev/null
    fi
}

for namespace in openshift-monitoring openshift-cluster-observability-operator default kube-system; do
    for state in active pending expired; do
        seed "$namespace" "$state" '^(Watchdog|ClusterNotUpgradeable)$'
    done
done

seed openshift-cluster-version active '^ClusterNotUpgradeable$'
