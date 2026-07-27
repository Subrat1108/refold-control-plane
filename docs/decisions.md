# Decision log

Append-only. Number decisions D-001, D-002, … A decision that isn't in this
file (or in CLAUDE.md) doesn't exist as far as the build room is concerned.

Format: `## D-NNN — short title (YYYY-MM-DD)` then 1–3 lines: what was decided
and why. Reversals get a new entry referencing the old one, never an edit.

---

## D-001 — Stack: Option A, React + TypeScript (session 1)
Chose the React 18 + TS + Vite + TanStack Query + Recharts + Tailwind/shadcn
stack over plain HTML. Maintainability over prototype speed; the panel will
outlive the mock-data phase.

## D-002 — Mock auth via context with live role switching (session 1)
Role switching without page reload, all role strings confined to useAuth().
Placeholder until real auth (build spec § 11.4).

## D-003 — Dashboard sections are independent components (2026-06-09)
Stats, charts, and tables on the God View each live in their own component
with independent loading/error states — no page-level loading gate.

## D-004 — License expiry thresholds (2026-06-09)
LicenseExpiry indicator: amber when <60 days remaining, red when expired.

## D-005 — Tab-specific metrics live in a dedicated fetcher, not on CloudOrgDetail (2026-07-22)
5.5's tabs needed data the mock layer lacked (tenants, storage, success rate,
executions-today, avg-exec-time, tenant-growth series, workflow table rows,
connectors). Added a `CloudOrgMetrics` shape + `fetchCloudOrgMetrics(orgId)`
rather than bloating `CloudOrgDetail` (which billing/other blocks reuse). Header
+ existing trends/errorBreakdown/apiCallsTrend still come from `useCloudOrg`; AI
credits from `useAiCredits`. Each tab section fetches independently (extends
D-003).

## D-006 — "Edit feature flags" button hidden for cloud_customer_admin (2026-07-22)
Feature-flag management is a Refold concern (/feature-flags is super_admin-only
per the routing table), so the org-detail button renders only for super_admin.
Customer admins see the same page at /dashboard without the button.

## D-007 — Extended existing components instead of duplicating (2026-07-22)
Added a `horizontal` prop to `BarChart` (Workflows errors-by-type), a `paused`
style to `StatusBadge`, and a new reusable `Tabs` shell component (local state,
not URL-synced) — the 6-tab namespace detail (5.7) reuses the same shell.

## D-008 — latestVersion = max dataset version (3.12.4) (2026-07-22)
On-prem upgrade checks need a "latest Refold release." Set `LATEST_REFOLD_VERSION`
to the highest version already in the dataset (3.12.4) so namespaces at 3.12.4
render the up-to-date green check while older ones (3.12.3, 3.12.1, 3.11.9) show
"→ 3.12.4" — both states visible per the 5.6 spec. Comparison is semver-correct
via `compareSemver` (numeric part-wise), never string compare.

## D-009 — Upgrade / Add-namespace mutate component-local state only (2026-07-22)
Per the 5.6 spec's "local state" wording, confirming an upgrade or adding a
namespace updates ephemeral React state seeded from the query, not the mock
layer. Edits reset on reload/remount by design; keeps the mock data pristine
across navigation and other blocks. (Contrast updateFeatureFlag, which does
persist in the mock pool — that was a deliberate exception for the flags panel.)

## D-010 — Shared DetailTabs; CloudOrgMetrics → DetailMetrics (2026-07-22)
Extracted the five 5.5 tab sections (Overview/Tenants/Usage/Workflows/Connectors)
from CloudOrgDetailPage into presentational `components/detail/DetailTabs.tsx`.
Each section takes `QueryLike` query objects as props (own skeleton + error per
D-003); containers wire the hooks. Renamed `CloudOrgMetrics → DetailMetrics` and
added `DetailCharts` as the neutral shapes both pages feed. Cloud page became a
thin container, behaviour-identical. No forked components.

## D-011 — Namespace tab data via dedicated namespace-scoped fetchers (2026-07-22)
Per D-005, namespace tab metrics come from `fetchNamespaceMetrics(nsId)` (returns
DetailMetrics scoped to the namespace). Added `apiCallsTrend` + `latestVersion`
to `NamespaceDetail`; normalized chart selectors (`useNamespaceCharts`,
`useCloudDetailCharts`) reshape each source into DetailCharts with no extra fetch
(shared query keys).

## D-012 — Cross-org namespace access blocked inline (interim) (2026-07-22)
If an onprem_customer_admin opens a namespace whose `orgId` ≠ their `user.orgId`,
the page renders Access Denied and fetches nothing further — no data leak. This
is interim; full role/scope enforcement is 5.8.

## D-013 — Env-var table is bespoke, not DataTable (2026-07-22)
The Environment Variables table needs inline add/edit form rows (add row at top,
edit swaps a row for a form) which the generic DataTable can't host. Built a
bespoke table using DataTable's exact styling (h-[52px], borders, px-4) for
visual parity; still reuses StatusBadge-style tokens, Tooltip, Modal, EmptyState.
Secret masking: reveal state is an initially-empty Set, so plaintext is never in
the DOM on mount (CLAUDE secrets rule); editing a secret pre-fills the input
(explicit action, consistent with the reveal toggle).

## D-014 — Reusable OrgScopeGuard supersedes D-012's inline check (2026-07-23)
Replaces the interim inline cross-org check in NamespaceDetailPage (D-012) with
a route-level `OrgScopeGuard` wrapper: for customer-admin roles the `:orgId`
route param must equal `user.orgId`, else the shared `AccessDenied` page (back
button → `homeRoute(role)`). Applied to the cloud/onprem org detail and
namespace routes. super_admin is unscoped. The guard is URL-param based; the
contrived case of own-orgId URL + foreign namespace id is out of scope.

## D-015 — Extract NamespaceClusters; 5.6 summary now server-count (2026-07-23)
The 5.6 cluster tables + interactions (upgrade modal, env-vars slide-over stub,
add-namespace slide-over, local namespace state) moved into
`components/onprem/NamespaceClusters.tsx`, shared by the 5.6 org detail page and
the 5.8 customer Namespaces view (no fork). Consequence: the 5.6 header's
"N namespaces across M clusters" summary now reflects the server count (from its
own useOnPremOrgDetail), not the live post-add local count, since that state now
lives inside NamespaceClusters. Acceptable — adds are ephemeral anyway (D-009).

## D-016 — Role-aware sidebar/topbar via central nav config (2026-07-23)
Nav moved out of Sidebar into `config/navigation.tsx` (single source of truth,
`NAV_BY_ROLE` + `homeRoute`). Customer-admin topbar shows the organization name
(applied to both cloud and on-prem, though the 5.8 spec named only on-prem) and
hides the global search for non-super_admin so a customer can't surface other
orgs' data (full search is 5.11).

## D-017 — Feature-flags Save console-logs only, no persistence (2026-07-23)
The 5.9 panel's Save logs the changed flags to console and resets the panel's
baseline (yellow clears, Save re-disables); it does NOT call the persisting
`updateFeatureFlag`. Two reasons: (1) the spec says "logs the changes to console
(no API call needed yet)"; (2) `FEATURE_FLAGS_POOL` is a single global list, so
`updateFeatureFlag(id, enabled)` would flip a flag for every org, not scope it to
the org whose panel is open — wrong semantics for a per-org panel. Consistent
across all three triggers. Note: the planning brief referenced a "God View
feature-flag overview" to keep in sync, but OverviewPage has no flags section, so
there is nothing to sync. Revisit if/when real per-org flag persistence lands.

## D-018 — AI Credits card lives once in shared DetailTabs Overview (2026-07-23)
The 5.10 card is added to the shared `OverviewTab` (D-010), so it renders for both
the cloud org and the namespace detail with no per-page code. Credit data stays on
the single `fetchAiCredits(id)` — extended to scope namespace ids (D-011) rather
than adding a parallel fetcher; `topConsumers` added to the AiCredits shape. The
old mini "AI Credits Used" stat card was removed (stat row is now 3 cards) to
avoid duplicating the new full card.

## D-019 — Edit-limit ephemeral + super_admin-gated; ProgressBar durationMs (2026-07-23)
"Edit limit" is super_admin-only (useAuth, D-002; hidden for customers per the
D-006 pattern) and updates component-local state only — ephemeral, mock stays
pristine (D-009). The 600ms fill animation reuses ProgressBar via a new optional
`durationMs` prop (default 300, so existing usages are unchanged); the card seeds
a 0 display value and bumps it to `used` on mount via requestAnimationFrame.

## D-020 — Connectors indexed from cloud orgs + namespaces (2026-07-23)
Global search's Connectors group is built from the entities that actually have a
Connectors tab: cloud orgs (→ /cloud-customers/:id?tab=connectors) and on-prem
namespaces (→ /onprem-customers/:orgId/namespaces/:nsId?tab=connectors). On-prem
*org* detail has no Connectors tab (it's the cluster tables), so connectors are
not indexed there. Connector names come from a shared `CONNECTOR_DEFS` constant
(also used by connectorsFor), so the same fixed set repeats across orgs — the
3-per-group cap + owner breadcrumb disambiguate.

## D-021 — Tabbed pages read initial ?tab=; SearchResults reshaped (2026-07-23)
So connector results land on the Connectors tab, CloudOrgDetailView and
NamespaceDetailPage now seed their tab state from a `?tab=` query param
(validated against known tab ids), a minimal read — tabs remain local state, not
URL-synced (D-007 unchanged). The unused `SearchResult` type was reshaped into
grouped `SearchResults`/`SearchResultItem`; `searchAll` returns groups capped to
3. `SearchDropdown` keeps a plain `onSearch` filter-input mode for the customer
list pages and switches to global-search mode when no `onSearch` is given.

## D-022 — God View feature-flag overview card closes the 5.3 gap (2026-07-23)
build-spec § 5.3 specified a global feature-flag overview on the God View that
was never built (noted in D-017). Added `FeatureFlagOverviewCard` to OverviewPage,
reusing `useFeatureFlags()` (global) + the `Toggle` primitive and the exact D-017
Save semantics (local draft, Save console-logs the diff, no persistence) so the
two flag surfaces (this card + the 5.9 panel) stay consistent. Kept it as an
inline card reusing primitives rather than extracting a shared list component —
a lighter touch for a secondary item.

## D-023 — Placeholder password gate; /login repurposed (2026-07-23)
Implemented the § 11.4 password gate as a separate concern from the mock role
system: `AuthGateContext` (localStorage `refold_admin_authed`, password
`refold-demo-2025`) + `useAuthGate` + `RequireAuth` wrapping the AppLayout route;
sidebar gains "Sign out". `/login` was repurposed from the old dev role-picker
into the password gate — dev role-switching remains in the sidebar switcher
(D-002), so nothing is lost. Clearly marked placeholder auth; replace with real
auth (JWT/OAuth) when a backend exists. Vercel deploy itself is the user's manual
dashboard step and is intentionally not automated.

---

# Parked

Out-of-scope ideas land here instead of derailing the current prompt block.
Format: one line each, with the session it came from.

- (empty)