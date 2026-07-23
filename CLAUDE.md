# Refold Unified Admin Panel

## Current status
<!-- Canonical state snapshot. The build room updates this block at the end of
     every session. The planning room reads it first. Keep it under ~10 lines. -->
- Last session: 2026-07-23 — completed 5.9 (Feature flags slide-over panel). One reusable FeatureFlagsPanel wired to all three triggers (org detail, customer-list icons, /feature-flags page); per-org vs global list, scope badges, yellow-until-saved, console-log-only save (D-017)
- Next up: 5.10 — AI Credits card
- Blockers: none
- Deployed: not yet (vercel.json + SPA routing configured, no deploy)
- Known issues: none logged

## Session protocol (build room)
**Start of every session** — reconstruct context in one command before doing anything:
```bash
git clone -b dev https://github.com/Subrat1108/refold-control-plane.git && cd refold-control-plane && sed -n '1,40p' CLAUDE.md && cat PROGRESS.md && head -60 docs/devlog.md && head -80 docs/decisions.md
```
(If already cloned: `git pull` then the same reads.) To locate code:
`grep -rin "SearchTerm" src/ --include=*.ts --include=*.tsx`

**End of every session** — before finishing, always:
1. Update the checklist in `PROGRESS.md`
2. Prepend a session entry to `docs/devlog.md` (newest first, use the template there)
3. Log any decisions made to `docs/decisions.md`
4. Refresh the **Current status** block at the top of this file
5. Commit per the convention below and **push to `dev`**

A session that doesn't push is invisible to the planning room.

## Project overview
Single admin panel replacing two tools: a Cloud Admin Panel and an On-Premise
Control Plane. Supports three user roles across two customer deployment types.
Full build spec (prompt blocks 5.1–5.12, IA, data model, permissions matrix):
`docs/build-spec.md`.

**Deployment types**
- `cloud` — hosted SaaS customers, no concept of namespaces or clusters
- `on_premise` — self-hosted customers, one or more namespaces across one or
  more clusters; each namespace is an independent Refold installation

**User roles**
- `super_admin` — Refold internal team; god view across all customers,
  namespaces, and clusters
- `cloud_customer_admin` — sees only their own org; no namespace concept
- `onprem_customer_admin` — sees all their own namespaces across all their
  clusters; no access to other orgs

## Tech stack
- React 18 + TypeScript
- Vite (build tool, output dir: /dist)
- React Router v6 (routing)
- TanStack Query (all data fetching and caching)
- Recharts (all charts: line, bar, donut)
- Tailwind CSS + shadcn/ui (styling and base components)
- Inter or system-ui (font)

## Build and dev commands
- `npm run dev` — start local dev server
- `npm run build` — production build to /dist
- `npm run lint` — ESLint
- `npm run typecheck` — tsc --noEmit (run before every commit)

## Folder structure
```
src/
  components/   shared reusable components only; never route-specific logic
  pages/        one file per route
  data/         mock data module (mockData.ts); all exports here
  hooks/        custom React hooks (useAuth, useMockData, etc.)
  types/        all TypeScript interfaces exported from index.ts
  utils/        pure utility functions only (formatDate, formatNumber)
public/
docs/
  build-spec.md   full build instructions (prompt blocks 5.1–5.12)
  devlog.md       session log, newest entry first
  decisions.md    decision log + parked ideas
CLAUDE.md
CLAUDE.local.md   (gitignored, personal notes only)
PROGRESS.md
```

## Routing table
| Path | Roles |
|---|---|
| `/overview` | super_admin |
| `/cloud-customers` | super_admin |
| `/cloud-customers/:orgId` | super_admin, cloud_customer_admin |
| `/onprem-customers` | super_admin |
| `/onprem-customers/:orgId` | super_admin, onprem_customer_admin |
| `/onprem-customers/:orgId/namespaces/:namespaceId` | super_admin, onprem_customer_admin |
| `/dashboard` | cloud_customer_admin (their home route) |
| `/feature-flags` | super_admin |
| `/settings` | all roles (content scoped by role) |
| `/login` | unauthenticated only |

Accessing a route without the required role shows an "Access denied" page with
a back button. Never silently redirect without telling the user why.

## Key coding rules

**Types**
- All TypeScript interfaces live in `src/types/index.ts`. Never define inline
  types inside component files or pages.
- The full data model is in `src/types/index.ts`; refer to it before creating
  any new data shape.

**Mock data**
- All mock data functions are in `src/data/mockData.ts`.
- Every exported function must be async and include a 200ms artificial delay:
  `await new Promise(r => setTimeout(r, 200))`
- Use realistic company names, not "Acme", "Foo", or "Test Corp".
- Metric numbers must not be round; add natural variation (e.g. 4,217 not 4,000).
- Trend arrays (`apiCallsTrend`, `executionsTrend`) must always be exactly
  30 items.
- At least one org must always have `status: 'degraded'` or `status: 'down'`
  for visual variety in the health matrix.

**Auth and roles**
- All role checks use the `useAuth()` hook. Never hardcode role strings outside
  of `src/hooks/useAuth.ts`.
- The mock auth context must allow switching between all three roles without
  reloading the page (for development).

**Components**
- Build each component once; use props and conditional rendering for role
  variants. Never create duplicate components for different roles.
- Every async section needs a `SkeletonLoader` while loading and an inline
  error state with a Retry button on failure (simulate 10% random error rate).
- Every table or list that could be empty needs an `EmptyState` component with
  an SVG icon and a helpful message.
- Icon-only buttons must always be wrapped in a `Tooltip`.

**Dates**
- All timestamps use `formatDate()` from `src/utils/formatDate.ts`.
- Format: "12 Jun 2025, 14:30" — never any other format.

**Secrets**
- Secret env variable values are always masked as `●●●●●●` by default.
- A show/hide toggle reveals the value only when explicitly clicked.
- Never show a secret value in plaintext on initial render under any
  circumstances.

**Spacing (enforce consistently)**
- Card padding: 24px (Tailwind: `p-6`)
- Section gaps: 24px (Tailwind: `gap-6`)
- Table row height: 52px (Tailwind: `h-[52px]`)

**Charts**
- Line charts: workflow execution trends, API call volumes
- Bar charts: error breakdown by type, tenant growth
- Donut charts: error type breakdown on org overview
- Use Recharts for all charts; no other chart library.

## Reusable component list
Build these once in `src/components/` and never recreate them:
StatCard, LineChart, BarChart, DonutChart, DataTable, StatusBadge,
ProgressBar, SlideOver, Modal, SkeletonLoader, EmptyState, Tooltip,
SearchDropdown, Toggle

## Color scheme
- Sidebar background: `#0F1117`
- Sidebar text: white
- Active/selected/primary accent: `#6366F1` (indigo)
- Main content background: `#F8F9FC`
- Cards: white with subtle shadow
- Status colors: green=active/healthy, amber=suspended/degraded, red=churned/down

## Feature flags panel
This is a reusable SlideOver used in three places:
1. "Edit feature flags" button on org detail pages
2. Flag icon in customer list tables
3. `/feature-flags` page (super_admin global view)
The panel is 400px wide, slides from the right, closes on outside click or
Escape, and shows unsaved changes with a subtle yellow background highlight.

## Deployment target
Free tier on Vercel (Vite preset). SPA routing via `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```
Build command: `npm run build` — Output dir: `dist` — Deploy branch: `main`

## Git conventions
Branch strategy: `main` (production) ← `dev` (active work) ← `feature/*`
Never commit directly to `main`.

Commit format: `<type>(<scope>): <description>`
Types: feat, fix, style, refactor, data, deploy, docs, chore

## Current build status
@PROGRESS.md