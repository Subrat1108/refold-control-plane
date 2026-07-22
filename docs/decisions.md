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

---

# Parked

Out-of-scope ideas land here instead of derailing the current prompt block.
Format: one line each, with the session it came from.

- (empty)