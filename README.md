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

## Portals (Phase 6)

One codebase builds three portals, selected at build time by `VITE_PORTAL`
(`admin` | `cloud` | `onprem`). Each build ships only its own routes/nav; a
portal↔account_type guard signs out and blocks a user of the wrong type.

```bash
VITE_PORTAL=admin  npm run dev     # super-admin portal
VITE_PORTAL=cloud  npm run dev     # cloud-customer portal
VITE_PORTAL=onprem npm run dev     # on-prem-customer portal
# build a specific portal:
VITE_PORTAL=cloud  npm run build
```

Auth is Supabase email+password (super-admins additionally complete TOTP MFA to
reach AAL2). Sign in with the matching demo user for the portal (local seed):

| Portal | Demo user | Password |
|---|---|---|
| admin  | `super@refold.internal`     | `demo-super-2026` (then TOTP enrollment) |
| cloud  | `owner@prismanalytics.io`   | `demo-owner-2026` |
| onprem | `owner@meridian-labs.jp`    | `demo-owner-2026` |

Signing in as the wrong type for a portal shows a "wrong portal" screen.
Requires the local Supabase stack running and a `.env` with
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see below).

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

## Documentation

- `docs/build-spec.md` — full build spec (prompt blocks 5.1–5.12, IA, data model).
- `docs/devlog.md` — session log (newest first).
- `docs/decisions.md` — decision log.
- `CLAUDE.md` — working conventions and current status.
