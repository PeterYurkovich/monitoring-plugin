#!/usr/bin/env bash
set -euo pipefail

# Create HTPasswd login for user1-user6 using the password "password".

for command in oc jq htpasswd; do
    command -v "$command" >/dev/null
done

umask 077
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
provider=my_htpasswd_provider
secret=htpass-secret

: >"$work_dir/users.htpasswd"
for index in {1..6}; do
    printf '%s\n' 'password' | htpasswd -i -B "$work_dir/users.htpasswd" "user$index"
done

oc create secret generic "$secret" -n openshift-config \
    --from-file="htpasswd=$work_dir/users.htpasswd" --dry-run=client -o yaml | oc apply -f -

oc patch oauth cluster --type=merge -p "$(
    oc get oauth cluster -o json | jq --arg provider "$provider" --arg secret "$secret" '{
      spec: {identityProviders: (
        [.spec.identityProviders[]? | select(.name != $provider)] +
        [{name: $provider, mappingMethod: "claim", type: "HTPasswd", htpasswd: {fileData: {name: $secret}}}]
      )}
    }'
)"
