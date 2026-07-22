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

---

# Parked

Out-of-scope ideas land here instead of derailing the current prompt block.
Format: one line each, with the session it came from.

- (empty)