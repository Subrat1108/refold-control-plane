# Refold Unified Admin Panel — Build Spec v2 (Phase 6)

> Supersedes the "just deploy" tail of build-spec.md. Phase 6 turns the
> mock-data prototype (blocks 5.1–5.12, all complete) into a real, hosted,
> multi-tenant application with authentication, a database, role-based access,
> user provisioning, live data from the Refold + Facets APIs, and per-customer
> exports. Read this fully before starting. One prompt block per build session,
> in the order of Section 12.

---

## 1. Phase 6 goals (from user testing feedback)

1. Real authentication: email + password with MFA (managed, open-source).
2. Separate logins per audience — three portals, no dev role-toggle.
3. User provisioning hierarchy: super_admin manages super-admins + sub-roles and
   provisions customer *owner* accounts; owners add their own users + sub-roles.
4. Fix the global-search crash (folded into the data-layer rebuild, 6.5).
5. Real database (Supabase Postgres) — replaces the mock-data layer.
6. Hosted on Netlify (frontends) + Supabase (auth, DB, edge functions).

---

## 2. Architecture

**Stack**
- Frontend: existing React 18 + TS + Vite app and component library (unchanged
  visually; blocks 5.1–5.12 UI is reused).
- Auth: **Supabase Auth** — email+password + MFA (TOTP, AAL2). Open source,
  free managed tier.
- Database: **Supabase Postgres** with Row-Level Security (RLS). Replaces the
  Mongo Atlas idea and the mock-data layer.
- Server layer: **Supabase Edge Functions** (Deno) — hold all secrets, call the
  Refold + Facets APIs, enforce scope, generate exports.
- Metrics source: **Refold API + Facets API** (live). Not stored in Postgres
  (optional short-lived cache only).
- Hosting: **Netlify** — three portal sites built from one repo.

**Data split (important)**
- **Postgres** stores *identity and app data*: organizations, users, roles,
  sub-roles, memberships, invitations, audit log, saved report configs.
- **Refold + Facets APIs** provide *live metrics* (usage, workflows, credits,
  connectors, namespaces). The Edge Functions fetch and RLS/role-scope them.
- The mock-data layer (`src/data/mockData.ts`, D-005/D-009/D-011) is **retained
  as a fallback data provider**, not retired. It sits behind the same
  data-access interface and keeps serving metric data so dashboards are never
  blank while the Refold/Facets calls are still being built. Live endpoints
  replace mock ones one at a time; a per-source switch (env + optional
  per-endpoint flag) controls which provider answers. The mock is removed only
  once every metric endpoint is live and verified.

**Tenant isolation**
- RLS enforces org scoping at the database layer — a customer can only read
  their own org's rows regardless of client behavior. This is the backbone of
  the "no cross-org data" guarantee (replaces the app-layer OrgScopeGuard,
  D-014, which becomes defense-in-depth).

---

## 3. One repo, three portals

Single repository. One Vite app; the **portal** is selected at build time by a
`VITE_PORTAL` env var (`admin` | `cloud` | `onprem`). Each portal build ships
only its own shell, routes, and allowed navigation; all three share the existing
`src/components` library and a new `src/lib` (Supabase client, data access,
auth). Deployed as three Netlify sites from the same repo, each with a different
`VITE_PORTAL` and shared Supabase env vars.

```
src/
  portals/
    admin/      super-admin portal shell + routes
    cloud/      cloud-customer portal shell + routes
    onprem/     on-prem-customer portal shell + routes
  components/   shared UI library (existing 5.x components, unchanged)
  lib/
    supabase.ts       browser client
    auth/             session, MFA, guards
    data/             data-access hooks (replace mockData)
  types/
supabase/
  migrations/   SQL schema + RLS policies
  functions/    edge functions (metrics proxy, exports, provisioning)
```

Alternative considered: npm-workspaces monorepo (`apps/*` + `packages/ui`). The
`VITE_PORTAL` approach is preferred — far less restructuring of the existing
5.x code. The build room may propose the workspace layout in its 6.3 plan if it
argues a clear win.

---

## 4. Data model (Postgres)

Enums: `deployment_type` = cloud | on_premise | internal;
`account_type` = super_admin | cloud_customer | onprem_customer;
`member_role` = owner | member; `user_status` = invited | active | disabled;
`org_status` = active | suspended | churned; `report_period` = monthly |
quarterly | yearly.

**organizations**
- id uuid pk, name, deployment_type, plan, status (org_status),
  external_ref (Refold/Facets id for API calls), created_at.
- The Refold internal org is a single `deployment_type='internal'` row that
  super-admins belong to.

**profiles** (1:1 with Supabase `auth.users`)
- id uuid pk → auth.users.id, email, full_name, org_id → organizations,
  account_type, role (member_role), sub_role_id → sub_roles, status
  (user_status), created_by, created_at.
- `account_type` is stored (not just derived) so RLS policies stay fast.

**sub_roles**
- id uuid pk, account_type (which portal it applies to), name
  (e.g. Support / Billing / Read-only for admin; Admin / Analyst / Viewer for
  customers), permissions jsonb (scope flags), is_system bool.

**invitations**
- id uuid pk, email, org_id, account_type, role, sub_role_id, invited_by,
  status (pending | accepted | revoked | expired), created_at, expires_at.
- Backed by Supabase's invite/`admin.inviteUserByEmail` flow; this table tracks
  intent + assignment metadata.

**audit_log**
- id, actor_id, action, target_type, target_id, metadata jsonb, created_at.
- Write on every provisioning / role change / sensitive action.

**saved_report_configs**
- id, org_id, name, period (report_period), filters jsonb, created_by,
  created_at. Used by the QBR export feature.

No metrics/namespace tables — those come from the APIs (optional cache table may
be added in 6.5 if latency requires, with a TTL).

---

## 5. RLS policy approach

- Enable RLS on every table.
- **super_admin**: policies grant full read/write where the requesting user's
  profile has `account_type='super_admin'` (via a `is_super_admin()` SQL helper
  reading `auth.uid()`).
- **customers**: row visible only when `org_id = (select org_id from profiles
  where id = auth.uid())`.
- **owners** may insert invitations / update profiles within their own org;
  **members** are read-only except their own profile, gated further by their
  sub_role permissions.
- MFA: require AAL2 (`auth.jwt()->>'aal' = 'aal2'`) for super-admin write
  actions and all provisioning.

---

## 6. Auth & MFA

- Supabase Auth, email+password. No dev role-switcher (supersedes D-002).
- MFA: TOTP enrollment; enforce AAL2 for super_admin and for any provisioning /
  role-change action. Prompt enrollment on first login for privileged roles.
- Session handled by the Supabase client; the portal reads `account_type` from
  the profile and **must match the portal's `VITE_PORTAL`** — a cloud user
  hitting the admin portal is signed out / shown "wrong portal", never allowed
  in. Password reset + invite-accept flows via Supabase email templates.

---

## 7. Provisioning hierarchy & sub-roles

- **super_admin (owner sub-role)**: create/disable other super-admin users;
  define and assign super-admin sub-roles; provision **owner** accounts for new
  cloud or on-prem customer orgs (creates the org + the owner profile + sends
  the invite).
- **customer owner** (cloud or on-prem): invite/disable users *within their own
  org*; assign customer sub-roles; cannot see or touch other orgs.
- **members**: access scoped by their sub_role's permissions; cannot provision.
- Sub-roles are data (Section 4), editable by the appropriate owner; ship a
  sensible system set (admin sub-roles: Support, Billing, Read-only; customer
  sub-roles: Admin, Analyst, Viewer) as `is_system=true` seeds.
- Every provisioning action writes an audit_log row.

---

## 8. Live data layer (mock as fallback provider)

- Introduce a **provider pattern** behind the data-access hooks: the 5.x UI
  keeps consuming the **same interfaces** (`useCloudOrg`, `useNamespaceMetrics`,
  `useAiCredits`, `searchAll`, etc.) so the shared DetailTabs (D-010),
  AI-credits card (D-018), and pages need no change; only the provider behind
  them changes. Two providers: `mock` (existing `mockData.ts`) and `live`
  (Supabase + Edge Functions).
- **The mock stays as the default fallback** so dashboards always render with
  data. A source switch — `VITE_DATA_SOURCE` (mock | live) plus an optional
  per-endpoint override map — decides which provider answers each call. Flip
  endpoints to `live` individually as they're built and verified; anything not
  yet live silently falls back to mock. Remove the mock only when every metric
  endpoint is live.
- App data (orgs/users/roles) → Supabase client / Postgres (RLS-scoped) — this
  is real from 6.1 on (no mock fallback needed for identity).
- Metrics (usage/workflows/credits/connectors/namespaces) → Edge Function
  `metrics-proxy` that calls the Refold + Facets APIs with server-side keys and
  scopes results by the caller's org/role; falls back to mock per the switch
  above until each endpoint is wired.

---

## 9. QBR / data export

- Edge Function `export-xlsx`: input = org_id + period (monthly | quarterly |
  yearly) + date range; pulls the customer's data from Refold/Facets, builds a
  multi-sheet workbook (Usage / Workflows / Credits / Connectors), returns the
  file for download. Format: **.xlsx only**.
- super_admin can export any customer; a customer owner can export their own org.
- `saved_report_configs` lets a user re-run a named export quickly.
- Runtime xlsx generation uses a JS lib (SheetJS/exceljs) inside the function —
  distinct from the doc-authoring xlsx skill.

---

## 10. Deployment

- Three Netlify sites from one repo, differing only by `VITE_PORTAL`
  (admin / cloud / onprem); shared Supabase URL + anon key envs; service-role
  key only in Edge Function env, never in the frontend.
- Supabase project hosts DB + Auth + Edge Functions; migrations in
  `supabase/migrations`.
- Custom subdomains later (e.g. admin. / app. / onprem.).
- Keep the placeholder password gate removed once real auth lands (supersedes
  D-023).

---

## 11. Dependencies / open items

- **Refold API** + **Facets API** docs: base URLs, auth scheme, and the
  endpoints mapping to our metric shapes. Needed for 6.5/6.6; 6.1–6.4 don't
  block on them.
- A **Supabase project** (URL, anon key, service-role key).
- Confirm the concrete sub-role sets and their permission flags with the user
  during 6.4.

---

## 12. Prompt blocks (build order)

- **6.1 — Supabase project + schema + RLS.** Migrations for all Section 4 tables,
  enums, the `is_super_admin()` helper, RLS policies, and system seed data
  (internal org, system sub-roles). No UI yet.
- **6.2 — Auth + MFA.** Supabase client in `src/lib`, email+password sign-in,
  TOTP MFA enrollment/challenge, session + profile loading, AAL2 enforcement.
  Remove the dev role-switcher and the placeholder password gate.
- **6.3 — Portal split.** `VITE_PORTAL` build selection; extract admin / cloud /
  onprem shells reusing the shared component library; portal-vs-account_type
  match guard; per-portal routing.
- **6.4 — RBAC + provisioning UI.** Super-admin user management + sub-role
  assignment; customer-owner provisioning; owner-side user invite + sub-role
  assignment; audit logging.
- **6.5 — Live data layer.** Wrap the data hooks in a provider switch (mock |
  live) with mock as fallback so nothing goes blank; wire identity to Supabase
  and stand up the `metrics-proxy` Edge Function (Refold/Facets), flipping
  endpoints to live individually; rebuild global search and fix the crash; add
  ErrorBoundary.
- **6.6 — QBR export.** `export-xlsx` Edge Function + UI (period picker, saved
  configs, download).
- **6.7 — Netlify deploy + polish.** Three sites, env wiring, subdomains,
  end-to-end pass.

---

## 13. Decisions to log at Phase 6 start (D-025+)

> Numbering note: D-024 is already used (route-level ErrorBoundary, Session 14),
> so Phase 6 decisions start at D-025.

- **D-025** — Auth + DB = Supabase (Postgres + Auth + Edge Functions);
  supersedes the Mongo Atlas choice and closes the managed-provider question.
- **D-026** — Three separate portals from one repo via `VITE_PORTAL`; supersedes
  D-002 (dev role-switcher removed) and the D-016 topbar toggle logic.
- **D-027** — Data split: Postgres for identity/app data, Refold+Facets for live
  metrics. Metrics use a provider switch (mock | live) with **mock retained as
  the fallback** so dashboards never render blank; endpoints flip to live
  individually and the mock is removed only when all are live. D-005/D-009/D-011
  live on as the mock provider rather than being retired.
- **D-028** — Tenant isolation via Postgres RLS; app-layer OrgScopeGuard (D-014)
  demoted to defense-in-depth.
- **D-029** — MFA required (AAL2) for super-admin writes and all provisioning.
- **D-030** — Exports are `.xlsx` only, generated server-side in an Edge Function.
- **D-031** — Placeholder password gate (D-023) removed once 6.2 lands.

(Confirm exact numbering against docs/decisions.md at build time — next free id
is D-025.)
