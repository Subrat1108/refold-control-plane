# Refold Unified Admin Panel

## Current status
<!-- Canonical state snapshot. The build room updates this block at the end of
     every session. The planning room reads it first. Keep it under ~10 lines. -->
- Last session: 2026-10-08 — 7.2b: Portfolio + Account 360 (D-079; build-spec-v3 § 6, docs/product-overview.md § 5.2–5.3). `/portfolio` (Board tab = the account list, grouped by segment, filters + ScopeSwitcher/SavedViewsMenu, Add account with no invite, key milestones/recommendations; Coverage tab = 7-section current/stale/missing matrix) and `/accounts/:orgId` Account 360 (6 tabs: Overview incl. change-health-with-reason + mark-verified; Projects with nested milestones/accomplishments/risks/asks + the project_members assignment UI deferred from 7.2a (D-077); Escalations; Tickets; Engagements; Metrics — every row carrying a SourceBadge). One migration (organizations gained health_reason/verified_at/updated_by — everything else this screen touches already shipped in 7.1, so this block is UI + hooks only, `src/hooks/usePortfolio.ts`). Verified: rls_test.sql all green (4 blocks), smoke-login green, typecheck/lint/build green, migration list 26/26 local=remote, and a throwaway script exercised every CRUD path end-to-end against the real API. No browser-automation tool is available in this environment — the UI was NOT click-tested interactively; flagged, not glossed over.
- Next up: 7.3 — Approvals inbox + audit log screen (scoped: Mine/My team/Everyone).
- Blockers: Refold MCP server details needed for 7.5. None for schema/deploy.
- Deployed: YES — live at `refold-control-plane.netlify.app`, Netlify prod branch `dev` (single-env, D-066), backed by cloud Supabase `xwtxrdxktbogswxuuetp` (the only DB). All demo logins work.
- Known issues: Phase-7 demo data (fictional) has NOT been run against cloud yet — run `supabase/demo/phase7_demo_data.sql` in the cloud SQL Editor if you want sample data on the live site. "Pending approval" never appears in the coverage matrix yet (needs 7.3's proposals). A standalone cross-account Projects screen and a distinct "Accounts" nav item are deferred (D-079). Built-in Supabase email is capped at 2/hour — needs custom SMTP before inviting a real team (parked). No interactive browser QA was possible this session (tooling gap, not a known defect) — worth a manual click-through once a browser tool or local verification is available.
- Phase 7 note: Phase 7 is **super-admin only**; cloud/on-prem owner portals are **frozen**. Confidentiality rule (build-spec-v3 § 0) in Key coding rules: never commit real customer/people data; all fixtures fictional. A new "Supabase / PostgREST queries" coding rule (D-068) also covers teams/profiles embeds — always name the FK. TOTP in supabase/config.toml. Local dev needs a gitignored .env. Edge Functions: `npx supabase functions serve` (Mailpit http://127.0.0.1:54324)

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
5. **If the session added migrations, push them to the cloud project
   (`supabase db push`) BEFORE pushing code to `dev`** — `dev` auto-deploys
   (single-environment mode, D-066), so code that expects a new table/column
   must not reach Netlify before the schema does.
6. **If the session added migrations, run the role-login smoke check** (each
   demo role signs in and loads its profile — `scripts/smoke-login.ts`)
   against a fresh local `supabase db reset` before pushing. A new column or
   FK can silently break the profile-load query that every login depends on
   (D-068 — PostgREST embeds go ambiguous the moment a table gains a second
   relationship to the same target, e.g. `organizations.owner_profile_id` vs
   `profiles.org_id`); this catches it locally instead of in production.
7. Commit per the convention below and **push to `dev`**

A session that doesn't push is invisible to the planning room.

## Project overview
Now the **Refold CS Hub** (build-spec-v3, Phase 7 onward) — the customer
success team's single system of record for every account across its whole
lifecycle, built on the same base as the original admin panel (Phases 5–6):
React UI, Supabase auth + MFA + RLS, provisioning, single login, cluster →
namespace → org → tenant, 4-scope feature flags, Netlify + cloud Supabase.
**Phase 7 is super-admin only.** Customer-facing logins (cloud/on-prem owner)
are **frozen**: kept working, no new work. Original build spec (prompt blocks
5.1–5.12, IA, permissions matrix): `docs/build-spec.md`. Phase 6
re-architecture: `docs/build-spec-v2.md`. Current spec: `docs/build-spec-v3.md`.
Product vision / screen-by-screen walkthrough: `docs/product-overview.md`.

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

**Confidentiality (build-spec-v3 § 0)**
- This repository is **public**. Never commit real customer names, health
  ratings, risks, contacts, metrics, Slack/email content, or any secret.
- Real data enters only through the running app (manual entry, approved
  proposals, or imports executed against the database) — never as files in git.
- All seeds, fixtures, and examples use fictional companies.

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

**Supabase / PostgREST queries (D-068)**
- Before writing (or adding a column near) a `.select()` embed like
  `table('a').select('b(...)')`, check whether `b` has more than one foreign
  key to/from `a`. If it does, PostgREST returns `300 PGRST201` ("more than one
  relationship was found") and the query fails at runtime — not at build time —
  the first time two FKs between the same pair of tables both exist.
- When ambiguous (or to be safe against a future second FK), name the
  relationship explicitly: `table('a').select('b!b_a_id_fkey(...)')`. The `!fkey`
  hint does not change the response's JSON key (it stays `b`), so no
  destructuring code needs to change.
- A new migration that adds a profile/organization FK (`created_by`,
  `owner_profile_id`, `edl_profile_id`, …) can silently break an *existing*
  embed elsewhere in the app that queried the same two tables unqualified —
  this already happened once (D-068). Grep for `table_name(` inside every
  `.select(` in `src/` and `supabase/functions/` whenever a migration adds a
  profiles/organizations FK, not just in the file you're editing.

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
**Single environment until the first customer goes live (D-066).** There is
only one database — the cloud Supabase project `xwtxrdxktbogswxuuetp` — and
Netlify's production branch is `dev`, not `main`: **every push to `dev` deploys
to production.** `main` is left as-is and becomes the prod branch again at
go-live; there is no staging DB and no staging site right now. Treat pushes to
`dev` with the same care as a prod deploy (because it is one) — see the
migration-before-code rule in the session protocol above.

Netlify, one site (post-R1). Config in `netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "dist"
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
Build command: `npm run build` — Output dir: `dist` — Deploy branch: `dev`
(single-env; was `main`, see above). Live at `refold-control-plane.netlify.app`,
backed by cloud Supabase project `xwtxrdxktbogswxuuetp` (the only DB).

## Git conventions
Branch strategy: `main` (production) ← `dev` (active work) ← `feature/*`
Never commit directly to `main`.

Commit format: `<type>(<scope>): <description>`
Types: feat, fix, style, refactor, data, deploy, docs, chore

## Current build status
@PROGRESS.md