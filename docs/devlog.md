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

## Session 23 — 2026-07-31 — R2a: cluster→namespace→org→tenant hierarchy
**Built:** corrected the on-prem model so tenants/metrics belong to the org WITHIN
a namespace, not the namespace (build-spec §4 amend). Mock-only (D-027).
- **Types:** `Cluster` (first-class, decommissionable), `NamespaceOrg` +
  `NamespaceOrgDetail`, `ClusterStatus`, `NamespaceStatus += decommissioned`;
  `OnPremOrgDetail` now returns `clusters:[{cluster,namespaces}]`; `NamespaceDetail`
  slimmed to header + env vars.
- **Mock:** ONPREM_CLUSTERS (5) + NAMESPACE_ORGS (10, ≥1 degraded + ≥1 down);
  new fetchers `fetchNamespaceOrgs/fetchNamespaceOrg/fetchNamespaceOrgMetrics`
  (re-scoped from the old namespace metrics, reusing buildDetailMetrics);
  `fetchOnPremOrgDetail` groups namespaces under clusters.
- **Hooks:** useNamespaceOrgs/useNamespaceOrg/useNamespaceOrgMetrics/…Charts
  (replaced useNamespaceMetrics/Charts); useAiCredits now nsOrg-scoped.
- **UI:** `NamespaceClusters` reworked (per-cluster groups; cluster + namespace
  decommission via confirm Modal → ephemeral status; namespace name links to
  detail). `NamespaceDetailPage` = header + Upgrade/Decommission + Organizations
  list (shared DataTable, Cloud-Customers style) + Env Vars; metric tabs removed.
  NEW `NamespaceOrgDetailPage` = the 5 DetailTabs scoped to `:nsOrgId` (new nested
  route). StatusBadge gained a gray `decommissioned` style. Owner /namespaces
  mirrors the nest (same NamespaceClusters).
**Verified (honest):** nest verified end-to-end via a `tsx` script (customer→2
clusters→namespaces w/ statuses→orgs→org metrics tenants=148/workflows/connectors;
health = 2 degraded/down namespaces + 2 degraded/churned orgs; NamespaceDetail
slimmed, envVars present). typecheck/lint/build green; dev server serves 200. The
interactive drill-down + decommission modals + org metric tabs are code-complete
and HMR-loaded on the dev server for manual click-test — not headlessly asserted.
God View is org-level (totals consistent with the nest) — no change needed.
**Deviations:** none. R2b (feature-flag cluster scope) is the follow-up.
**Decisions:** D-049, D-050, D-051, D-052
**Next:** R2b — feature-flag cluster scope (4-scope panel + affordances).
**Issues:** —

## Session 22 — 2026-07-31 — R1: unify portals into one app + single login
**Built:** reversed the three-portal split (D-026/D-035). One app, one `/login`.
- `src/router.tsx` rewritten as a single merged route tree; deleted
  `src/portals/{admin,cloud,onprem}/routes.tsx`, `src/config/portal.ts`,
  `src/lib/auth/WrongPortal.tsx`; retired `VITE_PORTAL` (vite-env/.env/.env.example).
- Per-route role protection back via restored `RouteGuard` → shared AccessDenied
  (no silent redirect); `OrgScopeGuard` stays on :orgId routes.
- `RequireAuth` simplified to session → (super_admin/owner AAL2) → render (portal
  match removed). New `IndexRedirect` sends `/` to `homeRoute(role)`; LoginPage
  already redirected post-auth; catch-all → `/`.
- onprem nav reordered (Namespaces first) so `homeRoute(onprem)` → /namespaces,
  keeping the "home = first nav item" invariant (D-016). Sidebar drops PORTAL_NAME.
- README rewritten (single app / one login / role redirect; removed VITE_PORTAL).
**Verified (honest, local):** signed in all three demo users via the SAME /login
(real Supabase auth + profile) → each resolves to the correct role and landing
route (super→/overview, cloud→/dashboard, onprem→/namespaces). AccessDenied for a
role hitting a route it can't access is enforced by RouteGuard's explicit
allowedRoles (verified by inspection — deterministic). ONE build (no VITE_PORTAL);
typecheck/lint/build green; no portal/WrongPortal imports remain in src.
**Deviations:** onprem nav reorder (Namespaces first) — needed so onprem lands on
/namespaces per the requirement without breaking homeRoute; approved in plan.
**Decisions:** D-048 (supersedes D-026/D-035)
**Next:** 6.5 — live data layer (provider switch; metrics-proxy). Netlify single-
site deploy is a later change.
**Issues:** —

## Session 21 — 2026-07-31 — Hotfix: MFA enrollment stuck (422)
**Fixed** a stuck "Preparing MFA…" screen (422 on `POST /auth/v1/factors`) hit
while manually testing 6.4b. React StrictMode double-invoked MfaStepUp's prepare
effect in dev → two `mfa.enroll` calls; the second 422'd and orphaned an
unverified factor, which `hasVerifiedTotp()` then ignored, so every reload
re-enrolled and re-422'd. `enrollTotp()` now unenrolls stale `totp/unverified`
factors before enrolling; MfaStepUp guards its prepare with a `useRef` (runs once
per mount, StrictMode-safe). Verified: cleanup + enroll returns a QR/secret.
**Decisions:** D-047
**Next:** 6.5 — live data layer.
**Issues:** —

## Session 20 — 2026-07-31 — 6.4b Owner user-mgmt + owner sub-roles + Phase-0 sec fix
**Built:**
- **Phase 0 (security, D-043)** — migration `20260731000002` locks down profiles
  self-edit via column-level UPDATE grant (`revoke update … ; grant update
  (full_name)`), killing the self-escalation path (member → owner/super_admin or
  org jump). rls_test extended to prove it.
- **Edge Function owner lane (no fork, D-044)** — `authorize()`→`loadCaller()` +
  `requireSuperAdminAal2`/`requireOwnerAal2`; new owner actions
  `owner_invite_user` / `owner_assign_sub_role` / `owner_set_user_status`, all
  own-org + own-type + AAL2, audit w/ org_id.
- **Owner sub-roles (D-045)** — migration `20260731000003`: `current_account_type()`
  helper + `sub_roles_owner_insert/update` policies (org-scoped, non-system,
  AAL2). Owners write these via the direct RLS-gated client.
- **Owner AAL2 (D-046)** — `needsMfa` now covers `profile.role==='owner'`.
- **Owner UI** — `OrgUsersPage` (`/users`, owner-gated) in cloud + onprem portals:
  user list, invite, assign sub-role (SlideOver), disable/enable, + custom
  sub-role editor (Toggle-based perms). Nav item `ownerOnly`, filtered in Sidebar
  by profile.role. Client helpers in `provisioning.ts`; hooks `useOrgUsers`,
  `createOrgSubRole`/`updateOrgSubRole` in `useProvisioning.ts`.
**Verified (honest, local `functions serve --no-verify-jwt`):** rls_test ALL
PASSED (self-escalation denied per column; owner sub-role own-org ok / cross-org
+ system + is_system denied; cross-org profile update 0 rows; existing isolation).
Owner-lane suite 14/14: AAL1 owner→403, member→403, owner→invite_super_admin 403,
own-org invite/assign/disable/enable→200, cross-org→403, wrong-type sub-role→400,
self-disable→400, direct sub-role RLS (own ok / cross+system 42501), owner-invited
member accept→active. typecheck/lint/build green ×3; no service-role key in
bundles; OrgUsersPage DCE'd from the admin bundle, present in cloud/onprem.
**Deviations:** none. (Owner sub-role DELETE deferred — edit only this phase.)
**Decisions:** D-043–D-046
**Next:** 6.5 — live data layer (provider switch; metrics-proxy Edge Function;
rebuild global search + ErrorBoundary).
**Issues:** — (cloud Supabase project URL/keys still user-provided; provisioned
orgs shown via pending-invites until 6.5; metrics still mock via external_ref)

## Session 19 — 2026-07-31 — 6.4a Provisioning engine + super-admin user mgmt
**Built:** the super-admin half of RBAC/provisioning.
- **Edge Function** `supabase/functions/provisioning` (Deno, action router) — the
  sole service-role holder; self-authorizes (super_admin + AAL2 from the JWT)
  before every action: `provision_org`, `invite_super_admin`, `assign_sub_role`,
  `set_user_status`, `accept_invite`. Every action writes audit_log w/ org_id.
- **Migration** `20260731000001_service_role_grants.sql` — grants DML to
  `service_role` (6.1 granted only `authenticated`; service-role writes were
  permission-denied).
- **Invite-accept**: `/accept-invite` top-level route + `AcceptInvitePage`
  (outside RequireAuth); set password → `accept_invite` flips invited→active.
- **Admin UI**: `SuperAdminsPage` (`/admin-users`, nav item) — list/invite/change
  sub-role (SlideOver)/disable-enable, reusing DataTable/Modal/SlideOver/
  StatusBadge/Tooltip. `AddCustomerButton` + `PendingInvitesPanel` on both
  customer-list pages. Client wrapper `src/lib/provisioning.ts`; Postgres reads
  in `src/hooks/useProvisioning.ts`.
- config.toml: added `/accept-invite` redirect URLs.
**Verified (honest, local `functions serve --no-verify-jwt`):** no-token→401,
non-super→403, AAL1 super→403, AAL2 super→200 for provision_org +
invite_super_admin; invite email lands in Mailpit; full accept flow (verifyOtp →
set password → accept_invite → status=active → sign-in with new pw); disable/
enable/assign_sub_role green; audit rows present with org_id. typecheck/lint/
build green ×3 portals; admin-only pages DCE'd from cloud/onprem bundles; grep
dist → no service-role key value (only supabase-js's `startsWith("sb_secret_")`
format check). rls_test assertions pass after `db reset` (Wstat 0).
**Deviations:** added D-039 grants migration (unplanned but required). Provisioned
orgs don't show in the mock-backed customer table yet (6.5) — surfaced via the
pending-invites panel instead.
**Decisions:** D-038–D-042
**Next:** 6.4b — customer-owner-facing user mgmt + owner-defined sub-roles (+RLS)
+ customer-owner AAL2 step-up.
**Issues:** — (cloud Supabase project URL/keys still user-provided; metrics still
mock via external_ref bridge until 6.5)

## Session 18 — 2026-07-30 — Fix: demo login / seed robustness
**Diagnosed** the admin-portal "Incorrect email or password". Step-1 query
showed all 4 demo users present, `email_confirmed_at` set, `has_pw` true,
`aud`/`role`=authenticated — but `auth.identities` had 0 rows. A live GoTrue
password request for super@refold.internal (and owner@prismanalytics.io)
nonetheless **returned tokens**, so the seed is functionally correct and the
missing identities are not the blocker in GoTrue v2.193.
**Root cause:** `supabase start` re-runs `seed.sql` only on a fresh db init; on a
persisted/older volume it does not reseed, so a stale local db lacks the current
demo users → GoTrue rejects the login. Fix is `supabase db reset`.
**Fix:** documented `db reset` prominently in the README Supabase section (the
actual remedy for the user); and hardened the seed with a matching
`auth.identities` row per demo user (robustness / GoTrue-version future-proofing).
**Verified (honest):** after `db reset`, 4 email identities seeded; a throwaway
anon-client script signed in super + cloud (both AAL1 sessions); rls_test green.
Login now works after a reset; a plain `start` on a stale volume still needs a
reset (documented).
**Decisions:** D-037
**Next:** 6.4 — RBAC + provisioning UI.
**Issues:** —

## Session 17 — 2026-07-30 — 6.3 Portal split (VITE_PORTAL)
**Built:** one repo → three portals. `src/config/portal.ts` resolves/validates
`VITE_PORTAL` (default admin, throw on invalid) and maps portal↔account_type↔role
+ display names. Per-portal route modules `src/portals/{admin,cloud,onprem}/
routes.tsx` import only their own pages; `router.tsx` selects children off the
inlined env literal so Rollup DCEs the other portals. Portal↔account_type guard
layered into `RequireAuth` (order: session → profile → portal match → AAL2):
wrong-type users get a `WrongPortal` screen naming the correct portal + Sign out.
Removed the now-superseded `RouteGuard` (only the portal guard gates role now;
`OrgScopeGuard` stays on :orgId routes). Sidebar logo shows the portal name.
README rewritten (portals + demo creds + per-portal run), replacing the stale
password-gate/role-switcher text.
**Verified (honest):** typecheck + lint green; all three `VITE_PORTAL` builds
green; per-bundle grep confirms no cross-portal leakage — Overview page only in
the admin bundle, Namespaces page only in onprem. (Wrong-portal guard verified by
code/build; not browser-automated.)
**Deviations:** onprem portal includes the org/namespace detail routes (D-036);
metrics still mock via the external_ref bridge (unchanged).
**Decisions:** D-035, D-036
**Next:** 6.4 — RBAC + provisioning UI.
**Issues:** cloud Supabase project (URL/keys) still to be created by the user.

## Session 16 — 2026-07-30 — Phase-0 org_id amendment + 6.2 Auth + MFA
**Built:**
- **Phase 0 (D-032):** new append-only migration adds nullable `org_id` to
  `sub_roles` + `audit_log`; drops/recreates the affected SELECT policies
  (sub_roles: system rows global + org rows scoped; audit_log: super_admin OR own
  org). Extended `rls_test.sql` (owner sees system + own-org sub-roles, not
  another org's). Confirmed the columns were absent first.
- **6.2 Auth + MFA:** `@supabase/supabase-js` + `src/lib/supabase.ts` browser
  client; `SupabaseAuthProvider` loads session + profile(+org) + AAL and
  re-implements `useAuth()` as a compat shim (`account_type→UserRole`,
  `user.orgId = org.external_ref` mock bridge — D-033), so all 12 useAuth
  consumers work unchanged. `/login` is now real email+password. TOTP MFA:
  `MfaStepUp` (enroll with QR/secret, else challenge); `RequireAuth` requires a
  Supabase session and forces AAL2 for super_admin (D-034). Removed the dev
  role-switcher (D-026/D-002) and placeholder password gate (D-031/D-023);
  deleted AuthContext, AuthGateContext, useAuthGate; sign-out now calls Supabase.
  Enabled TOTP in config.toml; added `src/vite-env.d.ts`; eslint ignores
  `supabase/`.
**Verified (local stack, honest):** rls_test green; a node script driving the
anon client proved cloud-owner sign-in + profile/org load + external_ref bridge
+ aal1 + RLS cross-org isolation, and super_admin aal1 → TOTP enroll → verify →
**aal2** → sees all orgs. typecheck/lint/build green.
**Deviations:** metrics still served by the mock provider via the external_ref
bridge (by design until 6.5).
**Decisions:** D-032, D-033, D-034
**Next:** 6.3 — Portal split (VITE_PORTAL).
**Issues:** cloud Supabase project (URL/keys) still to be created by the user.

## Session 15 — 2026-07-29 — 6.1 Supabase project + schema + RLS
**Built:** kicked off Phase 6 (re-architecture per docs/build-spec-v2.md, which
was missing from the repo and is now committed). Backend only, no UI.
`supabase init` + local dev stack. Migrations: § 4 enums; the 6 tables
(organizations, sub_roles, profiles [1:1 auth.users], invitations, audit_log,
saved_report_configs) with FKs/indexes + authenticated grants; helper functions
`is_super_admin` / `current_org_id` / `is_owner` / `is_aal2` (SECURITY DEFINER,
fixed search_path — no RLS recursion); RLS enabled on every table with § 5
policies (super_admin full; customers scoped by org_id; owners provision within
org, AAL2-gated; members read-only + own-profile self-edit; audit append-only);
system seed (internal Refold org + is_system sub-role sets). Local demo fixtures
in seed.sql (2 orgs + 4 users). `.env.example` gains Supabase key names +
VITE_PORTAL/VITE_DATA_SOURCE; README gains a Supabase/RLS-test section;
.gitignore covers supabase local state.
**Verified (fresh local db, Docker):** all 5 migrations apply cleanly + seed
runs; `supabase/tests/rls_test.sql` → "ALL RLS TESTS PASSED" (Prism owner sees
only their org, Meridian owner sees 0 Prism rows, super_admin sees all); AAL2
write gate confirmed (aal1 super-admin insert blocked, aal2 allowed).
**Decisions:** D-025–D-031 (numbering shifted from the brief's D-024–D-030 since
D-024 = ErrorBoundary was already taken).
**Next:** 6.2 — Auth + MFA.
**Issues:** cloud Supabase project (URL/keys) still to be created by the user;
Refold/Facets API docs needed for 6.5.

## Session 14 — 2026-07-23 — Hotfix: global search crash + route ErrorBoundary
**Built:** fixed a full-page crash regression from 5.11/5.12. `GlobalSearch`
rendered the dropdown body with `data!.organizations` (non-null assertion), but
on the first keystroke the debounced query is still empty so `useSearch` returns
`data: undefined` → "Cannot read properties of undefined (reading
'organizations')". Reworked the body to key on `!data` ("Searching…") → empty
("No results") → groups, dropping the fragile `noResults`/`isFetching` logic and
every `data!` deref. FilterInput mode (customer-list pages) was already a
separate component that never touches `data` — confirmed both modes. Added a
route-level `errorElement` (`RouteError`) on the app + login routes so a render
throw shows a friendly page with Back/Reload instead of a dev stack trace
(closes the Phase-1 gap: 5.12 item 3 covered data-fetch errors, not render
throws). typecheck/lint/build green.
**Deviations:** —
**Decisions:** D-024
**Next:** deploy to Vercel (user's manual step) — build blocks 5.1–5.12 complete.
**Issues:** —

## Session 13 — 2026-07-23 — 5.12 Polish pass (all 3 phases landed)
**Built:**
- **P1 Polish:** `useMediaQuery` hook; sidebar collapses to icon-only at ≤1200px
  with Tooltip labels, AppLayout margin follows suit (works to 1024px). Topbar
  now syncs `document.title` per route. Added EmptyState fallbacks to the God
  View cloud/on-prem tables. Audited empty/skeleton/error/tooltip/date coverage —
  already conformant from prior blocks (search intentionally has no error sim).
- **P2 (5.3 gap):** `FeatureFlagOverviewCard` on the God View — global flags with
  Toggles, reusing `useFeatureFlags()` + Toggle and D-017 Save semantics
  (console-log, no persistence).
- **P3 Deploy prep:** placeholder password gate (§11.4) — `AuthGateContext` +
  `useAuthGate` + `RequireAuth` wrapping AppLayout; `/login` rewritten from the
  role-picker into a password gate (demo `refold-demo-2025`); sidebar "Sign out".
  Orthogonal to the mock role system (AuthContext). Added `.env.example` and a
  README with the §11.2 deploy steps. Verified vercel.json rewrite + vite outDir.
  typecheck/lint/build all green.
**Deviations:** `/login` repurposed from role-picker → password gate (D-023);
role-switching stays in the sidebar. Vercel deploy left to the user (manual).
**Decisions:** D-022, D-023
**Next:** deploy to Vercel (user's manual step) — build blocks 5.1–5.12 complete.
**Issues:** —

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