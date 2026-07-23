# Devlog

Newest entry first. One entry per build-room session. Keep entries short —
this file is read at the start of every session, so token economy matters.

Template:

```
## Session N — YYYY-MM-DD — <prompt block>
**Built:** what actually got done (files/components, 2–4 lines)
**Deviations:** anything that differs from the build spec, and why
**Decisions:** IDs logged to docs/decisions.md, or "none"
**Next:** the single next prompt block
**Issues:** open bugs / TODOs, or "—"
```

---

## Session 12 — 2026-07-23 — 5.11 Global search
**Built:** fleshed out `SearchDropdown` into the real global search (rendered in
the super_admin topbar per D-016). Debounced query → `useSearch` → grouped
dropdown: Organizations / Namespaces / Connectors, ≤3 each, with type icon
(Building2/Layers/Plug), name + breadcrumb. Full keyboard nav (↑/↓ wrap across
groups, Enter navigates, Escape closes + refocuses), outside-click close,
"No results"/"Searching…" states. Reshaped `searchAll` to return grouped
`SearchResults` incl. connectors (new `CONNECTOR_DEFS` constant, indexed across
cloud orgs + namespaces); connector rows deep-link to the Connectors tab via
`?tab=connectors`, which the two tabbed detail pages now read as their initial
tab. Kept the `onSearch` filter-input mode so the customer-list pages still work.
typecheck/lint/build all green.
**Deviations:** connectors indexed from cloud orgs + namespaces (on-prem org
detail has no Connectors tab) — see D-020.
**Decisions:** D-020, D-021
**Next:** 5.12 — Polish pass
**Issues:** —

## Session 11 — 2026-07-23 — 5.10 AI Credits card
**Built:** an `AiCreditsCard` added once to the shared DetailTabs Overview, so it
renders for both the cloud org detail and the on-prem namespace detail, scoped by
whichever id the container passed to `useAiCredits`. Card: "AI Credits", large
`used / limit credits used` fraction, reused ProgressBar (amber ≥70 / red ≥90)
that fills 0→value over 600ms on mount, "Resets on {date}", and a top-5 consumers
DataTable (workflow + credits + % of total). super_admin-only inline "Edit limit"
updates ephemeral local state (D-009). Removed the old mini "AI Credits Used" stat
card (stat row now 3 cards). Extended `fetchAiCredits` to scope namespace ids and
added `topConsumers` to AiCredits; ProgressBar gained an optional `durationMs`.
typecheck/lint/build all green.
**Deviations:** replaced the mini credits stat card rather than keeping both
(D-018).
**Decisions:** D-018, D-019
**Next:** 5.11 — Global search
**Issues:** —

## Session 10 — 2026-07-23 — 5.9 Feature flags slide-over panel
**Built:** one reusable `components/FeatureFlagsPanel.tsx` (wraps SlideOver,
400px, Escape/outside-click close). Header "Feature Flags — {Org}" or "Global
Feature Flags". Rows: label + description + Toggle + scope badge (Global/Org/
Namespace); changed rows get a yellow background; Save disabled until a change,
pinned at the bottom. Wired all three triggers: the org-detail Edit-flags button,
the cloud + on-prem customer-list flag icons, and the /feature-flags page (now a
real global view). `fetchFeatureFlags(orgId?)` / `useFeatureFlags(orgId?)`:
global pool with no orgId, cloud orgs hide namespace-scoped flags. Independent
skeleton + error/Retry. typecheck/lint/build all green.
**Deviations:** Save console-logs the diff only, no persistence (see D-017).
**Decisions:** D-017
**Next:** 5.10 — AI Credits card
**Issues:** —

## Session 9 — 2026-07-23 — 5.8 On-prem customer admin view
**Built:** onprem_customer_admin experience scoped to their org. Extracted nav
into `config/navigation.tsx` (+ `homeRoute`); sidebar gains Dashboard/Namespaces.
Topbar shows the org name for customer roles and hides global search for
non-super_admin. New reusable `AccessDenied` + route-level `OrgScopeGuard`
(:orgId vs user.orgId) wrapping the cloud/onprem detail + namespace routes;
removed the D-012 inline check from NamespaceDetailPage. Extracted
`components/onprem/NamespaceClusters.tsx` (cluster tables + upgrade/env/add
interactions) shared by the 5.6 org page (now a thin header) and the new
customer `NamespacesPage`. On-prem `DashboardPage` renders a namespace summary
card grid. Settings gains a read-only org-profile card for customer roles.
typecheck/lint/build all green.
**Deviations:** 5.6 header summary now uses server namespace count, not the live
post-add local count (state moved into NamespaceClusters) — see D-015.
**Decisions:** D-014, D-015, D-016
**Next:** 5.9 — Feature flags slide-over panel
**Issues:** —

## Session 8 — 2026-07-22 — 5.7 Namespace detail (6 tabs inc. env vars)
**Built:** `/onprem-customers/:orgId/namespaces/:namespaceId`. Extracted the 5.5
tab sections into shared, presentational `components/detail/DetailTabs.tsx` —
each takes `QueryLike` props; renamed `CloudOrgMetrics → DetailMetrics`, added
`DetailCharts`. Cloud page rewired as a thin container (behaviour-identical);
namespace page reuses the same 5 sections via namespace-scoped fetchers
(`fetchNamespaceMetrics`, `apiCallsTrend`/`latestVersion` added to
NamespaceDetail; normalized chart selector hooks). New Environment Variables tab:
bespoke table with inline add/edit form rows + delete-confirm Modal, all local
state (D-009); secrets masked ●●●●●● on mount, reveal only on explicit click.
Header shows version badge + Upgrade-available modal. Cross-org access guard for
onprem_customer_admin. typecheck/lint/build all green.
**Deviations:** env-var table is bespoke, not DataTable (D-013) — DataTable can't
host inline form rows.
**Decisions:** D-010, D-011, D-012, D-013
**Next:** 5.8 — On-prem customer admin view
**Issues:** —

## Session 7 — 2026-07-22 — 5.6 On-prem org detail + namespace list
**Built:** `/onprem-customers/:orgId` full page. Header (name/plan/status +
derived "N namespaces across M clusters" + Add-namespace button). Namespaces
grouped by cluster into per-cluster DataTables with Upgrade-available (semver
check → "→ 3.12.4" or green check), Created, and an Actions column (View
metrics link, Edit-env-vars slide-over stub, Upgrade — disabled when current).
Upgrade confirmation Modal and Add-namespace SlideOver both mutate component-
local state. New `OnPremOrgDetail` type + `fetchOnPremOrgDetail` mock and a
`compareSemver`/`isUpgradeAvailable` util. typecheck/lint/build all green.
**Deviations:** none — data gap filled per D-005 (createdAt + latestVersion).
**Decisions:** D-008, D-009
**Next:** 5.7 — Namespace detail (6 tabs inc. env vars)
**Issues:** —

## Session 6 — 2026-07-22 — 5.5 Cloud org detail (5 tabs)
**Built:** `/cloud-customers/:orgId` full page + `CloudOrgDetailView` reused at
`/dashboard` for cloud_customer_admin. Header (name/plan/status + Edit-flags
stub), 5 tabs (Overview, Tenants, Usage, Workflows, Connectors) each with
independent skeleton + ErrorState/Retry. New `CloudOrgMetrics` type +
`fetchCloudOrgMetrics` in the mock layer; new reusable `Tabs` component;
`BarChart` gained a `horizontal` prop; `StatusBadge` gained `paused`. Doc fix:
build-spec §10.1 tree root renamed to refold-control-plane. typecheck/lint/build
all green.
**Deviations:** none — data gap filled per plan (see D-005).
**Decisions:** D-005, D-006, D-007
**Next:** 5.6 — On-prem org detail + namespace list
**Issues:** —

## Session 5 — 2026-07-17 — housekeeping (no prompt block)
**Built:** nothing new. Sessions 2–4 (5.2–5.4) had never been committed — all
814 lines lived only in the working tree, so dev was still at the scaffold.
Split them into four commits and pushed. Renamed docs/decision.md →
decisions.md (every reference already said plural) and fixed the clone URL in
CLAUDE.md, which pointed at refold-admin-panel instead of refold-control-plane.
**Deviations:** —
**Decisions:** none
**Next:** 5.5 — Cloud org detail (5 tabs)
**Issues:** the end-of-session protocol was added in the same uncommitted batch
it was meant to govern, so it had never actually run. Worth watching whether
step 5 (push) sticks from here.

## Session 4 — 2026-06-09 — 5.4 Customer list pages
**Built:** /cloud-customers and /onprem-customers list pages; search, status
filter, sortable DataTable; feature-flag slide-over trigger stubbed; row-click
navigation to org detail placeholders.
**Deviations:** none
**Decisions:** none
**Next:** 5.5 — Cloud org detail (5 tabs)
**Issues:** —

## Session 3 — 2026-06-09 — 5.3 God View dashboard
**Built:** God View at /overview; 6 StatCards, 2 trend LineCharts, cloud +
on-prem health tables with links, license expiry highlighting.
**Deviations:** spec asked for 4 stat cards; shipped 6 (added license metrics).
**Decisions:** D-003, D-004
**Next:** 5.4 — Customer list pages
**Issues:** —

## Session 2 — (date) — 5.2 Mock data layer
**Built:** src/data/mockData.ts with all getters per build spec Section 4;
200ms artificial delay; 12 orgs (7 cloud, 5 on-prem).
**Deviations:** none
**Decisions:** none
**Next:** 5.3
**Issues:** —

## Session 1 — (date) — 5.1 Scaffold
**Built:** Vite + React 18 + TS scaffold; sidebar/topbar shell; role-switching
mock auth context; routing placeholders; color scheme applied.
**Deviations:** none
**Decisions:** D-001, D-002
**Next:** 5.2
**Issues:** —