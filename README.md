# Refold Unified Admin Panel

A single admin panel replacing two internal tools — a Cloud Admin Panel and an
On-Premise Control Plane — across three user roles and two deployment types.
All data is currently mocked (see `src/data/mockData.ts`); no backend is required
to run or deploy.

## Tech stack

React 18 + TypeScript · Vite · React Router v6 · TanStack Query · Recharts ·
Tailwind CSS + shadcn/ui.

## Local development

```bash
npm install
npm run dev        # start the dev server
npm run build      # production build to /dist
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## One app, one login (Phase 6 / R1)

This is a **single unified app** with **one `/login`** for everyone (the earlier
three-portal `VITE_PORTAL` split was retired in R1, D-048). After signing in, the
app reads the user's `account_type` and redirects them to their own home view via
`homeRoute(role)`:

| Role | Lands on |
|---|---|
| super_admin           | `/overview`   |
| cloud_customer_admin  | `/dashboard`  |
| onprem_customer_admin | `/namespaces` |

All routes coexist in one build and are role-protected per route: a user who
navigates to a route their role can't access sees the shared **Access Denied**
page (never a silent redirect). Org-scoped `:orgId` routes additionally pass
through `OrgScopeGuard`, with Postgres RLS as the real isolation guarantee.

```bash
npm run dev        # one app — no VITE_PORTAL
npm run build      # one build
```

Auth is Supabase email+password; **super-admins and customer owners** complete
TOTP MFA to reach AAL2 on first login. Demo users (local seed):

| Role | Demo user | Password |
|---|---|---|
| super_admin  | `super@refold.internal`     | `demo-super-2026` (then TOTP enrollment) |
| cloud owner  | `owner@prismanalytics.io`   | `demo-owner-2026` (then TOTP enrollment) |
| onprem owner | `owner@meridian-labs.jp`    | `demo-owner-2026` (then TOTP enrollment) |
| cloud member | `analyst@prismanalytics.io` | `demo-analyst-2026` |

Requires the local Supabase stack running and a `.env` with
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see below).

> **Deployment implication:** this is now **one site**, not three. The Netlify
> deploy (single site) is a later change.

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Connect the GitHub repo to Vercel at [vercel.com/new](https://vercel.com/new).
3. Set the framework preset to **Vite**.
4. Build command `npm run build`, output directory `dist` (both auto-detected).
5. No environment variables are needed yet (all data is mocked). When the real
   backend is wired up, add the variables in `.env.example`.
6. Deploy from the `main` branch.

SPA routing (so direct links like `/cloud-customers/abc` resolve instead of
404ing) is configured in `vercel.json`.

## Supabase (Phase 6) — local dev

Identity and app data live in Supabase Postgres with Row-Level Security; metrics
still come from the mock provider until the live data layer lands (build-spec-v2
§ 8). Migrations and seeds are in `supabase/`.

```bash
npx supabase start          # boot the local stack (needs Docker running)
npx supabase db reset        # re-apply all migrations + seed.sql
npx supabase stop            # tear down
```

> **Demo logins not working ("Incorrect email or password")?** Run
> **`npx supabase db reset`**. `supabase start` runs `seed.sql` **only on a fresh
> database** — on an existing/older volume it does *not* re-seed, so the demo
> users (super/cloud/onprem) won't exist or won't match. `db reset` re-applies
> migrations + seed and fixes it. Do this after a fresh clone and after pulling
> any migration/seed changes.

`supabase start`/`db reset` print local dev URLs and keys (well-known, not
secret). Real cloud keys go in `.env` (gitignored); only the variable **names**
are in `.env.example`.

**RLS test** (proves cross-org isolation — a customer can't see another org's
rows, super_admin sees all). With the stack running:

```bash
DBC=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/rls_test.sql
# expect: NOTICE:  ALL RLS TESTS PASSED
```

Demo local users (seed only): `super@refold.internal` / `demo-super-2026`,
`owner@prismanalytics.io` / `demo-owner-2026`, `owner@meridian-labs.jp` /
`demo-owner-2026`.

**Provisioning Edge Function** (Phase 6.4a — super-admin user mgmt + customer
provisioning). All privileged writes go through `supabase/functions/provisioning`,
the only holder of the service-role key; it self-verifies the caller is a
super_admin at AAL2 before acting (never relies on RLS, which the service-role
key bypasses). Serve it locally alongside the stack:

```bash
npx supabase functions serve   # auto-injects SUPABASE_SERVICE_ROLE_KEY et al.
```

Invite emails (owner + super-admin invites) are captured by **Mailpit** at
http://127.0.0.1:54324 — open the newest message and follow its link to the
`/accept-invite` page to set a password. Because the customer-list pages still
render mock data, a newly provisioned org appears in the admin **Pending owner
invites** panel (not the table) until the live data layer (6.5).

## Documentation

- `docs/build-spec.md` — full build spec (prompt blocks 5.1–5.12, IA, data model).
- `docs/devlog.md` — session log (newest first).
- `docs/decisions.md` — decision log.
- `CLAUDE.md` — working conventions and current status.
