#!/usr/bin/env bash
set -euo pipefail

# Give the following permissions
#    ns view                        silences
# user1 ns2, ns3             none
# user2 ns2, ns3             ns2 (read-only)
# user3 ns1, ns2, ns3, ns4   ns2 (edit), ns3 (read-only)
# user4 ns1, ns2, ns3, ns4   ns1, ns2, ns3 (edit)
#
# --reset removes ALL direct RBAC grants for user1-user4

if [[ $# -gt 1 || ($# -eq 1 && $1 != --reset) ]]; then
    echo "Usage: $0 [--reset]" >&2
    exit 1
fi

ns1=openshift-monitoring
ns2=openshift-cluster-observability-operator
ns3=default
ns4=kube-system

printf 'Using context: %s\n' "$(oc config current-context)"

if [[ ${1:-} == --reset ]]; then
    for resource in rolebindings clusterrolebindings; do
        bindings=$(oc get "$resource" --all-namespaces -o json | jq '
      def test_user: .kind == "User" and (.name | IN("user1", "user2", "user3", "user4"));
      .items |= map(select(any(.subjects[]?; test_user))) |
      .items[].subjects |= map(select(test_user | not))
    ')
        if [[ $(printf '%s' "$bindings" | jq '.items | length') -gt 0 ]]; then
            printf '%s' "$bindings" | oc replace -f -
        fi
    done
fi

grant() {
    local user=$1 role=$2 namespace
    shift 2
    for namespace in "$@"; do
        oc adm policy add-role-to-user "$role" "$user" --namespace="$namespace" \
            --rolebinding-name="silence-test-${role}-${user}"
    done
}

grant user1 view "$ns2" "$ns3"
grant user2 view "$ns2" "$ns3"
grant user2 monitoring-rules-view "$ns2"
grant user3 view "$ns1" "$ns2" "$ns3" "$ns4"
grant user3 monitoring-rules-edit "$ns2"
grant user3 monitoring-rules-view "$ns3"
grant user4 view "$ns1" "$ns2" "$ns3" "$ns4"
grant user4 monitoring-rules-edit "$ns1" "$ns2" "$ns3"
