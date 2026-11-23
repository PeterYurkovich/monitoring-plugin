## Alert Management Notes

This document covers alert management behavior and prerequisites for the monitoring plugin.

For metrics, client certificate authentication, and operator prerequisites, see
[Backend metrics](metrics.md).

### User workload monitoring prerequisites

To include **user workload** alerts and rules in `/api/v1/alerting/alerts` and `/api/v1/alerting/rules`, the user workload monitoring stack must be enabled. Follow the OpenShift documentation for enabling and configuring UWM:

https://docs.redhat.com/en/documentation/monitoring_stack_for_red_hat_openshift/4.20/html/configuring_user_workload_monitoring/configuring-alerts-and-notifications-uwm

#### How the plugin reads user workload alerts/rules

The plugin prefers **Thanos tenancy** for user workload alerts/rules (RBAC-scoped, requires a namespace parameter). When the client does not provide a `namespace` filter, the plugin discovers candidate namespaces and queries Thanos tenancy per-namespace, using the end-user bearer token.

Routes in `openshift-user-workload-monitoring` are treated as **fallbacks** (and are also used for some health checks and pending state retrieval).

If you want to create the user workload Prometheus route (optional), you can expose the service:

```shell
oc -n openshift-user-workload-monitoring expose svc/prometheus-user-workload-web --name=prometheus-user-workload-web --port=web
```

If the route is missing/unreachable but tenancy is healthy, the plugin should still return user workload data and suppress route warnings.

#### Alert states

- `/api/v1/alerting/alerts?state=pending`: pending alerts come from Prometheus.
- `/api/v1/alerting/alerts?state=firing`: firing alerts come from Alertmanager when available.
- `/api/v1/alerting/alerts?state=silenced`: silenced alerts come from Alertmanager (requires an Alertmanager endpoint).

### Alertmanager routing choices

OpenShift supports routing user workload alerts to:

- The **platform Alertmanager** (default instance)
- A **separate Alertmanager** for user workloads
- **External Alertmanager** instances

This is a cluster configuration choice and does not change the plugin API shape. The plugin reads alerts from Alertmanager (for firing/silenced) and Prometheus (for pending), then merges platform and user workload results when available.

The plugin intentionally reads from only the in-cluster Alertmanager endpoints. Supporting multiple external Alertmanagers would introduce ambiguous alert state and silencing outcomes because each instance can apply different routing, inhibition, and silence configurations.

### Reading silences in the frontend

The silences page reads Alertmanager directly; no Management API silences endpoint
is needed because the frontend does not add backend metadata.

`useSilencesQuery` runs one aggregate TanStack Query:

1. Try the non-tenancy Alertmanager silences endpoint.
2. On failure, list accessible OpenShift Projects using the Console SDK's
   `k8sListItems`. Project names identify accessible namespaces, including for users
   who cannot list cluster-scoped Namespace resources.
3. Query each namespace's tenancy endpoint in parallel with `Promise.allSettled`.
   Wait for every request, merge successful responses, and deduplicate by silence ID.

An empty successful namespace response counts as success. Individual namespace
failures are treated as RBAC checks, not aggregate errors. If every namespace
request fails, the query fails; project discovery failures also fail the query.
An empty project list rethrows the original non-tenancy error because no silences
request has succeeded.

The initial query stays loading throughout discovery and fanout. Refetches retain
cached data and expose `isFetching`, following TanStack Query's normal background
refresh behavior. The query's abort signal is passed to all requests; cancellation
must not initiate fallback or publish partial results. Automatic retries are disabled
so expected authorization failures do not repeat the entire fanout. Polling and
explicit refetches run the complete sequence again.

#### TanStack Query research

This repository uses TanStack Query v4:

- [Dependent queries](https://tanstack.com/query/v4/docs/framework/react/guides/dependent-queries):
  use `enabled` for separately cached sequential queries; a dynamic `useQueries`
  list can depend on a discovery query.
- [Parallel queries](https://tanstack.com/query/v4/docs/framework/react/guides/parallel-queries):
  use `useQueries` when the number of independently cached queries changes.
- [Query functions](https://tanstack.com/query/v4/docs/framework/react/guides/query-functions):
  any promise-returning async function is supported. This implementation uses one
  query function because consumers need one combined result and one loading/error
  lifecycle, rather than separate namespace caches and status aggregation.
- [Query cancellation](https://tanstack.com/query/v4/docs/framework/react/guides/query-cancellation):
  pass the same abort signal to all underlying requests. The documentation also
  demonstrates fanout within one query function. Here `Promise.allSettled` replaces
  fail-fast `Promise.all` to implement partial-success semantics.

### Managing alert rules via the Management API

| Operation | Single | Bulk |
|---|---|---|
| Create | `POST /api/v1/alerting/rules` | n/a |
| Update (labels, drop/restore, classification) | `PATCH /api/v1/alerting/rules/{ruleId}` | `PATCH /api/v1/alerting/rules` |
| Delete | `DELETE /api/v1/alerting/rules/{ruleId}` | `DELETE /api/v1/alerting/rules` |

**Single update** (`PATCH /rules/{ruleId}`):
- Request body uses `UpdateAlertRuleRequest` (labels and/or classification, or
  `alertingRuleEnabled` alone for drop/restore).
- Success: HTTP `200` with `UpdateAlertRuleResult` (`statusCode: 204`). The
  returned `id` may differ from the path `ruleId` when labels change the stable ID.
- Failure: standard `ErrorResponse` with the corresponding HTTP status
  (400/401/403/404/405/409/413/500). Errors include a message so callers can act on them.
- Non-atomic combined updates: when both `classification` and `labels` are set,
  classification is applied first, then labels. If the label step fails, the
  classification change may already be persisted and the request still returns
  an error. Retry or inspect cluster state before re-applying classification.

**Bulk update** (`PATCH /rules`):
- Request body includes `ruleIds` (1–100) plus the same mutation fields.
- Always returns HTTP `200` with per-rule `statusCode`/`message` entries so
  partial success is visible.
- Same non-atomic classification-then-labels behavior as single update; a failed
  label step is reported on that rule's result while classification may remain.

**Single delete** (`DELETE /rules/{ruleId}`):
- Success: HTTP `204`.
- Failure: `ErrorResponse` with HTTP status (400/401/403/404/405/409/500).

**Bulk delete** (`DELETE /rules`):
- Request body includes `ruleIds` (1–100).
- Always returns HTTP `200` with per-rule results.

### Managing user-defined alert rules

| Rule ownership | Editable? | Classification? | Drop/Restore? |
|---|---|---|---|
| User-owned | Yes (direct PR mutation) | Yes (set labels directly) | No (ARC not supported) |
| Operator-managed | No (reconciled) | No | No |
| GitOps-managed | No (reconciled) | No | No |

**User-owned** rules can be fully edited (labels, severity, expr, annotations)
via the update API, which mutates the PrometheusRule directly.

**Operator-managed** and **GitOps-managed** user-defined rules cannot be edited
because the owning controller would reconcile the change. These alerts can only
be **silenced** via Alertmanager silences.

ARC-based operations (classification overrides, drop/restore) are not available
for any user-defined rule because the user workload stack does not process
AlertRelabelConfigs. If this capability is needed, open an RFE against CMO.
