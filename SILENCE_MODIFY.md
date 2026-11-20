# Silence create/edit compatibility with alert management v2

## Goal

Reuse the existing create, edit, and recreate silence pages from the new alert management UI. Add v2 URLs without removing legacy URLs, preserve prefilled alert labels, and switch the Console's active namespace to the alert's namespace **before navigating to create silence**.

This is an incremental integration, not a silence UI redesign or a migration to a new write API.

## Current implementation

- `config/alert-management-api.patch.json` registers a non-exact `/monitoring/v2` route. `web/src/features/alert-management-api/pages/AlertManagementRouter.tsx` then switches on exact path strings; unknown paths redirect to `/monitoring/v2/alerts`. Adding links alone will not make create/edit routes work.
- The v2 management tab links to `/monitoring/v2/management/silences`, but its content in `PlaceholderPages.tsx` is currently a placeholder.
- `AlertActions` in `web/src/features/alert-management-api/pages/alerts-page/alerts-table/AlertRow.tsx` renders “Silence alert”, but only logs the action. It is also used for individual alert rows inside expanded aggregates.
- Existing pages live in `web/src/features/alerts/pages/SilenceCreatePage.tsx` and `SilenceEditPage.tsx`. Their exported plugin wrappers provide `MonitoringProvider`; the inner page components are currently private.
- Create interprets every query parameter as an exact, non-regex label matcher. Existing links use `labelsToParams(alert.labels)`.
- Edit reads `:id`, loads silences through `useAlerts()`, and supplies the existing silence's defaults to `SilenceForm`. Expired silences use the recreate behavior.
- `web/src/shared/hooks/useMonitoringNamespace.ts` returns the developer route's `:ns`, or the Console active namespace, plus its setter. It **does not** synchronize a `namespace` query parameter, despite the comment in `SilenceCreatePage.tsx` suggesting otherwise.
- `SilenceForm.tsx` initializes matcher state at mount. For tenancy-scoped users it removes the incoming namespace matcher and adds the active namespace back on submission. Entering the form with the wrong active namespace can therefore change which namespace is silenced.
- On success the form refreshes legacy alert data and navigates to legacy silence details. Cancel uses browser history.

## Scope and URL contract

Use the existing v2 management hierarchy as the proposed canonical location:

| Operation | New URL |
| --- | --- |
| Blank create | `/monitoring/v2/management/silences/~new` |
| Silence a specific alert | `/monitoring/v2/management/silences/~new?<encoded alert labels>` |
| Edit/recreate | `/monitoring/v2/management/silences/:id/edit` |

For example, an alert in `team-a` can link to:

```text
/monitoring/v2/management/silences/~new?alertname=ExampleAlert&namespace=team-a
```

- Keep `/monitoring/silences/~new` and `/monitoring/silences/:id/edit` working unchanged.
- Preserve existing developer, virtualization, and ACM routes and their plugin/Prometheus contexts. The new alert management router currently exposes only the admin `/monitoring/v2` entry point; adding v2 implementations for other perspectives is outside this change.
- Do not globally change `SilenceResource.url`, which would also redirect existing list/detail navigation.
- Keep silence mutations on the existing Alertmanager endpoints with the existing RBAC/tenancy selection.
- Do not implement bulk silencing in this increment. An aggregate or selection can contain alerts from multiple namespaces; choosing a single namespace implicitly would be unsafe.

## Implementation plan

### 1. Route v2 create and edit to the existing pages

**Files:**

- `web/src/features/alert-management-api/pages/AlertManagementRouter.tsx`
- `web/src/features/alerts/pages/SilenceCreatePage.tsx`
- `web/src/features/alerts/pages/SilenceEditPage.tsx`

Steps:

1. Export the reusable inner create/edit page components from their defining files. Retain the existing MP/ACM wrappers and their exports for legacy extension code references. Import the inner components directly; do not add barrel files or re-export imports.
2. Replace the exact-path-only dispatch with route-aware matching that supports `:id`, for example React Router `Routes`/`Route`. Ensure `useParams()` inside edit receives the matched ID; matching a string manually without supplying route params is insufficient.
3. Add the create and edit/recreate routes above. Keep all existing v2 list/management/incidents routes and the unknown-path fallback intact.
4. Render the reused forms under the existing `AlertManagementProvider`, without nesting another plugin provider. Prefer standalone form pages, like legacy create/edit, rather than wrapping them in `AlertManagementLayout`, which adds unrelated alert-list polling and refresh controls. Existing list pages retain their layout.
5. Verify that the existing non-exact Console extension route reaches both new paths. Avoid adding another broad `/monitoring/v2` extension or changing unrelated dashboard/rule routes sharing that prefix.

### 2. Add explicit, version-aware silence link builders

**Files:**

- A focused utility under `web/src/features/alert-management-api/utils/` for v2 URLs.
- `web/src/shared/hooks/usePerspective.tsx` only if sharing a version-aware API is preferable to separate v2 builders.

Steps:

1. Provide builders for blank create, create from an alert, and edit/recreate by silence ID.
2. Reuse the existing label serialization contract. Preserve all alert labels and correctly encode spaces, `&`, `=`, Unicode, and other special characters.
3. Accept the labels required for prefill rather than requiring an unnecessarily specific full legacy alert object; `ManagedAlert` callers should not need unsafe casts.
4. Keep existing legacy URL builders unchanged by default. V2 callers must explicitly select v2 destinations; legacy callers must not move to v2 accidentally.
5. Do not append alert-list query state (`state`, `severity`, pagination, filters, etc.) to a create URL: the current create page would treat those values as label matchers. Use router state for optional return navigation, not arbitrary query parameters mixed with matcher labels.

### 3. Centralize namespace switching before alert-to-silence navigation

**Files:**

- A shared navigation hook, for example `web/src/shared/hooks/useSilenceAlertNavigation.ts`, if used by both old and new features.
- `web/src/features/alert-management-api/pages/alerts-page/alerts-table/AlertRow.tsx`
- Existing alert-specific entry points:
  - `web/src/features/alerts/pages/alerts-page/AlertTableRow.tsx`
  - `web/src/features/alerts/pages/AlertsDetailsPage.tsx`
  - `web/src/features/alerts/components/ActiveAlerts.tsx`

Steps:

1. Expose one alert-to-create action that receives the alert labels and the appropriate destination/version.
2. Read the namespace from `alert.labels.namespace`, not the currently selected namespace or an alert-list filter.
3. For a nonempty namespace different from the active namespace, call the Console namespace setter **before** navigating. Skip redundant updates when it already matches.
4. Build developer destinations using the alert's namespace as well, so the route's `:ns` cannot override the newly selected namespace with an old value.
5. If the alert has no namespace label, do not set an empty/undefined namespace or fabricate a namespace matcher. Preserve the existing selection and existing authorization behavior.
6. Wire v2 “Silence alert” to this action instead of `console.debug`. Reuse it in the existing entry points above while retaining their legacy destinations.
7. Verify the SDK setter's update behavior. If navigation can mount the form before the namespace update is observable, gate form mounting on the resolved namespace rather than relying on arbitrary delays. The setter must not be assumed to return a promise.
8. Keep namespace state changes in event handlers/hooks, never in pure URL builders or during rendering. Unrelated action-menu items are outside this change.

### 4. Make incoming links safe before form initialization

**Files:**

- `web/src/features/alerts/pages/SilenceCreatePage.tsx`
- `web/src/features/alerts/pages/SilenceEditPage.tsx`, as needed for edit link context.
- Focused wrapper/hook alongside the reused pages or v2 integration.

Steps:

1. Handle a direct visit, reload, or opened-in-new-tab create URL where no source click handler ran. For alert-prefilled links, synchronize the exact `namespace` label with the Console selection before mounting the form. Keep that label in the matcher defaults.
2. Correct the misleading query-namespace comment in `SilenceCreatePage.tsx`. Prefer local create-page synchronization over changing `useMonitoringNamespace()` globally, which would affect unrelated pages.
3. Blank create links must not force a namespace change. Preserve existing loading and access checks.
4. Ensure the form's initial matcher state is established only after namespace synchronization; updating the namespace after mounting is not sufficient because matcher initialization is stateful.
5. For edit/recreate links, preserve ID-based loading, loading/error/not-found states, and existing matcher semantics. If a namespaced edit link must carry context, use an explicit, documented edit-only namespace parameter and consume it before loading the legacy tenancy-scoped data. Do not infer a single namespace from a regex, negative matcher, or a multi-namespace silence.
6. Keep the same resource validation and RBAC failures. Client-side namespace switching is not authorization and must not bypass tenancy checks.

### 5. Preserve completion behavior and refresh both data systems

**Files:**

- `web/src/features/alerts/components/SilenceForm.tsx`
- V2 integration in `AlertManagementRouter.tsx` or a small wrapper/hook.
- `web/src/features/alert-management-api/hooks/useAlertManagementData.ts` for the existing query-key contract.

Steps:

1. Add a small optional success/navigation integration point to the existing form/pages if needed. Keep legacy behavior as the default; do not make the shared form depend directly on the alert-management feature or require a React Query provider on legacy routes.
2. For v2 mutations, invalidate the React Query silence data used by `useAlertManagementData`, in addition to preserving the legacy data refresh. Returning to v2 alerts must not leave stale silenced states.
3. **Initial success destination:** retain the existing legacy silence-details page. This is an intentional compatibility handoff because the v2 silence list is still a placeholder and no v2 silence-details page exists. Do not generate an unimplemented v2 detail URL or silently land on the router fallback.
4. Preserve Cancel's return-to-source behavior for in-app navigation. For direct-entry v2 pages without a meaningful in-app history entry, provide a deterministic fallback to `/monitoring/v2/alerts`. Any stored return destination must be an internal, validated route, not an arbitrary external URL.
5. Retain existing edit/recreate defaults and mutation semantics; this routing work should not redesign how Alertmanager edits silences.

## Validation plan

### Automated coverage

- **Routing:** create/edit render at v2 URLs; edit receives `:id`; query labels survive navigation; refresh/direct entry works; unknown routes still fall back; legacy routes remain available.
- **URL builders:** blank create, alert prefill, edit ID, and labels containing reserved characters. Legacy builders retain their current output.
- **Namespace handoff:** source namespace A to alert namespace B; All Projects to B; already-selected B; and alerts without a namespace. Assert setter-before-navigation order and that the mounted form observes B.
- **Direct links:** a prefilled namespace overrides stale Console selection before matcher state is initialized; blank create does not change selection; navigation-only state does not become matchers.
- **Form submission:** tenancy-scoped request namespace and the submitted exact namespace matcher both equal the alert namespace. Test unrestricted users separately to verify namespace synchronization does not force a tenancy endpoint or lose editable matchers.
- **Edit/recreate:** active/pending and expired silences, missing ID, load failures, and unsupported/ambiguous namespace context. Ensure existing defaults and explanatory messages remain intact.
- **Completion:** successful v2 save refreshes both data systems and reaches the intentionally supported legacy detail route; cancel returns to the source or the direct-entry fallback; failed saves remain on the form with an error.
- **Action integration:** clicking v2 “Silence alert” for both a normal row and an expanded aggregate child opens the correct prefilled page. Do not turn the existing bulk placeholder into an accidental single-alert action.

Co-locate unit/component tests with the modified modules. Extend Cypress coverage for the namespace-switching create flow and an edit/recreate deep-link flow; retain legacy create/edit regression coverage. Follow `web/cypress/CYPRESS_TESTING_GUIDE.md` before implementing Cypress changes.

### Manual smoke checks

1. With Console namespace A selected, silence an alert in B from v2 alerts. Confirm the selector changes to B, prefilled labels are correct, and saving creates the silence in B.
2. Repeat as a namespace-restricted user and from All Projects.
3. Open the same create URL directly with A selected, then refresh it. Confirm B is resolved before the form becomes editable.
4. Open v2 edit/recreate URLs directly for existing silences and exercise save, cancel, failure, and missing-resource states.
5. Confirm existing admin, developer, virtualization, and ACM silence links still route to the correct legacy forms/backends.
6. Confirm existing v2 alerts, incidents, management tabs, dashboards, and rule routes are not shadowed by the routing changes.

### Commands after implementation

```bash
make lint-frontend
cd web && npm run lint:tsc
# From the repository root:
make test-frontend
make test-translations
```

Run the selected Cypress specs against a configured Console/cluster after the automated unit/component checks. Backend changes are not expected for this increment.

## Acceptance criteria

- Both new create and edit/recreate URLs render the existing forms; legacy URLs continue working.
- “Silence alert” in v2 is functional, including for individual aggregate children.
- Alert-to-create navigation changes the active namespace before the form initializes, and submitted tenancy context matches that namespace.
- Direct create links preserve label prefill and safely resolve namespace context without relying on the source page having run.
- Save/cancel destinations are deliberate and supported; successful changes are reflected when returning to the v2 alerts UI.
- No new backend API, bulk-silence behavior, silence-list/detail redesign, or cross-perspective v2 rollout is introduced.
