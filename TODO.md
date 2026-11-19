# GET silences implementation plan

- [x] Define `GET /api/v1/alerting/silences` and its un-enriched Alertmanager silence response in OpenAPI; regenerate Go and TypeScript bindings.
- [x] Implement retrieval from platform and optional user-workload Alertmanagers with the requesting user's token. Try cluster-wide access first; on RBAC denial, query the namespace tenancy endpoint for every namespace (including namespaces without rules). Support an explicit namespace filter, deduplicate fan-out results, and surface partial failures as warnings.
- [x] Reuse the existing authenticated HTTP/TLS and out-of-cluster port-forward support for Alertmanager tenancy.
- [x] Wire the management client and HTTP handler with authentication, validation, empty-array responses, and no enrichment.
- [x] Add backend unit tests for routing, fan-out, RBAC isolation, deduplication, errors, token forwarding, and the HTTP contract.
- [x] Add real-cluster Go e2e coverage for admin access and namespace-scoped / unprivileged access, creating and cleaning up test silences.
- [x] Document the API and run relevant generation, unit, lint, and e2e checks where the environment permits; record any unavailable checks.

## Validation

- `make generate-openapi`: passed (Go and TypeScript bindings regenerated).
- `make test-backend`: passed.
- `go test -race ./pkg/k8s ./pkg/management ./internal/managementrouter`: passed.
- `make test-frontend`: passed (94 files, 1117 tests).
- `make lint-frontend`: passed.
- `PATH=/usr/local/go/bin:$PATH make lint-backend`: passed. The default Go 1.27 toolchain crashes the installed Go 1.26-built linter; the compatible Go 1.26 toolchain works.
- Extra e2e-tag lint check: blocked by three existing unchecked `resp.Body.Close` calls in `test/e2e/create_alert_rule_test.go` and `test/e2e/delete_alert_rule_test.go`; no findings in the new test.
- E2E binary compilation: passed with `go test -c -tags=e2e -o /tmp/monitoring-silences-e2e.test ./test/e2e`.
- Live e2e execution: blocked; `KUBECONFIG` and `PLUGIN_URL` are not configured. TestMain fails before any tests run without cluster configuration.
- `make test-translations`: extraction succeeded and changed no translations; the script nevertheless exits 1 because it checks the entire working tree for uncommitted changes.
- `git diff --check`: passed.

To run the new live-cluster test after configuring the environment:

```sh
go test -tags=e2e -v -timeout=15m -run '^TestRBAC_GetSilences$' ./test/e2e
```
