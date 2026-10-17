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

## D-024 — Route-level ErrorBoundary for render throws (2026-07-23)
Added a React Router `errorElement` (`RouteError`) on the app and login routes so
a component that throws during render shows a friendly page (Back to overview /
Reload) instead of a full-page dev stack trace. D-003's error handling (skeleton +
Retry, 10% sim) only covers async data-fetch failures inside sections; a render
throw (e.g. the SearchDropdown `data!` bug) bypassed all of it. This is the
render-throw safety net. Prefer fixing the throw at its source (done for search);
the boundary is defence-in-depth.

# ── Phase 6 (re-architecture; see docs/build-spec-v2.md § 13) ──────────────────

## D-025 — Auth + DB = Supabase (2026-07-29)
Phase 6 uses Supabase (Postgres + Auth + Edge Functions) for auth, database, and
the server layer. Supersedes the earlier Mongo Atlas idea and closes the
managed-provider question. RLS-scoped Postgres is the system of record for
identity/app data; Edge Functions hold secrets and call Refold/Facets.

## D-026 — Three portals from one repo via VITE_PORTAL (2026-07-29)
Separate admin / cloud / onprem portals selected at build time by `VITE_PORTAL`,
deployed as three Netlify sites from one repo. Supersedes D-002 (the dev
role-switcher is removed) and the D-016 topbar role logic. Real auth + the
portal↔account_type guard replace in-app role toggling.

## D-027 — Data split; mock RETAINED as fallback provider (2026-07-29)
Postgres holds identity/app data; Refold+Facets provide live metrics. Metrics go
through a provider switch (`VITE_DATA_SOURCE` = mock | live, + optional
per-endpoint override) with **mock as the default fallback** so dashboards never
render blank. Endpoints flip to live individually; the mock is removed only once
all are live and verified. D-005/D-009/D-011 live on as the mock provider — not
retired.

## D-028 — Tenant isolation via Postgres RLS (2026-07-29)
Org scoping is enforced at the database layer by RLS (the `is_super_admin()` /
`current_org_id()` helpers + per-table policies), so a customer can never read
another org's rows regardless of client behaviour. This demotes the app-layer
OrgScopeGuard (D-014) to defense-in-depth rather than the primary guarantee.

## D-029 — MFA/AAL2 required for privileged writes (2026-07-29)
Super-admin write actions and all provisioning require AAL2 (`auth.jwt()->>'aal'
= 'aal2'`), enforced in RLS via `is_aal2()`. Self-profile edits do not require
AAL2. Verified locally (aal1 super-admin insert blocked, aal2 allowed).

## D-030 — Exports are .xlsx only, generated server-side (2026-07-29)
QBR/data exports are `.xlsx` only, built inside the `export-xlsx` Edge Function
(SheetJS/exceljs) — never client-side, and distinct from the doc-authoring xlsx
skill. Lands in 6.6.

## D-031 — Remove placeholder password gate once 6.2 lands (2026-07-29)
The § 11.4 placeholder password gate (D-023) is removed when real Supabase auth
+ MFA ships in 6.2. Until then it stays. (Not removed this session — 6.1 is
backend only.)

## D-032 — sub_roles & audit_log carry nullable org_id (2026-07-30)
Amends the 6.1 schema (approved in the 6.1 go-ahead, missed in the shipped
migrations). Adds a nullable `org_id` FK to `sub_roles` and `audit_log` via a new
append-only migration (existing ones untouched). `sub_roles.org_id` NULL =
system/global sub-role, non-null = org-defined; RLS `sub_roles SELECT` becomes
`org_id IS NULL OR org_id = current_org_id() OR is_super_admin()` and `audit_log
SELECT` becomes `is_super_admin() OR org_id = current_org_id()` (INSERT stays
append-only). 6.1 seeds/writes system-level only; owner-defined org sub-roles and
owner-visible audit land in 6.4. Verified by extended rls_test.

## D-033 — Compat useAuth mapping + external_ref orgId bridge (2026-07-30)
6.2 replaces the mock role system with Supabase identity, but the 5.x pages keep
consuming `useAuth() -> { role, user }`. A shim maps `account_type ->
UserRole` (super_admin→super_admin, cloud_customer→cloud_customer_admin,
onprem_customer→onprem_customer_admin) and exposes `user.orgId = org.external_ref`,
which holds the MOCK org id (org_cloud_001 …) so the still-mock metrics hooks
(D-027) render for real users. This bridge is transitional and goes away when 6.5
wires live metrics. Supersedes the mock AuthContext.

## D-034 — AAL2 enforced for super_admin in 6.2 (2026-07-30)
super_admin must reach AAL2 (TOTP) before the app renders (RequireAuth →
MfaStepUp), matching the RLS is_aal2() gate (D-029). Customer owners enter at
aal1 in 6.2 (no write actions until provisioning in 6.4) — their AAL2 step-up
lands with 6.4. Required enabling TOTP in supabase/config.toml
(`[auth.mfa.totp] enroll_enabled/verify_enabled = true`). Verified end-to-end
locally: super_admin aal1 → enroll → verify → aal2.

## D-035 — Portal split via VITE_PORTAL; match guard in RequireAuth (2026-07-30)
One repo builds three portals selected by `VITE_PORTAL` (src/config/portal.ts —
validates, defaults to admin when unset, throws on an invalid value). Per-portal
route modules (src/portals/{admin,cloud,onprem}/routes.tsx) import only their own
pages; the router picks children off the inlined `import.meta.env.VITE_PORTAL`
literal so Rollup dead-code-eliminates the other portals (verified: Overview only
in the admin bundle, Namespaces only in onprem). The portal↔account_type match is
layered into RequireAuth (not a parallel guard): a wrong-type user gets the
WrongPortal screen naming the correct portal + a Sign out button (no auto-signout,
so the message doesn't flash). Nav reuses D-016 (`NAV_BY_ROLE[role]`) — role↔portal
are 1:1 post-guard. The per-route role `RouteGuard` is removed as superseded by
the portal guard; `OrgScopeGuard` stays on :orgId routes (defense-in-depth, D-028).

## D-036 — onprem portal includes org/namespace detail routes (2026-07-30)
Beyond the literal "dashboard/namespaces/settings," the onprem portal also
registers `/onprem-customers/:orgId/namespaces/:namespaceId` (Dashboard/Namespaces
"View" target) and `/onprem-customers/:orgId` (namespace-detail "back to
organization" target) — both OrgScopeGuard-scoped to the user's own org, matching
the CLAUDE routing table's grants to onprem_customer_admin. Without them those
links 404. The cloud portal stays minimal (`/dashboard` + `/settings`) since the
cloud dashboard renders the org detail inline.

## D-037 — Demo seed adds auth.identities; reseed requires db reset (2026-07-30)
Investigating an admin-portal "Incorrect email or password": the seed itself is
correct (live sign-in for super/cloud returns tokens; users are confirmed with
aud/role=authenticated). Root cause is operational — `supabase start` runs
seed.sql only on a fresh db init, so a persisted/older local volume never gets
the current demo users; the fix is `supabase db reset` (now called out
prominently in the README). Separately hardened the seed to insert a matching
`auth.identities` row per demo user (email provider, identity_data with
sub+email) so the fixtures match how GoTrue creates real users and stay valid
across GoTrue versions — password login worked without them on v2.193, but this
future-proofs it. No app/schema change; seed.sql + docs only.

## D-038 — Provisioning via a single service-role Edge Function it self-authorizes (2026-07-31)
All 6.4a privileged writes go through one `supabase/functions/provisioning`
Edge Function (action router: `provision_org`, `invite_super_admin`,
`assign_sub_role`, `set_user_status`, `accept_invite`). It is the only holder of
the service-role key (D-025/§10). Because the service-role client BYPASSES RLS,
the function verifies the caller ITSELF before every action: builds a caller
client from the bearer, requires `account_type='super_admin'`, and requires the
JWT `aal` claim = `aal2` (decoded from the token, no round-trip) — matching the
RLS is_aal2() gate (D-029). `accept_invite` is the one self-service action
(bypasses the super_admin gate; instead verifies the caller is flipping their own
still-`invited` profile). Every action writes an audit_log row with org_id
(D-032). Verified locally: no-token→401, non-super→403, AAL1 super→403, AAL2
super→200 for all actions.

## D-039 — service_role needs explicit table GRANTs (2026-07-31)
The 6.1 tables migration granted DML only to `authenticated`, so the Edge
Function's service-role writes hit "permission denied for table …" (service_role
bypasses RLS but still needs table privileges). Added append-only migration
`20260731000001_service_role_grants.sql` granting select/insert/update/delete on
all six public tables to `service_role`. Earlier migrations untouched.

## D-040 — Invited super-admins are role=member + a sub-role (2026-07-31)
`invite_super_admin` creates the profile with `role='member'` (the seeded
internal super stays `owner`); the assigned is_system sub-role (Support / Billing
/ Read-only) carries their permissions. Only existing (is_system) admin sub-roles
are assigned in 6.4a; defining new org sub-roles is owner-scoped 6.4b work.

## D-041 — Disable = profile status + auth ban (reversible) (2026-07-31)
`set_user_status('disabled')` sets `profiles.status='disabled'` AND bans the auth
user (`admin.updateUserById ban_duration`), so a disabled account can't sign in;
enabling clears both. Verified locally.

## D-042 — accept-invite is a top-level route; provisioned orgs shown via pending-invites (2026-07-31)
Invite-accept lives at `/accept-invite`, a top-level route outside RequireAuth
(present in every portal) so a still-`invited`, possibly wrong-portal, pre-MFA
user can set a password without being bounced. detectSessionInUrl consumes the
emailed tokens → set password → `accept_invite` flips status→active + audit.
Because the customer-list pages still render from MOCK data (D-027), a
Postgres-provisioned org won't appear in the table until 6.5 — so the admin
customer pages surface a Postgres-backed "Pending owner invites" panel instead,
making the action visible and honest.

## D-043 — profiles self-edit locked down via column-level UPDATE grant (2026-07-31)
The profiles_update RLS self-edit branch (`id = auth.uid()`) combined with the
6.1 table-wide UPDATE grant let a user change ANY column on their own row
(role/account_type/sub_role_id/org_id/status) — a privilege-escalation path.
Fixed at the Postgres PRIVILEGE layer (append-only migration
`20260731000002`): `revoke update on profiles from authenticated` then
`grant update (full_name) on profiles to authenticated`. Any authenticated
UPDATE touching a privileged column now fails 42501, independent of RLS logic.
Chosen over a BEFORE UPDATE trigger because column privileges can't be bypassed
by a policy mistake and are trivially provable. Privileged transitions are
unaffected — they run through the Edge Function under `service_role` (bypasses
column grants; D-039). Also blocks self email-change (intentional). rls_test
extended: member 1004 can self-edit full_name but every privileged-column
self-edit raises insufficient_privilege.

## D-044 — Edge Function owner lane (own-org, own-type, AAL2) (2026-07-31)
The provisioning Edge Function gained a second authz lane (no fork). `authorize()`
became `loadCaller()` (identity + profile only); each action then applies
`requireSuperAdminAal2` (6.4a, unchanged) or `requireOwnerAal2`. Owner lane:
caller must be `role='owner'` AND `account_type ∈ {cloud_customer,onprem_customer}`
AND AAL2. Owner actions `owner_invite_user` / `owner_assign_sub_role` /
`owner_set_user_status` force `org_id = caller.orgId` and `account_type =
caller.accountType`, validate any sub-role belongs to the caller's type + (system
or own org), never create super-admins, never change account_type, and block
self-status-change. Each writes audit_log with org_id. Verified: AAL1 owner→403,
member→403, cross-org→403, wrong-type sub-role→400, self-disable→400, owner
inviting super-admin→403; own-org invite/assign/disable/enable→200.

## D-045 — Owner-defined org sub-roles via direct RLS-gated writes (2026-07-31)
Owners create/edit their OWN org's non-system sub-roles through the direct
(RLS-gated) client — not the Edge Function. Migration `20260731000003` adds a
`current_account_type()` SECURITY DEFINER helper and two additive policies
(OR-combined with the super-admin ones): `sub_roles_owner_insert` /
`sub_roles_owner_update` require `is_owner() AND is_aal2() AND is_system=false AND
org_id = current_org_id() AND account_type = current_account_type()`. System
sub-roles (org_id NULL) stay super-admin-only (D-032); owner DELETE is out of
scope this phase (edit, don't delete). rls_test proves own-org insert works while
cross-org / system / is_system=true inserts raise 42501, and another org's owner
can't see the row.

## D-046 — Customer owners now AAL2-gated (D-034's deferred half) (2026-07-31)
Owners have write actions in 6.4b, so `needsMfa` in AuthProvider now triggers for
`role === 'super_admin' || profile.role === 'owner'` — owners must reach AAL2
(RequireAuth → MfaStepUp, reused) before the app renders, matching the RLS
is_aal2() gate and the Edge Function's owner-lane AAL2 check. Members stay AAL1.
Completes D-034. The owner user-management UI (`OrgUsersPage`, `/users`) is
owner-gated (nav filtered by profile.role + in-page AccessDenied for members) and
mounted in the cloud + onprem portals.

## D-047 — MFA enroll cleans up stale unverified factors; step-up runs once (2026-07-31)
Testing 6.4b surfaced a stuck "Preparing MFA…" screen with `POST /auth/v1/factors`
422. Root cause: React 18 StrictMode double-invokes the MfaStepUp prepare effect
in dev → two concurrent `mfa.enroll` calls; the second 422s (a second enroll
while one is pending is rejected) and orphans an unverified TOTP factor.
`hasVerifiedTotp()` ignores unverified factors, so every reload re-enrolled and
re-422'd. Fix: (1) `enrollTotp()` now lists factors and unenrolls any
`totp/unverified` ones before enrolling (a prior factor's secret/QR can't be
recovered, so discard-and-re-enroll is correct); (2) MfaStepUp guards its prepare
with a `useRef` so it runs exactly once per mount (StrictMode-safe), resetting the
guard on error to allow retry. Would have bitten any first-time super_admin/owner
enrollment in dev. Verified locally: cleanup unenrolls the orphan then enroll
returns a QR+secret; user left with zero factors for a clean slate.

## D-048 — R1: unify the three portals into one app + single login (2026-07-31)
Reverses the portal split. **Supersedes D-026 and D-035** (VITE_PORTAL build
selection + the portal↔account_type match guard + WrongPortal screen) — does not
edit them. One build now registers ALL routes in a single tree
(`src/router.tsx`); the `src/portals/{admin,cloud,onprem}/routes` modules,
`src/config/portal.ts`, and `src/lib/auth/WrongPortal.tsx` are deleted, and
`VITE_PORTAL` is retired (removed from vite-env/.env/.env.example). One `/login`
for everyone; after auth the app redirects to the role's home via
`homeRoute(role)` (super_admin→/overview, cloud→/dashboard, onprem→/namespaces) —
LoginPage already did this, plus a new `IndexRedirect` handles direct `/` hits and
the catch-all routes to `/`. RequireAuth is now just: session → (super_admin/owner
→ AAL2 MfaStepUp) → render (portal match removed). Per-route role protection
returns via `RouteGuard` (the D-035-removed guard restored): a user hitting a
route their role can't access gets the shared AccessDenied page, never a silent
redirect; `OrgScopeGuard` stays on :orgId routes (RLS remains the real guarantee,
D-028); nav stays role-based (NAV_BY_ROLE/homeRoute, D-016). To make onprem land
on /namespaces per the requirement while keeping the `homeRoute = first nav item`
invariant, the onprem nav is reordered (Namespaces first). Everything else
intact: Supabase auth + MFA (D-034/D-046/D-047), provisioning Edge Function, RLS,
mock metrics via external_ref (D-033). Deployment implication: now ONE site (not
three); the actual Netlify single-site deploy is a later change. Verified locally:
all three demo users sign in through the same /login and resolve to the correct
role + landing route (super→/overview, cloud→/dashboard, onprem→/namespaces);
role-mismatched routes render AccessDenied (RouteGuard); one build, typecheck/
lint/build green.

## D-049 — On-prem hierarchy corrected to cluster → namespace → org → tenant (2026-07-31)
R2 amends build-spec §4. Previously tenants/metrics were shown per NAMESPACE,
which was wrong: a namespace is infra that hosts multiple ORGS, and tenants + ALL
metrics (Tenant/Usage/Workflow/Connector/AI-credits) belong to the org. New nest:
customer org → clusters → namespaces → orgs (NamespaceOrg) → tenants/metrics.
Metrics stay MOCK (D-027) — this was a mock-data + UI restructure, no APIs. Split
into R2a (this session: data model + nesting + decommission) and R2b (feature-flag
cluster scope, next).

## D-050 — Cluster promoted to a first-class entity (2026-07-31)
`Cluster { id, customerOrgId, name, region?, status: 'active'|'decommissioned',
createdAt }`. A customer org owns clusters; each namespace belongs to a clusterId
(already carried) and is grouped under its cluster. `OnPremOrgDetail` now returns
`clusters: { cluster, namespaces }[]` instead of a flat namespaces array. Clusters
are decommissionable (see D-052). Mock: ONPREM_CLUSTERS metadata (5 clusters
across the 3 demo customers); God View totals (org.totalNamespaces/totalClusters)
remain org-level and consistent with the nest, so no God-View change was needed.

## D-051 — NamespaceOrg entity; tenants/all metrics re-scoped to it; :nsOrgId route (2026-07-31)
New `NamespaceOrg` (displayed as "Organizations"; named to avoid colliding with
the top-level customer Organization): `{ id, namespaceId, name, plan?, status,
createdAt, contact?, tenants, activeUsers }`. Tenants + all DetailMetrics/Charts/
AiCredits are now fetched by nsOrgId (`fetchNamespaceOrgMetrics`/`fetchNamespaceOrg`/
`fetchNamespaceOrgs`), not the namespace — the DetailTabs/DetailMetrics shapes are
reused unchanged, just re-scoped. `NamespaceDetail` slimmed to header + namespace-
level env vars (metric-tab fields removed). New page `NamespaceOrgDetailPage` holds
the 5 metric tabs, nested under the namespace at `/onprem-customers/:orgId/
namespaces/:namespaceId/orgs/:nsOrgId` — a DISTINCT inner param `:nsOrgId` (never
`:orgId`, which stays the top customer). The namespace detail lists its orgs via the
shared DataTable in the Cloud-Customers column style (no fork). Env vars stay
namespace-level per the spec.

## D-052 — Decommission = ephemeral local status (extends D-009) (2026-07-31)
Cluster and namespace decommission reuse the confirmation Modal and set
`status='decommissioned'` in component-local state only (ephemeral; resets on
reload — like the upgrade/add-namespace mutations, D-009). Decommissioning a
cluster also decommissions its namespaces. Rendered via StatusBadge (new gray
`decommissioned` style); decommissioned rows disable upgrade/decommission and drop
their name link. This maps to the DELETE operations in the API sheet for later —
local-only for now (metrics stay mock, D-027).

## D-053 — Feature flags gain the cluster scope; panel is 4-scope (2026-07-31)
R2b completes the R2 hierarchy for flags. `FlagScope` becomes `global | cluster |
namespace | org` (adds `cluster`); the SlideOver's scope badge renders a Cluster
pill. The single `FeatureFlagsPanel` (no fork) now takes `scope` + `entityId` +
`entityName` instead of `orgId`/`orgName`; `useFeatureFlags(scope, entityId)` →
`fetchFeatureFlags(scope, entityId)`. Mock rule: `global` returns the whole pool
(all four scopes, for the /feature-flags management page); a specific scope returns
`global` + that scope's flags. Added 3 cluster-scoped flags (Cluster Autoscaling /
Node Pool Isolation / Cluster Mesh Routing). D-017 save semantics unchanged (local
draft; Save console-logs the diff; no persistence). New "Edit feature flags"
affordances on each cluster group header (NamespaceClusters) and the namespace
detail header, opening the panel scoped to that entity — gated to super_admin per
D-006 (flags are a Refold concern; owners don't see them). The three existing
triggers (org-detail button, customer-list flag icon, /feature-flags page) are
unchanged in behavior — updated only to pass `scope="org"`/global. Behavior nuance
(intentional): under the clean scope model an org panel now shows global+org only;
namespace flags moved to the namespace panel (previously an onprem org panel also
listed namespace flags via an id-string hack). Verified: tsx unit-check of all
four scope fetches; typecheck/lint/build green; interactive open-per-scope is
code-complete + build-verified, not headlessly click-asserted.

---

## D-054 — Retroactive close-out: 6.7 Netlify + cloud Supabase deploy is live (2026-10-07)
Logged now because it was never logged when it happened — several ad-hoc
sessions between R2b and this one shipped the actual 6.7 deploy without running
the end-of-session protocol, leaving CLAUDE.md's "Deployed: not yet" stale.
`netlify.toml` added (build `npm run build` → `dist`, SPA fallback rewrite);
repo linked to cloud Supabase project `xwtxrdxktbogswxuuetp` (ap-northeast-1);
all 9 then-existing migrations pushed and confirmed in sync; `provisioning`
Edge Function deployed (ACTIVE); `main` branch created from `dev` and kept
fast-forwarded as the Netlify deploy branch. The app is live at
`refold-control-plane.netlify.app`; demo logins work end-to-end against the
cloud project. The stale `vercel.json` is removed this session (superseded).
Pre-production cleanup (rotate tokens/keys, handle demo creds) stays parked,
below.

## D-055 — Product re-scoped to the Refold CS Hub (build-spec-v3 § 1, § 8.1) (2026-10-07)
Refold is moving away from Refold-assisted on-prem deployments (most installs
will be air-gapped, no API access). The product becomes the customer success
team's single system of record for every account across its lifecycle. Phase 7
(this phase) is **super-admin only** — account intelligence, fed by manual
entry and an agentic sync. Phase 8 (planned) adds lifecycle modules on the same
foundation. Customer-facing logins (cloud/on-prem owner) are **frozen**: kept
working, no new work. Phases 5–6 stay as the base (React UI, Supabase auth +
MFA + RLS, provisioning, single login, cluster→namespace→org→tenant, 4-scope
feature flags, Netlify + cloud Supabase).

## D-056 — Public-repo confidentiality rule (build-spec-v3 § 0, § 8.2) (2026-10-07)
This repository is public. Real customer names, health ratings, risks,
contacts, metrics, Slack/email content, and secrets may never be committed.
Real data enters only through the running app (manual entry, approved
proposals, or imports executed against the database) — never as files in git.
Seeds, fixtures, and examples use fictional companies. Added to CLAUDE.md's Key
coding rules. Verified this session by grepping the spec, the repo, and every
new fixture before committing.

## D-057 — One write pipeline: proposals + field-level provenance + DB-trigger audit (build-spec-v3 § 3, § 8.3) (2026-10-07)
Every input (manual, chat agent, agentic sync, file import) becomes either a
direct audited change (manual, applied immediately) or a proposal a logged-in
super admin approves. Every CS record carries provenance (`source`,
`source_ref`, `created_by`, `updated_by`, `verified_at`, `proposal_id`).
Approvals/audit are enforced by database triggers so nothing bypasses them
(§3.2) — see D-063/D-064 for the Phase 7.1 implementation of this.

## D-058 — One CS service user + one Refold MCP server; CS Sync Skill is the contract (build-spec-v3 § 4, § 8.4) (2026-10-07)
Agentic sync runs as a single generic CS service user through one MCP server
config exposing every tool the sync needs (Slack, email, ticketing, CRM, Drive,
Refold workflows/metrics). The CS Sync Skill (`skills/cs-sync`, built in 7.5)
is the one contract both the platform's Edge Function runner (Refresh + daily)
and a hand-run agent session follow. The platform runner posts structured
output to the ingest API itself — the model never holds the ingest token.

## D-059 — Sync unit = (account, record type) with a watermark (build-spec-v3 § 4.4, § 8.5) (2026-10-07)
`sync_state` keyed by `(org_id, record_type)` holds `last_synced_at` +
status/error/lock. A Refresh button and the daily pg_cron job share one code
path, differing only in which units they loop over. Idempotent via
`source_ref`; the watermark advances only on success.

## D-060 — Vocabulary: "project" = delivery workstream, "engagement" = touchpoint (build-spec-v3 § 2, § 8.6) (2026-10-07)
Phase 6 used "engagement" loosely; v3 fixes the meaning: **project** is a
delivery workstream (what the status deck calls a project; an account can have
several), **engagement** is a customer touchpoint (call/check-in/QBR/EBR/note).
Reflected in the new `projects` and `engagements` tables and TS types.

## D-061 — Old 6.5 → 7.5, old 6.6 → 7.7 (build-spec-v3 § 8.7) (2026-10-07)
The live-data-layer block (provider switch, metrics-proxy) folds into 7.5 (CS
Sync Skill + runner — Refold platform metrics now arrive via the MCP sync, not
a standalone metrics-proxy Edge Function). The QBR-export block folds into 7.7
(Reports — monthly status report + EBR pack generated from platform data).
PROGRESS.md marks both folded rather than dropped.

## D-062 — Data model v3 schema shape (build-spec-v3 § 5) (2026-10-07)
8 append-only migrations (`20261007000001`–`…008`): enums; `segments` +
`metric_definitions` lookups (seeded); `organizations` extended with
`segment_id`/`deployment_model`/`health`/`lifecycle_stage`/`owner_profile_id`/
`data_access_mode`/`aliases` (health defaults + auto-fills 'active'; lifecycle
defaults 'prospect' for new rows, existing rows explicitly backfilled to
'live'; deployment_model backfilled from deployment_type, left NULL for the
internal org); `proposals`/`sync_state`/`sync_runs` (their own schemas, no
generic provenance columns — they're pipeline plumbing, not CS records);
`projects` + `milestones`/`accomplishments`/`risks`/`asks`; `escalations`/
`tickets`/`engagements`/`metric_values`/`portfolio_notes`. Every CS record
table denormalizes `org_id` directly (even where the spec shorthand ties a
table only to `project`) so the per-org dedupe constraint and the generic audit
trigger both work without per-table joins; `portfolio_notes` has no `org_id`
(portfolio-wide per the domain model) and dedupes on `source_ref` alone.
Several enum value sets aren't explicit in the spec (milestone/risk/ask/
escalation/ticket status, severity, ticket priority) — chosen as sensible
defaults, called out inline in the enums migration, easy to extend later. Added
a few small integrity constraints beyond the literal spec text: natural-key
unique on `tickets(org_id, system, external_key)`, `metric_values(org_id,
metric_key, period, project_id)` NULLS NOT DISTINCT, and a `sort` column on
`metric_definitions`.

## D-063 — Generic audit trigger, one function for every table (build-spec-v3 § 3.2, § 5) (2026-10-07)
`public.write_audit_log()` — SECURITY DEFINER (same bypass pattern as
`is_super_admin()`/`is_aal2()`), reads OLD/NEW via `to_jsonb(...)` so one
function serves organizations + all 13 new CS/plumbing tables with no
per-table branches: `record_id` and `proposal_id` are read generically off the
row; `org_id` is read as-is for every table EXCEPT `organizations` itself,
which special-cases `org_id := id` (it IS the org — the one case a blind
id-fallback would have been correct for; a blind fallback for every table would
have wrongly stuffed `portfolio_notes`/`sync_runs`' own id into `audit_log.org_id`,
violating its FK and breaking every write to those two tables — caught and
fixed during this session's own verification before writing the migration).
`actor_id := auth.uid()`; when null (service-role/migration/seed context),
`on_behalf_of := current_user`. Populates both the legacy `target_type`/
`target_id` columns and the new `record_table`/`record_id` columns identically
(backward + forward compatible). Attached to `organizations` + 13 new tables;
deliberately NOT attached to `profiles`/`sub_roles`/`invitations`/
`saved_report_configs` (already manually audited by the provisioning Edge
Function — the trigger would double-log every provisioning action) or to
`segments`/`metric_definitions` (pure lookups, same treatment as system
sub-roles). Known accepted side effect: `organizations` now gets logged twice
for `provision_org` (manual Edge Function insert + trigger) — redundant, not
deduped this session.

## D-064 — audit_log hardened: trigger-only writes; owner-visible leak fixed (build-spec-v3 § 3.2) (2026-10-07)
Two changes to the existing `audit_log` table (append-only ALTER + one
drop/recreate of its SELECT policy, same pattern D-032/D-045 already used).
(1) `REVOKE insert, update, delete on audit_log` from both `authenticated` and
`service_role` — going forward the only writer is the SECURITY DEFINER trigger
(D-063), which bypasses the revoke via its owner's privileges regardless of
which role fired the statement; this is the literal enforcement of "nothing
bypasses it" (§3.2). (2) `audit_log_select` previously let a customer owner see
every audit row for their own `org_id`, which would have leaked Phase 7 CS data
(risks, escalations, …) to owners who have zero RLS access to the underlying
tables. Tightened to `is_super_admin() OR (org_id = current_org_id() AND
record_table = ANY(['organizations','profiles','invitations','sub_roles',
'saved_report_configs']))`. Existing historical rows (written with the old
singular `target_type` values `'organization'`/`'profile'`) are backfilled to
the new plural `record_table` form in the same migration — without this,
owners would have silently lost visibility into audit rows D-046 already
promised them. Verified by rls_test.sql: an owner sees 0 `audit_log` rows for
`record_table IN ('projects','risks')` even though `org_id` matches.

## D-065 — RLS pattern for every new table; fixtures reuse the existing fictional accounts (build-spec-v3 § 5) (2026-10-07)
Every new table (lookups included) gets the identical 4-policy shape already
established for `organizations`: SELECT `is_super_admin()`; INSERT/UPDATE/
DELETE `is_super_admin() AND is_aal2()`. Grants to both `authenticated` and
`service_role` (D-039). Local fixtures (`seed.sql`, never shipped) reuse the
two existing fictional demo accounts (Prism Analytics, Meridian Laboratories)
rather than inventing new org rows: one project each (health `on_schedule` /
`caution` for variety), milestones, accomplishments, risks, an ask, an
escalation, tickets, engagements, metric values, and 2 pending proposals.
Verified end-to-end by the extended `rls_test.sql`: AAL1 super-admin write
rejected; cloud owner, on-prem owner, and a member each see 0 rows across
`projects`/`risks`/`tickets`/`escalations` (proving "no access to any new
table," not just org-scoping); AAL2 super-admin CRUD produces exactly the
expected create/update/delete `audit_log` rows with correct before/after/
org_id; duplicate `(org_id, source_ref)` rejected while the same `source_ref`
in a different org succeeds (dedupe is per-org, not global).

## D-066 — Single environment until the first customer goes live (2026-10-07)
No staging tier yet: the cloud Supabase project `xwtxrdxktbogswxuuetp` is the
only database, and Netlify's production branch is now `dev` (the user switched
it in the Netlify dashboard) — **every push to `dev` deploys to production.**
Supersedes the "deploy from `main`" convention for now; `main` is left as-is
and becomes the prod branch again at go-live. Consequence enforced going
forward (added to the session protocol): if a session adds migrations, push
them to cloud (`supabase db push`) **before** pushing code to `dev`, since code
expecting a new table/column must never reach production ahead of the schema
that backs it. Verified this session: the 8 Phase 7.1 migrations (D-062–D-065)
pushed cleanly; `supabase migration list` shows all 17 migrations matching
local/remote.

## D-067 — Phase 7 demo data lives in its own idempotent, admin-agnostic file (2026-10-07)
Extracted the Phase 7.1 fictional fixtures out of `seed.sql` into
`supabase/demo/phase7_demo_data.sql`, loaded locally via a second entry in
`[db.seed].sql_paths` (config.toml) — **not** via a `psql` `\i`/`\ir` meta-command,
which the Supabase CLI's seed runner does not support (confirmed by a failing
`db reset` before the fix: `syntax error at or near "\\"`). The file resolves
its `created_by`/`updated_by`/`owner_profile_id`/`edl_profile_id` attribution
dynamically (`select … from profiles where account_type='super_admin' order by
created_at limit 1`) rather than a fixed demo profile id, and creates its own
two fictional organization rows (Prism Analytics / Meridian Laboratories,
`ON CONFLICT DO NOTHING`) if they don't already exist — both fixes needed
because the cloud project has neither the local demo seed's profiles nor its
orgs, only the migrated schema. Creates no auth users; idempotent (every write
is a plain UPDATE, an `ON CONFLICT DO NOTHING` keyed insert, or a natural-key
upsert on `metric_values`); safe to paste into the cloud SQL Editor more than
once. Not run against cloud this session — the user runs it if/when they want
demo data on the live site. Verified locally: `db reset` seeds both files in
order without error; `rls_test.sql` still passes in full afterward.

## D-068 — PostgREST embeds must name the FK when tables have multiple relationships (2026-10-07)
**Production hotfix.** 7.1's `organizations.owner_profile_id → profiles` FK
gave `organizations`/`profiles` a SECOND relationship alongside the original
`profiles.org_id → organizations`. PostgREST can no longer infer which one an
unqualified embed means, so `AuthProvider.loadProfile()`'s
`.select('…, organizations(name, deployment_type, external_ref)')` started
returning `300 PGRST201` ("more than one relationship was found") in
production — sign-in succeeded (token returned) but the profile never loaded,
so every user stayed stuck on `/login`. Fixed by naming the relationship
explicitly: `organizations!profiles_org_id_fkey(...)`. The `!fkey` hint does
not change the response's JSON key (stays `organizations`), so no other code
needed to change. Audited every `.select()` embed in `src/` and
`supabase/functions/`: the two `profiles → sub_roles(name)` embeds and the one
`invitations → organizations(name)` embed are each still single-relationship
(confirmed by grepping every FK in every migration, not just assumed) and were
left unchanged; the Edge Function has zero embeds at all, so no redeploy was
needed. Added a permanent **role-login smoke check**
(`scripts/smoke-login.ts`, reads credentials from env vars, no passwords in
the repo) that signs in as each demo role and runs the exact profile query
AuthProvider uses — added to the session protocol: run it against a fresh
`db reset` before pushing any session that adds migrations, since exactly this
class of bug (a new FK silently breaking an unrelated existing embed) is build-
time invisible and only surfaces at runtime. Also added a standing coding rule:
check for a second FK before adding one near an existing embedded relationship.
Verified: all three demo roles (super_admin, Prism owner, Meridian owner) sign
in and load their profile + organization cleanly against a fresh local
`db reset`; typecheck/lint/build green.

## D-069 — set_title lives in the provisioning Edge Function (2026-10-08)
`profiles.title` (head_of_cs/edl/ta/fde) is only writable via a new `set_title`
super_admin + AAL2 action, mirroring `assign_sub_role`/`set_user_status`'s
exact shape (validate, service-role UPDATE, write audit) rather than
introducing a second mechanism (a SECURITY DEFINER RPC) for the same kind of
action. D-043's column-grant lockdown already restricts `authenticated` direct
UPDATEs on `profiles` to `full_name` alone — `title` was simply never added to
that grant, so no RLS/grant change was needed to protect it, only the ALTER
TABLE adding the column (+ a CHECK tying it to `account_type='super_admin'`).
Local fixtures (seed.sql, never cloud): 6 fictional CS people — Dana Whitfield
(head_of_cs), Reza Karimi (edl), Lena Novak (ta), Tomás Rivera/Grace Mwangi/
Owen Baptiste (fde) — full login-capable auth users, same pattern as the
existing demo logins, so a human can actually sign in as each title and see
scoped views. "Do not add these to the cloud demo-data script — real team
setup happens in the UI."

## D-070 — organizations.owner_profile_id kept as a DERIVED column (2026-10-08)
Replaces the plan's original "keep or retire" open question. `owner_profile_id`
stays, but becomes fully derived: primary EDL assignment → else primary TA →
else NULL (`compute_org_owner()`). Enforced by a trigger, not convention — a
`BEFORE INSERT OR UPDATE` trigger on `organizations`
(`force_org_owner_profile_id`) recomputes and overwrites the column on every
write regardless of what was supplied, so even a future "Add account" flow
(7.2b) or an ad hoc SQL edit can't desync it; a companion `AFTER` trigger on
`account_assignments` propagates a recompute whenever an assignment changes. A
partial unique index enforces at most one primary person per (account, role).
Backfilled once from any pre-existing `owner_profile_id` value (the 7.1 Prism
fixture) into a primary EDL assignment row. Verified (rls_test.sql): a direct
`UPDATE organizations SET owner_profile_id = …` is silently corrected back to
the real computed value.

## D-071 — projects.fdes/edl_profile_id dropped via a GUARDED check, not name-matching (2026-10-08)
Supersedes the original 7.1-era plan to migrate these by fuzzy-matching `fdes`
text names to `profiles.full_name`. Migrations run before seed files in
`db reset`, and neither local nor cloud had any pre-existing `projects` row
predating this migration (cloud's `projects` table was empty — verified
read-only via `supabase db dump --data-only` before pushing: the "Data for
Name: projects" section had no `INSERT` following it), so there was never
real data to match against. Instead: a one-time guarded check
(`count(*) where fdes is not null or edl_profile_id is not null`) that
`RAISE EXCEPTION`s if it finds ANY non-null data, otherwise proceeds straight
to creating `project_members` and dropping both columns. Fails loudly instead
of silently discarding or guessing. `project_members` is now the sole source
of truth for who's on a project; `supabase/demo/phase7_demo_data.sql` and
`seed.sql` updated accordingly (the cloud demo script now writes a
`project_members` row using the dynamically-resolved admin id, same pattern as
before, never referencing the new fictional local-only people).

## D-072 — generic audit trigger covers id-less tables; saved_views is excluded (2026-10-08)
`team_members`' natural key is `(team_id, profile_id)`, but it was given a
surrogate `id uuid` anyway (+ a `unique(team_id, profile_id)` constraint) so
the 7.1 generic audit trigger's `to_jsonb(...)->>'id'` extraction populates a
real `record_id` like every other audited table, rather than degrading to
`sync_state`'s null-record_id case. Verified directly (rls_test.sql): a
`team_members` insert produces an `audit_log` row with a non-null `record_id`.
`saved_views` is the one new 7.2a table deliberately NOT given the trigger —
it's personal UI preference (which filters/sort/columns someone likes), not a
CS record, and auditing it would only add noise with no value.

## D-073 — scope semantics: Mine / My team / Everyone / person / team_id (2026-10-08)
Codifies product-overview.md § 12. **Mine** = the viewer's own
`account_assignments`/`project_members` rows. **My team** = the union of every
team the viewer leads or belongs to, each such team's FULL membership (members
+ lead), plus the viewer's own direct assignments — a person in two teams (the
fixture's Grace Mwangi) sees the union across both. **Everyone** = no filter
(null). **A specific person** / **a specific team** = an explicit other
target, via `person_account_ids(profile)`/`team_account_ids(team)` (distinct
from the viewer-implicit `my_team_account_ids()` used for "My team" itself).
Critically: **scope is focus, never access control** — every super admin can
already see every account/project via the unchanged blanket
`is_super_admin()` RLS on `organizations`/`projects`; these 8 SECURITY DEFINER
functions (`my_*`, `team_*`, `person_*`, `my_team_*`, × account/project) only
return an id list the frontend filters a list by. Verified (rls_test.sql):
Grace's `my_team_account_ids()` returns both Prism (via Enterprise Pod) and
Meridian (via SMB Pod); Dana (no team, no assignments) gets the empty set.

## D-074 — default scope resolution order (2026-10-08)
Every scoped list resolves its initial scope as: **(1)** the person's saved
default view for that page (`saved_views.is_default`) → **(2)** their title's
default (FDE → Mine, EDL/TA → My team, Head of CS → Everyone) → **(3)**
Everyone when `title` is null — so an untitled super admin (anyone invited
before 7.2a, or via the existing Super Admins page without a title set) never
opens to a confusing empty screen. Implemented in `useScope(page)`; the
explicit choice a person then makes is persisted per-page in `localStorage`
and wins over the default on their next visit to that same page.

## D-075 — Product direction: the Refold CS Hub, personal workspaces (2026-10-08)
Every CS person logs into their own book of business, not a generic list:
Head of CS → EDL/TA team leads → FDEs, with accounts and projects assigned to
linked people (not text names) via `account_assignments`/`project_members`.
Standups are per team — there is no single standup; each EDL/TA runs their
own, the Head of CS can open any and sees a cross-team roll-up. Gamification
(Phase 10) is deliberately deferred and needs NO new tracking: it's computed
later from the audit log (actor + timestamp already recorded on every change)
plus approvals turnaround and data freshness already captured by provenance.
Ref: `docs/product-overview.md` § 2 (who uses it), § 12 (personal workspaces),
§ 13 (gamification).

## D-076 — 7.2 split into 7.2a (this session) and 7.2b (next) (2026-10-08)
Supersedes the single-7.2 plan from the previous session (God-mode workspace:
Portfolio board + Account 360 + coverage view in one go). **7.2a** (this
session): titles, teams, account/project assignments, saved views, scope
helpers, and the Team Structure screen — the people-and-permissions
foundation. **7.2b** (next): Portfolio board + coverage tab + Account 360 (6
tabs) + Add account (no invite) + inline add/edit/delete + Mark verified +
source badges — every list screen built on 7.2a's scope switcher and saved
views from the start, rather than retrofitted later. The build sequence also
gained a block between 7.3 and 7.4: Home + per-team Standups + Team (FDE
performance), pulled ahead of Phase 8 since the team structure is central to
daily use (`docs/product-overview.md` § 9).

## D-077 — Project-members assignment UI deferred to 7.2b (2026-10-08)
`project_members` (the table, RLS, audit trigger, and the `my_project_ids`/
`team_project_ids`/`person_project_ids`/`my_team_project_ids` scope helpers)
ships this session, fully functional and tested — but the UI to assign people
to a specific project is cut from the Team Structure screen. Its natural home
is the Projects tab of 7.2b's Account 360 (where a project is already a
first-class card with its own context), not a standalone picker bolted onto
an otherwise account-centric screen. Local fixtures demonstrate project
membership directly via SQL (seed_team_links.sql) in the meantime.

## D-078 — audit_log regression found during 7.2a verification: service_role grant + stale column names (2026-10-08)
While testing `set_title`'s audit trail, found that D-064's revoke (last
session) had removed `insert` on `audit_log` from `service_role`, not just
`authenticated` — on the stated assumption that only the generic SECURITY
DEFINER trigger writes the table. That assumption was wrong: the provisioning
Edge Function's manual `writeAudit()` helper is still the audit path for
tables that intentionally don't get the generic trigger (profiles,
organizations, sub_roles, invitations — D-063), and it writes via the
service-role REST client, which is still subject to table grants regardless
of RLS bypass. This silently broke every manual audit write — `provision_org`,
`invite_super_admin`, `assign_sub_role`, `set_title`, `set_user_status`,
`accept_invite`, all three `owner_*` actions — in both local and (since D-064
shipped to cloud last session) production, with no surfaced error. Fixed by
migration `20261008000008_audit_log_service_role_insert.sql`
(`grant insert on audit_log to service_role`); `authenticated` stays revoked
(that boundary was correct) and update/delete stay revoked for both roles
(append-only). A second, independent bug surfaced in the same check:
`writeAudit()` was still writing the pre-7.1 `target_type`/`target_id`
columns, never updated when 7.1 introduced `record_table`/`record_id` (D-064's
backfill only touched existing rows) — so even once the grant was fixed,
every new manual audit row left `record_table`/`record_id` null, which also
silently breaks `audit_log_select`'s owner-visibility filter (matches on
`record_table`). Fixed in the same pass: `writeAudit()` now writes
`record_table`/`record_id`, mapping the singular `targetType` call-site values
('profile', 'organization') to the plural table names the generic trigger and
RLS policy expect ('profiles', 'organizations'). Verified end-to-end after
both fixes: a fresh `db reset`, full `rls_test.sql` (all 3 blocks), a 6-check
`set_title` script (AAL1/role/validation rejections, happy path, and the
previously-failing audit-row check — now passing with a real row), and
`smoke-login.ts` (all 3 roles) all green. Both fixes pushed to cloud as part
of this session's migration set, ahead of code.

## D-079 — 7.2b scope: Portfolio *is* the account list; cross-account Projects deferred; organizations gets 3 provenance-style columns (2026-10-08)
Three scope calls made while planning 7.2b (Portfolio + Account 360), stated
here since the spec left them implicit. **(1)** product-overview's nav table
lists "Portfolio" and "Accounts" as separate items, but §5.2 describes
Portfolio's board as exactly an account list grouped by segment with
health/owner/escalations/coverage — the same content a standalone "Accounts"
list would show. Built one list (Portfolio's board tab), not two; every row
links to Account 360. **(2)** product-overview §5.6's standalone cross-account
"Projects" screen is NOT in build-spec-v3's 7.2b bullet list — Account 360's
Projects tab covers per-account project work for now; the cross-account view
is deferred to whenever the roadmap reaches it explicitly. **(3)** Account
360's Overview tab needs "change health (with reason)" and "mark verified"
(product-overview §5.3), but `organizations` (extended in 7.1) never got the
provenance columns every CS record table has. Added
`health_reason text`, `verified_at timestamptz`, `updated_by uuid` via one
additive migration — no RLS change needed, the existing AAL2 `organizations_
update` policy already covers it. Coverage is defined precisely as: 7 sections
per account (projects, milestones, risks, escalations, tickets, engagements,
metrics — contacts is Phase 8); a section is **current** if its most-recently-
verified-or-created row is within 30 days, **stale** if older, **missing** if
there are no rows; **"pending approval"** (the spec's 4th state) has no
backing data until 7.3's proposals/approvals ship, so it's always absent for
now — a known gap, not a silent drop. Portfolio's coverage % = (current
sections) / 7.

## D-080 — apply_proposal()/reject_proposal(): approve applies the change via a fixed table allow-list (2026-10-09)
§3.1's "approve" means apply, not just flip a status flag — and §3.2 wants
the audit trail to show literal `action='approve'`/`'reject'`, which the
generic trigger can't produce (it only sees `proposals`' own `update`). Built
two SECURITY DEFINER functions instead of a client-side status update:
`apply_proposal(proposal_id, decided_by, payload_override)` and
`reject_proposal(proposal_id, decided_by, reason)`. `target_table` is
checked against a FIXED allow-list matching §3.1's pending kinds exactly —
`milestones`, `accomplishments`, `risks`, `escalations`, `tickets`,
`metric_values` (create/update/delete), and `organizations` (update only,
for health changes). One explicit `if/elsif` branch per table, not dynamic
`format(%I, ...)` SQL — safer (no identifier-injection surface) and each
table's columns differ anyway; a disallowed table raises rather than
silently no-op-ing (verified in rls_test.sql). `asks`/`engagements`/
`portfolio_notes`/`projects` are manual-only (7.2b) and stay unreachable
here until the roadmap says otherwise. Each function runs the apply +
proposal-status-update + explicit audit_log('approve'/'reject') insert as
one transaction, so a mid-way failure can't leave a proposal half-applied.
Fixtures: 7.1's `phase7_demo_data.sql` already seeded 2 pending proposals
(both 'create') — added 3 more, local-only (`seed_proposals.sql`), covering
'update' and 'delete' so edit-then-approve and reject are exercisable too.

## D-081 — Equal admins: no internal hierarchy, no titles, no RBAC by role (2026-10-09)
Head-of-CS direction, reversing 7.2a. Every admin uses the platform the same
way; there is no org chart on the platform. Supersedes D-069 (`set_title`),
D-070 (`owner_profile_id` derivation), D-073 (title-based scope semantics),
D-074 (title-based default scope), and D-076/D-079's references to titles/
teams as a planning construct. `profiles.title` and the `profile_title`
enum's column usage are dropped (the enum type itself is left in place —
Postgres can't cleanly drop one enum value, and nothing references it once
the column is gone); the provisioning Edge Function's `set_title` action is
removed.

## D-082 — account_roles replaces account_assignments/teams: per-account role tags, record-keeping only, with history (2026-10-09)
A person's involvement in an account is a per-account role tag
(`edl`/`ta`/`fde`, the unchanged `assignment_role` enum) for record-keeping
only — it grants no permissions and feeds future performance indexes
(Parked, below), not access control. `account_roles` (profile, org, role,
`started_at`, `ended_at`) replaces `account_assignments`; at most one ACTIVE
role (`ended_at is null`) per (profile, org) via a partial unique index;
changing role ends the current row and inserts a new one (never an in-place
swap), so history is permanent — there is no DELETE policy on the table at
all. `teams`/`team_members` are dropped outright (no conversion needed —
confirmed 0 rows on cloud via a read-only `supabase db dump` before
dropping, same guarded-drop precedent as D-071's `projects.fdes`).
`organizations.owner_profile_id` and its derivation triggers
(`compute_org_owner`, `force_org_owner_profile_id`,
`sync_org_owner_from_assignment`) are retired — confirmed NULL everywhere on
cloud — since every account's EDL is now read live from its active
`account_roles` rows rather than stored on the organizations row.
`project_members` is unchanged (project-level assignment is orthogonal to
this change). Fixtures (local-only): Prism gets two FDEs on one account
(Tomás + Grace, the overlap case) and Owen has a role on Prism that ended
(`ended_at` set, the history case).

## D-083 — reports_to: optional, UX-only, never permissions (2026-10-09)
`profiles.reports_to` (nullable self-FK) is a convenience only — it
pre-fills standup participants (when standups ship) and powers the "My
team" scope option (D-084). No self-reference (`CHECK`) and no cycle of any
depth (a `BEFORE INSERT OR UPDATE` trigger walks the chain, bounded to 50
hops, and raises if it would loop back to the row being changed) — both
verified directly and via the provisioning Edge Function's new
`set_reports_to` action (replacing `set_title` in the same D-043
column-grant-lockdown slot).

## D-084 — Scope: My accounts / My team (reports-based) / Everyone / Person; saved-view pinning dropped (2026-10-09)
Rewrites D-073/D-074 for the equal-admins model. **My accounts** = the
viewer's own active `account_roles`. **My team** = My accounts **union**
the active accounts of everyone whose `reports_to` is the viewer (direct
reports only, not transitive) — shown in the `ScopeSwitcher` only when the
viewer actually has reports, so it's invisible to most people most of the
time. **Everyone** = no filter. **A specific person** = unchanged
(`person_account_ids`). The team-targeting `team_id` scope and its helpers
(`team_account_ids`, `team_project_ids`, `my_team_project_ids`) are dropped
— there are no teams to target; `saved_views.scope`'s now-unused `'team_id'`
enum value is left in place at the DB level rather than forcing an
enum-value removal for zero rows. Default resolution: saved default view →
"My accounts" if the viewer holds any active role → else "Everyone".
Saved-view sidebar pinning (`pinned`) is dropped from the UI — "save" + "set
as default" only — kept simple; the unused `pinned` column stays in the
schema rather than another drop-a-column migration for a cosmetic feature.

## D-085 — Standups: anyone hosts, participants pre-filled from reports_to + remembered, not per-team (2026-10-09)
Describes the target design for whenever Standups ships (not built this
session — see Parked). There is no fixed team roster to run a standup
against. Any admin can start one; participants default to their direct
reports (if any) and otherwise to whoever they picked last time, so daily
use is one click; several standups a day run by different hosts is normal.
Supersedes build-spec-v3's earlier "per-team Standups" framing (D-079's
roadmap mention, product-overview.md §5.7's prior "one per team" design).

## D-086 — Navigation: Home/Portfolio/Approvals/People primary, Admin collapsed; People renamed from Team Structure (2026-10-09)
`/team-structure` → `/people`: a directory of every admin (optional
`reports_to`, active account roles, editable inline) replacing the former
People/Teams/Accounts sections — no titles, no teams tab. Sidebar primary
items: Home, Portfolio, Approvals (existing pending-count badge), People,
Settings; a collapsed-by-default "Admin" disclosure holds Audit Log, Users
& Roles (renamed label only), Feature Flags, and the existing Deployments
screens (Overview, Cloud/On-Prem Customers) — no visibility tiers, every
admin can open it. Standups has no nav item yet (not built this session).

## D-087 — Standups schema: standups/standup_entries/action_items, host-can-edit-any RLS, action items never auto-close (2026-10-09)
Builds Part 3 as designed in D-085/product-overview.md §5.7 — no redesign.
Three tables, same RLS/grant/audit shape as `account_roles` (select:
`is_super_admin()`; writes: `+ is_aal2()`; generic trigger attached — these
are operational records, not personal UI prefs). `standups` (host, date, no
`org_id` — a standup spans whichever accounts its participants hold roles
on, same `org_id = null` treatment as `portfolio_notes`/`sync_runs`).
`standup_entries` (one per participant per standup, `unique(standup_id,
profile_id)`) gets the one RLS policy in the whole schema that checks more
than `is_super_admin()`/`is_aal2()`: a participant may write their own
entry; the standup's host may write any entry in it; every other super
admin can still **read** it (focus, not access control) but not write it.
`action_items` (`standup_entry_id` nullable, `on delete set null` — an item
outlives the entry it came from) are shared team artifacts like asks/
escalations — any super admin at AAL2 can create/reassign/close one, not
just its owner. "Carry over until done" means exactly that: no status
auto-transition, ever; a `done` item simply stops being "open," nothing
deletes or archives it.

## D-088 — Remembered standup participants: reuses saved_views (page='standup_participants'), default resolution (2026-10-09)
No new table for "the host's last-used set" — `saved_views` already
anticipated this in its own column comment. One row per host
(`owner_profile_id = host`, `page = 'standup_participants'`,
`filters: {participantIds: [...]}`), upserted every time a standup starts.
**Default when starting a new standup:** the remembered set if one exists
→ else the host's direct reports (`reports_to`) → else empty — the
remembered set wins once it exists and evolves with usage (every
`createStandup()` call overwrites it with whoever was actually included).
This resolves the one judgment call the design left open (the prompt
described the *behavior* — "one click" — not which source wins on the very
first use).

## D-089 — Headless e2e smoke testing (Playwright) joins the shipping protocol; seeded-TOTP local auth test path (2026-10-09)
Nothing existed before this session — no test runner, no Playwright, no
browser automation at all. `@playwright/test` + headless Chromium added as
a devDependency; `tests/e2e/smoke.spec.ts` drives the real login form and
the real MFA **challenge** screen (not enrollment) by seeding a
**pre-verified** TOTP factor for the fictional super admin with a fixed,
known secret directly into `auth.mfa_factors` (local-only `seed.sql` fixture
— confirmed by direct inspection that `secret` is a plain-text column
locally, no encryption-at-rest to work around). Nothing about the app's
auth logic is weakened or bypassed; only the test's knowledge of a seeded
secret is new, same category as every other fictional seed row. `npm run
e2e` joins the end-of-session protocol (CLAUDE.md): run it whenever a
session changes UI, before pushing. **Side effect worth recording:** every
other throwaway verification script this project has used to reach AAL2
(enroll a fresh TOTP factor, verify it) now fails for `super@refold.internal`
specifically after a fresh `db reset`, because a verified factor already
exists — GoTrue requires AAL2 to enroll an *additional* factor once one is
verified. Future ad hoc scripts for this user must challenge the seeded
factor (list verified factors → challenge → verify with the known secret)
rather than enroll a new one; this is now the pattern this session's own
test file and ship-verification scripts use.

## D-090 — PostgREST can't embed a self-referential FK even via the hint it itself suggests (found by the new e2e test, fixed) (2026-10-09)
A real regression from last session, silently broken since it shipped: the
People directory's `fetchPeopleDirectory()` (`usePeople.ts`) tried to embed
`profiles!profiles_reports_to_fkey(full_name)` on a query against
`profiles` itself, to show each person's `reports_to` name inline. Direct
inspection: the unqualified embed correctly 300s as ambiguous (`profiles`
has two self-FKs — `created_by` and `reports_to`) and PostgREST's own error
*suggests* `profiles!profiles_reports_to_fkey` as the fix — but using that
exact hint still 400s ("Could not find a relationship between 'profiles'
and 'profiles' in the schema cache"). This is a genuine PostgREST
self-join limitation, not a query-writing mistake — confirmed by testing
the exact suggested hint directly against the API. **No UI testing tool
existed last session to catch this** (the gap D-089's e2e suite now
closes) — it had been 400ing in the browser console since 7.2a/equal-admins
Parts 1–2 shipped, invisible because nothing rendered an error boundary
for it (`reportsToName` just silently stayed `null`... except the whole
query failed, so the entire People directory page was actually broken).
Fixed by resolving `reports_to`'s name client-side instead: fetch the
plain row (no embed) and look up each `reports_to` id against the same
already-fetched result set (every super admin is in it). Extends the
D-068 "Supabase / PostgREST queries" coding rule: self-referential FK
embeds need this workaround, not a `!fkey` hint, even when PostgREST's own
error message suggests one.

## D-091 — Ingest API auth: cshub_-prefixed hashed bearer tokens, minted only via provisioning, verify_jwt disabled on `ingest` (2026-10-09)
A Supabase Edge Function's gateway rejects any `Authorization` header that
isn't a Supabase-issued JWT before the function's own code ever runs —
`provisioning` never hit this because its callers already send real user
JWTs. `ingest`'s callers (the future CS Sync Skill) send a long-lived
custom credential instead, so `[functions.ingest] verify_jwt = false` was
added to `supabase/config.toml`, making the function's own token lookup the
only gate — verified by confirming a request with no/garbage
`Authorization` header gets `401` from the function's own code (not a
platform-level rejection) both locally and via direct `curl`. Tokens are
`cshub_` + 32 random bytes (base64url) so a leaked one is recognizable by
prefix; only the SHA-256 hex digest is ever stored; the plaintext exists
only in the one `create_ingest_token` response and is never logged or
passed to `writeAudit()`'s metadata (only `id`/`label` are). `expires_at`
is required at creation and capped server-side at 365 days — a longer
request is rejected, not clamped. The `ingest_tokens` table grants
`authenticated` **select only** — no insert/update policy exists at all;
the only way to create or revoke one is through two new super_admin +
AAL2-gated `provisioning` actions (`create_ingest_token`/
`revoke_ingest_token`), mirroring every other credential-shaped write in
this codebase. A minimal admin screen (`/ingest-tokens`, under the
collapsed "Admin" nav group) was added in the same session since 7.5 (not
yet built) would otherwise have no way to obtain a token at all.

## D-092 — Ingest API upsert/dedupe decision tree + `proposals_pending_dedupe` race index (2026-10-09)
The sync skill is designed to stay dumb — it reports what it currently
sees in the source system via a caller-chosen `source_ref`; the server
decides create vs. update vs. skip from actual platform state, not the
caller's claimed `operation`. Resolution order per record: (1) a pending
proposal for the same `(account, target_table, source_ref)` → merge into
it (`updated_pending`); (2) else the most recently decided `rejected`
proposal for that key with an **identical** payload → skip
(`previously_rejected`), a changed payload falls through as a fresh
attempt; (3) else a real row for that key — identical values →
`duplicate_skipped`, different → a new `update` proposal
(`proposed_update`, the path a ticket's status change takes on every sync
run); (4) else a new `create` proposal (`proposed`). A partial unique
index, `proposals_pending_dedupe on proposals (org_id, target_table,
source_ref) where status = 'pending'`, is the authoritative concurrency
backstop for step 1 — two overlapping runs (a manual Refresh racing the
daily job) can't both insert a new pending proposal for the same key; a
`23505` on insert is caught and converted into a merge into whichever
proposal won the race, so the caller never sees the collision. Verified
via two genuinely concurrent POSTs with the same `source_ref` resulting in
exactly one pending proposal.

## D-093 — Ingest API: `run.source` accepted (agent/chat/file) for reuse by 7.6/7.8 without changing this endpoint later (2026-10-09)
Hardcoding `source = 'agent'` would have required touching the `ingest`
function again for 7.6 (chat agent) and 7.8 (file import), both of which
will post through this same endpoint. `run.source` now accepts
`agent`/`chat`/`file` (default `agent`), validated at the run level
(invalid → `400`), and is stamped onto every proposal created in that run
as `proposals.source` — no schema or endpoint change anticipated for
either future phase.

## D-094 — Ingest API equality normalization for dedupe comparisons (2026-10-09)
Literal comparison between an incoming record's `data` and either an
existing row or a prior rejected payload would file a false
`proposed_update`/skip-miss on every daily sync purely from formatting
differences (e.g. `"2026-10-09"` vs. `"2026-10-09T00:00:00Z"`). One
`valuesEqual`/`normalizeValue` helper is used everywhere this comparison
happens: dates/timestamps reduced to one date-only form, numbers coerced
via `Number()`, strings trimmed, `health`/`status`/`severity`/`priority`
lowercased — and only the keys present in the *incoming* record are
compared, so a field the caller didn't send is never treated as "changed."
Verified: resending an identical ticket with an equivalently-but-
differently-formatted date returns `duplicate_skipped`, not a false
`proposed_update`.

## D-095 — Ingest API: explicit delete against a still-pending create → `superseded_pending`, using the existing `superseded` enum value (2026-10-09)
If a caller's explicit `delete` targets a `source_ref` that only matches a
**pending** `create` proposal (never approved, so no real row ever
existed), treating it as `rejected_invalid` would be misleading — there's
nothing wrong with the request, the create's intent is simply being
withdrawn before it was ever acted on. That pending proposal is marked
`status = 'superseded'` (the `proposal_status` enum already had this value
— confirmed via `enum_range`, no schema change needed) and the record
reports `superseded_pending`; no new proposal is filed, since nothing real
needs deleting.

## D-096 — Ingest API: no CORS on `ingest`; function logs never contain request bodies, record data, or evidence excerpts (2026-10-09)
`ingest` is server-to-server only (the CS Sync Skill, later the chat agent/
file import) — unlike `provisioning`, it sets no `Access-Control-Allow-*`
headers and handles no `OPTIONS` preflight, so a browser page cannot read
its response cross-origin even if it obtained a token. (Noted during
verification: the **local** Supabase CLI's Kong gateway injects
`Access-Control-Allow-Origin: *` on every response regardless of function
code, confirmed present even on a bare 401 before the function's handler
runs at all — a platform/dev-proxy behavior, not something `ingest`'s own
code controls either way; since auth here is a bearer token rather than an
ambient browser credential like a cookie, this doesn't reopen the
cross-origin risk the no-CORS design is guarding against.) Separately,
every `console.log`/`console.error` in the function logs only ids
(`run.id`, `ingest_token_id`), outcome counts, and error codes — never a
request body, a record's `data`, or `evidence_excerpt` — stated as a
guarantee in `docs/ingest-api.md`, not just current behavior.

## D-097 — Refold MCP connection confirmed; agent-mode contract finalized for cs-sync (2026-10-10)
Connected end-to-end against the live `CS Hub` MCP server (`mode: agent`,
`environment: test`) for 7.5-pre discovery: session-token auth
(`POST /api/v2/public/session-token`, ~7-day expiry, re-call to refresh),
then JSON-RPC over streamable HTTP (`initialize` → `tools/list` →
`tools/call`) at `https://app.refold.ai/mcp/v1/<server id>`. In agent mode
the server exposes exactly two tools — `RESOLVE_ACTIONS` (turns plain-
English queries into `{slug, type, identifier, json_schema}`) and
`EXECUTE_ACTION` (runs one). **Every `tools/call` additionally requires a
`linked_account_id` header** that `initialize`/`tools/list` do not —
omitting it produces `"Missing auth context"` with no other clue; this is
now documented in `docs/refold-mcp.md` and `skills/cs-sync/reference/
tool-map.md` so it isn't rediscovered the hard way again. A deterministic,
non-LLM REST path also exists for any already-known action
(`POST /api/v2/integration-schema/{slug}/actions/{action_id}/execute`,
same auth) — its outer HTTP status is always 200 even on failure; the body's
`node_status`/`http_status` is the real result, confirmed live against
several deliberately-broken calls. `expose_skills` (the dashboard's
**Retrieve Skill** switch) is off for this server, so there is no
`GET_KNOWLEDGE_INDEX`/`LOAD_SKILL` tool to wait for — `cs-sync` calls
`RESOLVE_ACTIONS` directly. No skill CRUD exists in the public API (read
the full OpenAPI spec to confirm — `skills_count` is reported but not
writable); a finished skill can only be installed by pasting it into
Refold → MCP → CS Hub → Skills → Add Skill by hand, which is why this
session generates `skills/cs-sync/refold-skill.md` as a mergeable document
rather than attempting an API upload.

## D-098 — Real connection/app-admin gaps block 7.5 today, independent of any code (2026-10-10)
Discovery surfaced four genuine blockers, confirmed live against the real
`cs-hub` linked account, none of them MCP-protocol or skill-design issues:
(1) Zendesk and Gmail are attached to the CS Hub MCP server but **not
connected** at the application level (`connected: false` via the
Applications API) — every call fails `"Application Authentication not
found for linked_account_id cs-hub and app <slug>"`; (2) the connected
Slack identity is not a member of any channel in the workspace, so
`get_conversation_history`/`list_thread_messages` return `not_in_channel`
for every channel tried, customer channels included; (3) `search_messages`
cannot work **at all** as configured — Slack's `search.messages` requires
a user-scope token, and this connection is bot-token-based
(`not_allowed_token_type`), so this is not a permissions fix, it's a
different-auth-type problem; (4) the org has **zero** Refold workflows
published (`GET /api/v2/public/workflow` → `totalDocs: 0`), so the planned
`metric` record type has no source at all yet, deterministic or otherwise.
Separately (not blocking, just a design input): neither Zendesk nor
Fireflies exposes a list/search action in its current catalog — only
get-by-id — so even once connected, "what changed since `since`" has no
direct answer for tickets or meeting transcripts without another signal
supplying the id first. All four are fixed by app-admin/Refold-dashboard
work, not by this repo's code; `skills/cs-sync/reference/tool-map.md`
documents each one so `cs-sync` skips the affected record type and reports
why instead of guessing, and so 7.5's rollout plan accounts for them before
relying on this skill for a real sync.

## D-099 — cs-sync skill finalized against the real server; `refold-skill.md` generated for manual install (2026-10-10)
Replaced every placeholder in `skills/cs-sync/` with what was actually
confirmed live: real `action_id`s and input schemas (`tool-map.md`),
`"Zendesk"` as the one ticketing system, the CS Hub's own schema enums
read directly from Postgres (`milestone_status`/`risk_status`/
`escalation_status`/`severity`/`ticket_status`/`ticket_priority`/`health`)
and its 15 current `metric_definitions` keys (`record-types.md`), and the
`health:<account id>` dedupe behavior — tested directly against local
ingest with the Prism Analytics fixture: same value → `duplicate_skipped`;
changed value → `proposed_update`; resent while still pending →
`updated_pending`, exactly as `docs/ingest-api.md` already specified, no
change needed there. The planned "hand-run the skill for one real account ×
tickets" step could not use real Zendesk data (D-098's connection gap), so
one fictional-but-schema-valid ticket record was hand-built instead,
validated against `payload.schema.json`, and posted to a local-only ingest
token — proving the skill-output → validation → ingest pipe, not Zendesk
connectivity (reported as a deviation, not silently substituted). All DRAFT
markers removed from `SKILL.md`/`tool-map.md`. New
`skills/cs-sync/refold-skill.md` is the single merged document (Goal /
Pre-checks / Steps / On success / On failure, real action ids throughout)
meant to be pasted into Refold → MCP → CS Hub → Skills → Add Skill by a
human — not uploaded automatically, since no skill CRUD API exists (D-097).

## D-100 — Tenants are a new table; `account_sources` supersedes `aliases` for matching, kept distinct from `sync_learnings` (2026-10-11)
7.5-pre2 Session 1. A tenant (an end-customer/program/sub-account under one
account — e.g. a platform customer's own bank programs) is never an
account, and the sync agent can never create or promote one. Checked both
candidate reuses before adding a table: `projects` (delivery/
implementation concept — release_no, go_live_date, FDEs) is orthogonal,
not a substitute; the on-prem `NamespaceOrg` (R2) is a mock-data-era
deployment-hierarchy concept for the frozen on-prem portal, never a real
Postgres table, and unrelated. New `tenants` (org_id, name, notes) is the
simplest correct model. Structured sources — Slack channel id, email
domain, Zendesk org id, Fireflies hint, name variant, per account *and*
per tenant, editable in Account 360 — live in a new `account_sources`
table (`unique(source_type, value)`, so one identifier names exactly one
account/tenant), which **supersedes `organizations.aliases` for matching**:
the ingest function's `resolveAccount`/new `resolveTenant` now query
`account_sources` exclusively; `aliases` is backfilled into it (migration-
time for existing data, a demo-fixture insert locally since local aliases
are set by the seed script which runs *after* migrations) and kept on the
organizations row, unused by new code, not dropped. Kept deliberately
distinct from `sync_learnings` (the learning-loop table, not yet built):
`account_sources` is the authoritative exact-match lookup; resolving an
`account_resolution` proposal (Session 2) will write here *and* log a
`sync_learnings` `alias_map` row purely for the admin-visible audit trail
— `sync_learnings` itself is never queried for matching.

## D-101 — Lifecycle tags: `dormant` is a new enum value; "unverified" reuses `verified_at is null`, no new value (2026-10-11)
The real CS workflow's five roster tags (active/prospect/dormant/churned/
unverified) map onto the existing `lifecycle_stage` enum
(`prospect/poc/onboarding/live/expansion/renewal/churned`,confirmed via
`20261007000001_phase7_enums.sql`) rather than replacing it: `prospect`/
`churned` are unchanged; `active` (the daily report's catch-all) resolves
to whichever of `onboarding`/`live`/`expansion`/`renewal` actually fits —
the CS Hub's enum is already more granular, this is a refinement, not a
new value. `dormant` is added additively (`alter type lifecycle_stage add
value 'dormant'`) since it's genuinely a new stage (went quiet after being
active) with no existing match. `unverified` gets **no new enum value** —
`organizations.verified_at is null` already means exactly that (7.2b's
"mark verified" button); a second mechanism would be redundant. A real
edge case found in the source data (an account tagged "at-risk/win-back")
needed no schema change either — it already fits `health = 'risk'` +
`health_reason`.

## D-102 — `tenant_id` added to 9 record tables, not the 7 originally scoped; `apply_proposal()` extended (2026-10-11)
Added nullable `tenant_id` (references `tenants(id)`) to milestones,
accomplishments, risks, escalations, tickets, metric_values, and projects
as planned, **plus `engagements` and `asks`** — not in the original
session scope, added because they're structurally identical CS-record
tables and the alternative (redoing this in a later session) was pure
rework for a free, additive, nullable column. `apply_proposal()`'s six
reachable branches (milestones/accomplishments/risks/escalations/tickets/
metric_values) now read/write `tenant_id` from the proposal payload the
same way they already handle `project_id`; `engagements`/`asks`/`projects`
stay manual-only (unreachable via `apply_proposal()`), their `tenant_id`
settable directly from the same Account 360 UI that writes everything
else about them. `ingest`'s `processRecord` merges a resolved `tenant_id`
into `data` before the dedupe/equality comparison, exactly mirroring the
existing `project_id` pattern — an omitted `tenant` on a resend is never
treated as "the tenant was removed" (same caller-sent-fields-only rule
every other field already follows).

## D-103 — `engagements` already existed from 7.1; the 7.5-pre2 plan's "new table" assumption was wrong (2026-10-11)
Correction, not a new design: the approved 7.5-pre2 plan described
`engagement` (meeting/touchpoint) as "a genuinely new table" for a later
session. Reading `20261007000006_account_records.sql` while doing Session
1 found it already exists (org, type, engagement_date, attendees, summary,
follow_ups) with the exact provenance pattern every other record table
has, plus an already-defined `engagement_type` enum
(`call/check_in/qbr/ebr/note`) that's never been used anywhere — `asks`
also predates this session. Both now also carry `tenant_id` (D-102). No
plan change needed beyond noting it: the later session that wires
`engagement` into the ingest allow-list extends an existing table instead
of creating one.

## D-104 — "Account match needed": `held` proposal status + resolution/held dedupe indexes (2026-10-11)
7.5-pre2 Session 2. An unresolvable account or tenant identifier never gets
guessed or silently rejected — the dependent record becomes a normal
`proposals` row with a new status, `held`, plus a nullable
`blocked_by_resolution_id` pointing at an `account_resolution` proposal
(`target_table = 'account_resolution'`, a meta-kind, never a real CS
table) that names the unresolved identifier. Reusing `proposals` itself —
not a parallel table — means every existing index/RLS/audit path on it
already covers held rows with no carve-out. Two race-safety backstops,
same philosophy as 7.4's `proposals_pending_dedupe`: `proposals_resolution_
dedupe` (one pending resolution per identifier, so 50 sightings of the same
unknown name file ONE resolution, not 50) and `proposals_held_dedupe`
(one held row per fact per resolution, `coalesce`-normalizing the null
`org_id` of an account-scope hold into one consistent bucket). Shipped as
two migrations, not one: Postgres forbids using a brand-new enum value
(`held`) inside the same transaction that added it — the partial index's
`where status = 'held'` needs the catalog change already committed.

## D-105 — Dedupe/upsert tree + record-type schema extracted to `_shared/dedupe.ts`, broader than originally scoped (2026-10-11)
Approved as a refactor of shipped 7.4 code (not purely additive). Releasing
a held record at resolution time needs the *exact* decision tree `ingest`
already uses for a fresh sighting (pending-merge / previously-rejected-skip
/ real-row-compare / create) — reimplementing it in `provisioning` would
mean two copies silently drifting apart. The approved plan scoped the
extraction to just that decision tree; building it surfaced that the
*validation* a held record needs re-run at release (required-field checks,
`KNOWN_FIELDS` filtering, metric/health rules, project/tenant lookups) also
has to be identical on both sides, so `TARGET_TABLE`/`KNOWN_FIELDS`/
`REQUIRED_FIELDS`/`NEEDS_PROJECT`/`resolveProject`/`resolveTenant` moved to
the shared module too — flagged here as a deviation in scope (not kind) of
the already-approved refactor, not a new one.

## D-106 — `sync_learnings` pulled forward from Session 3, minimally (2026-10-11)
The "ignore list" §B.7(d) requires — an identifier that never re-proposes
itself once a human says "not a customer" — needs a durable, checked-on-
every-sighting mechanism *now*, in Session 2, not Session 3. Rather than
build a throwaway stand-in table, `sync_learnings` (kind, org_id?,
tenant_id?, content jsonb, source_decision_ids, created_by, status,
last_used_at, hits) ships now with only the two *deterministic* write
paths Session 2 needs — `alias_map` (logged on every successful
resolution, for the admin-visible audit trail — matching happens via
`account_sources`, not by querying this table) and `ignore` (checked by
`ingest` before ever filing a new resolution for the same identifier).
The agent-written `rule`/`example` kinds, the admin "Sync learnings"
screen, and the active-rule-count/conflict guardrails are untouched —
still Session 3 scope.

## D-107 — Resolution release is a new `provisioning` action, not an `apply_proposal()` extension (2026-10-11)
The original instruction said "extend apply_proposal/ingest accordingly";
built it as a dedicated `resolve_account_proposal` provisioning action
instead, for the same reason 7.3's `apply_proposal()` already declines
`asks`/`engagements`/`portfolio_notes`/`projects` — a single proposal's
approve/reject is a different operation shape than "resolve one identifier,
release N held records through it." `account_resolution` proposals are
explicitly excluded from `apply_proposal()`'s allow-list (unchanged) and
from the normal Approvals list's query entirely — found live during this
session's `npm run e2e`: an `account_resolution` row (`status = 'pending'`)
rendered a generic "Approve" button in the default inbox that then failed
against `apply_proposal()`'s allow-list with a confusing error. Fixed by
excluding `target_table = 'account_resolution'` from `fetchProposals()`
unconditionally — it only ever surfaces through the pinned "Account match
needed" section's own Resolve action. At release, a held record missing a
required field, or (for milestone/accomplishment) one whose project still
doesn't resolve even with the account now known, is marked `rejected` with
a clear reason rather than being filed as a normal pending proposal that
would later violate a NOT NULL constraint on approval.

## D-108 — 7.5-pre2 session order changed: 4 → 5 → first real sync → 3 (2026-10-11)
The approved 6-session plan (devlog Session 35) ran Session 3 (the
learning loop) third. Reordered to run Session 4 (align the skill + new
record types) and Session 5 (the runner + unauthorized-connector skip)
first, then the first real sync, then Session 3 last. Reason: the learning
loop's whole point is to learn from real approval/rejection decisions —
`rule`/`example` entries written from "rejections with reasons,
edit-then-approve diffs, resolution choices" (the original §C.8 spec). None
of that exists yet; building Session 3 before any real proposals flow
through the Hub would ship an admin screen and a write path with nothing
to show and nothing to learn from. Sessions 1–2's schema
(`sync_learnings`'s table + `alias_map`/`ignore` write paths) is already
live and unaffected — this reorder only moves the *rest* of Session 3
(agent-written `rule`/`example`, the admin screen, guardrails) later.

## D-109 — `action_item`/`engagement` record types wired end to end (2026-10-11)
7.5-pre2 Session 4. `action_items` (reused from standups) gains the
plumbing a synced CS fact needs that a standup-internal task never did:
`project_id`/`tenant_id`, a `priority` enum (`p0`/`high`/`medium`/`low`,
new `action_item_priority` type), an `owner_text` free-text fallback,
two new `action_item_status` values (`in_progress`/`blocked`, additive —
`open`/`done` unchanged since `PeoplePage.tsx`/`useStandups.ts` already
depend on those literal strings), the standard provenance set every other
record table has, its `(org_id, source_ref)` dedupe index, and the
`action_items_delete` policy every other record table has. `engagements`
(already fully built in 7.1) needed no schema change — only an
`apply_proposal()` branch and `_shared/dedupe.ts` wiring. Both go through
`ingest`'s existing hold/dedupe/resolution pipeline unchanged. New
`resolveOwner()` helper in `_shared/dedupe.ts` resolves `action_item.data.
owner` against `profiles.full_name` — exact case-insensitive match only
(`.limit(2)` + length check, never `.maybeSingle()`, so two same-named
people fall back to free text instead of an arbitrary pick or a throw).
One field-naming correction from the literal task wording: the ingest
API's public field names are `description`/`due_date` (matching the
`action_items` table's real columns 1:1, like every other record type),
not `task`/`due` — the latter would have made `_shared/dedupe.ts`'s
caller-sent-field comparison silently unable to ever reach
`duplicate_skipped` for this type, since `current[key]` always reads
`undefined` for a key that isn't a real column.

## D-110 — Two real dedupe bugs found and fixed while testing the new types (2026-10-11)
A throwaway verification script's "resend with equivalent date/whitespace
→ `duplicate_skipped`" check for `engagement` failed, returning
`proposed_update` instead. Two independent causes, both in
`_shared/dedupe.ts`: (1) `normalizeValue`'s fallback branch returned
arrays by reference, so `attendees` (freshly parsed JSON on every call)
was never `===` across two calls with identical contents — fixed by
giving arrays their own branch (order-independent, stringified, trimmed).
(2) `engagement_date` was missing from `DATE_FIELDS` entirely, so it was
compared as a raw string (`'2026-10-05'` vs. `'2026-10-05T00:00:00Z'`,
always "different") — fixed by adding it. Both are generic fixes, not
engagement-specific — they'd have silently affected any future record
type with an array or date field whose name wasn't already on one of
these two lists.

## D-111 — `provisioning`'s held-record release path never validated metric/health — fixed while here (2026-10-11)
Found while extending `resolveAccountProposal`'s release loop to validate
newly-held `action_item`/`engagement` records the same way `ingest`
validates a fresh sighting: the release loop never replicated `ingest`'s
metric_key-existence or health-value checks for held `metric`/`health`
records either — only the generic required-field check existed, a gap
since Session 2. A held metric/health record could have been released
with a value that would later fail unpredictably at `apply_proposal()`'s
enum/FK cast instead of being rejected cleanly at release time. Fixed as
one in-scope adjacent fix, grouped under the same `rejectReason` variable
as the new action_item/engagement checks so all four record types share
one rejection path.

## D-112 — Slack connector: user-token + custom-app support confirmed, `search:read` scope gap found (2026-10-11)
Live, read-only discovery against Refold's public Auth Structure / Auth
Profile / OAuth-URL-generation APIs (no writes). Confirmed: Slack's
connector schema has a `workspace_token` field alongside `bot_token`
(user-token support is real, not just schema-possible); the live
authorize URL Refold's current default app generates carries a populated
`user_scope` parameter, confirming it's already wired end to end; the
fixed OAuth redirect URI is `https://api.gocobalt.io/api/v1/slack/
callback` regardless of which Slack app initiates the flow ("Cobalt" is
Refold's prior product name); a custom app (bring-your-own client id/
secret) is supported via the Auth Profiles API, not exercised live since
it would create a real org-level credential. Important gap found: the
current default app's scope lists (`scope` and `user_scope` both) do not
include `search:read` — re-authorizing Slack as a user under the default
app fixes channel reads but will *not* fix `search_messages`, which needs
a custom Auth Profile with that scope explicitly requested. Reported to
the Head of CS as part of their own Slack-app setup.

## D-113 — Early real-data check: Fireflies-only, local-only, one real finding folded into the skill (2026-10-11)
7.5-pre2 Session 4's closing verification step. Acting as the agent per
the revised skill, synced Fireflies transcripts from the last 7 days
(`httprequest` → GraphQL, read-only) against a freshly minted
**local-only** ingest token — never production. Listed 50 transcripts,
sampled 5 for summaries (2 had no summary — too short/non-substantive to
summarize), found 3 with real content: 1 external customer/prospect call
(domain not named here per the confidentiality rule) producing 1
`engagement` + 3 `action_item` records, and 2 clearly internal meetings
(hiring, team sync) with no identifiable customer domain at all. All 4
non-skipped records correctly came back `held_pending_resolution`, merged
under one shared `account_resolution` (same best-guess identifier) —
validating the resolution mechanism against genuinely novel real data,
not just synthetic fixtures. One generalizable finding folded into
`skills/cs-sync/SKILL.md`: most meetings in any given window are
internal, and a transcript with no identifiable external business domain
at all should be `skip`ped outright ("no identifiable customer account"),
not routed through `account_resolution` — that path is for "this is
clearly a customer/prospect, just not one we've mapped yet," not "this
might not be a customer meeting at all." Local DB reset immediately after
to remove all real content; nothing real was committed to git/docs/devlog
per the standing confidentiality rule.

## D-114 — D-113's domain-only Fireflies skip rule revised: too blunt (2026-10-11)
Session owner's correction before Session 5 started: "skip if no
account-mapped participant domain" throws away exactly the meetings where
customer decisions most often surface — an internal deal-review or
account-strategy call that names a customer but has no customer attendee
at all. Revised `skills/cs-sync/SKILL.md` (and `refold-skill.md`) to
attribute a transcript via **either** signal: a participant email domain
matching an `account_sources` entry, **or** a known account/tenant name
or alias mentioned anywhere in the title, summary, or action items. Skip
outright only when neither signal finds anything; an unclear mention
(a short name, an unmapped program) still files `account_resolution` as
usual — unchanged from D-113's intent, just no longer gated on
attendee domains alone.

## D-115 — Sync runner architecture: reuses 7.1's unused sync_runs/sync_state, new sync_settings/sync_queue (2026-10-11)
7.5-pre2 Session 5. `sync_runs`/`sync_state` (7.1, D-055–065) existed but
were never actually driven by any code — `ingest` only creates/updates a
`sync_runs` row when it receives a run; nothing had ever written
`sync_state` (the per-unit watermark/lock). This session is the first real
consumer of both; `sync_state`'s `(org_id, record_type)` PK + `locked_until`
already matched the lock/watermark requirement exactly, no schema change
needed there. Two new tables: `sync_settings` (singleton row — kill switch,
daily run time stored as a plain `time`, not a cron expression, so the
admin screen can change it with one UPDATE and never touch a migration or
re-register `cron.schedule`; the three caps) and `sync_queue` (the daily/
backfill fan-out mechanism — a scoped Refresh never touches it, running
synchronously instead since one unit fits comfortably in one Edge Function
invocation). Six new SECURITY DEFINER functions (`try_lock_sync_unit`,
`finish_sync_unit`, `claim_sync_queue_item`, `enqueue_daily_sync`,
`enqueue_backfill`, `dispatch_sync_queue`) plus `get_enum_values` (lets the
sync-context builder read `allowed_values` live from Postgres enums instead
of a hand-copied list that could drift). `pg_cron`/`pg_net` enabled; one job
ticks every 5 minutes rather than at the configured time directly, for the
same "admin-editable without a migration" reason. The daily/backfill
dispatch authenticates to the Edge Function via a Postgres Vault secret
holding the service-role key (set once by hand against cloud, never in a
migration) — confirmed as the user's explicitly preferred approach over
keeping the key out of Postgres entirely.

## D-116 — Runner's EXECUTE_ACTION goes through the deterministic REST path; RESOLVE_ACTIONS keeps the session-token/MCP path as specified (2026-10-11)
Two ways existed to call Refold for an already-resolved action: real MCP
(session token + JSON-RPC) or the deterministic REST execute endpoint
(`x-api-key` + `linked_account_id`, no session token — confirmed working
live in the Session 4 real-data check). Session owner's explicit choice:
build the session-token cache/refresh exactly as instructed, used for
`RESOLVE_ACTIONS` (the one agent-mode-only tool with no deterministic
equivalent) — `EXECUTE_ACTION` itself goes through the simpler
deterministic REST path once a call is resolved and validated
(`allowlist.ts`), matching `docs/refold-mcp.md`'s own note that this is the
same underlying mechanism. This also made it straightforward for the
runner to inspect and reject a non-read-only call BEFORE it reaches
Refold — the whole reason the runner proxies tool calls itself rather
than handing the model Anthropic's built-in MCP connector.

## D-117 — Output validation reuses `_shared/dedupe.ts`'s REQUIRED_FIELDS instead of a JSON-Schema library (2026-10-11)
Rather than add a new Deno/npm dependency (`ajv` or similar) to literally
execute `skills/cs-sync/reference/payload.schema.json` at runtime, the
runner's pre-ingest validator (`validate.ts`) reuses `_shared/dedupe.ts`'s
existing per-record-type `REQUIRED_FIELDS` map — the same source `ingest`
itself already validates `data` against — for the required-field checks,
plus a small set of hand-coded structural checks for what that map doesn't
cover (array size, confidence range, excerpt length, `engagement.type`,
`milestone`/`accomplishment.project`). Zero new dependencies, and no risk
of the validator's rules drifting from `ingest`'s own rules, which a
second hand-copied implementation of the JSON Schema would have risked.
`payload.schema.json` stays the documented contract for the skill itself.

## D-118 — Model id correction: `claude-sonnet-5`, not `claude-sonnet-5-5` (2026-10-11)
The task instruction named `claude-sonnet-5-5` as the runner's default
model — not a real model id. Defaulted to `claude-sonnet-5` in code
(`anthropic.ts`), fully overridable via the `CS_SYNC_MODEL` env var either
way, so this is a one-line fix regardless of which was actually intended.

## D-119 — New Action Items tab on Account 360 (2026-10-11)
`action_item`'s Refresh button (required by the task) had nowhere to live
— Account 360 had no action-item surface at all (standups' own action-items
UI is a different, per-standup-entry thing, not account-scoped). Per the
session owner's explicit choice, added a minimal read-only Action Items
tab (mirrors the Tickets tab's table+Refresh pattern) rather than deferring
the button. No manual add — these are synced facts; a human edits via
Approvals, same as every other CS-sync record type.

## D-120 — Kill switch set to ON immediately after the Session 5 migrations shipped to cloud (2026-10-11)
The new `pg_cron` tick (every 5 minutes) calls `enqueue_daily_sync()`
unconditionally once deployed — harmless on its own (no HTTP call fires
without the Vault secret, which isn't set up yet), but once the clock
first crosses the admin-configured daily run time, it WOULD insert real
`sync_queue` rows for every active account × record type into production,
autonomously, with no explicit trigger. The task's explicit instruction
was "do NOT trigger a real sync — I'll run the first one myself." Rather
than read that as covering only *LLM/Refold* calls, `sync_settings.
kill_switch` was set to `true` against cloud immediately after the
migrations pushed (one `db query --linked` statement, confirmed), so
nothing fires autonomously — not even a harmless queue insert — until the
session owner flips it off themselves (Sync Status screen, or by asking).

## D-121 — Real schema discovery: default privileges grant table/function access directly to `anon`/`authenticated`, not just `public` (2026-10-11)
Found while writing this session's `rls_test.sql` block: a `revoke all on
function ... from public` did NOT block a direct `authenticated` call —
`information_schema.routine_privileges` confirmed `anon`/`authenticated`
hold a *separate* direct EXECUTE grant (from this project's default-
privilege rules), untouched by revoking from the `public` pseudo-role.
Every REVOKE in `20261011000007_sync_runner_functions.sql` now names
`public, anon, authenticated` explicitly. Separately, confirmed `UPDATE`
on a table with no RLS policy for `authenticated` does NOT raise an
exception the way a missing INSERT policy does (INSERT's WITH CHECK
barrier raises `insufficient_privilege`; UPDATE's USING-clause row
filtering just silently matches zero rows) — `rls_test.sql`'s assertion
style was corrected to check the value is unchanged, not that an exception
was thrown. **This likely affects how to read every earlier "no insert/
update policy for authenticated" comment in this codebase for UPDATE
specifically** — worth keeping in mind, though not re-auditing retroactively
this session (flagged, not fixed elsewhere).

## D-122 — The runner calls Claude through OpenRouter, not the Anthropic API directly (2026-10-12)
Session owner's call right after Session 5 shipped: use an OpenRouter key
instead of an Anthropic one. This is **not** a credential swap — OpenRouter
speaks the OpenAI chat/completions shape, so `anthropic.ts` was rewritten
as `llm.ts` (renamed deliberately: a file called `anthropic.ts` that calls
OpenRouter is a trap for the next session) with four real contract
differences handled: the system prompt is a `system`-role message rather
than a top-level field; tools are `{type:'function', function:{...
parameters}}` rather than `{name, input_schema}`; a tool call arrives as
`choices[0].message.tool_calls[]` whose `arguments` is a JSON **string**
needing its own parse (Anthropic handed back a parsed object) and the turn
ends on `finish_reason === 'tool_calls'` rather than `stop_reason ===
'tool_use'`; and a tool result is its own `{role:'tool', tool_call_id}`
message rather than a block inside a user turn. Env var
`ANTHROPIC_API_KEY` → `OPENROUTER_API_KEY`; `CS_SYNC_MODEL` default
`claude-sonnet-5` → `anthropic/claude-sonnet-5` (OpenRouter ids are
namespaced `provider/model`; confirmed against its live models catalog,
$2/$10 per M in/out). Everything outside `llm.ts` — `processUnit`, the
allowlist, validation, the queue — is provider-agnostic and was untouched.
Trade-off accepted knowingly: billing and rate limits now sit with
OpenRouter (at its markup over Anthropic's own pricing) rather than with
Anthropic, in exchange for one key across providers and a one-string model
swap. **Verified live** (11 checks, real key, ~1.3k tokens): the full
two-turn tool-calling round trip — forced tool call → tool result fed back
→ final text turn — plus the `arguments`-is-a-string and
`prompt_tokens`/`completion_tokens` details the loop depends on. The
Anthropic path had never been exercised live at all, so this is the first
time the runner's agent loop has been proven against a real model.

## D-123 — An HTTP header value is a ByteString: no em-dashes (2026-10-12)
Found by the D-122 live test on its first run, not by review: the
`X-Title` attribution header on the OpenRouter call carried this
codebase's usual em-dash (`Refold CS Hub — cs-sync`) and `fetch` threw
`TypeError: Cannot convert argument to a ByteString ... value of 8212`
before any request left the machine. Header values are latin-1 only.
Fixed to an ASCII hyphen. Worth remembering generally — this repo's prose
style uses em-dashes everywhere, and they are fine in JSON bodies, SQL
comments and UI copy, but never in a header value.

## D-124 — The discovery sweep: a sync unit with no account (2026-10-12)
The session owner caught a real gap in Session 5: the runner only ever
syncs accounts that already exist, so *"we started having conversation with
an account but that was not added to the cs hub... That's a miss."* It was
— and it missed the highest-value cases (new prospects, early
conversations). Session 2's "Account match needed" queue was built for
exactly this but could only fire *while syncing a known account*.
Added `record_type = 'discovery'`: a sweep tied to no account, carried on
`sync_state` using the internal Refold org's otherwise-unused slot
(deliberate, not a hack — `sync_state`'s PK includes `org_id` so it cannot
be null, the internal org already exists, and it is already excluded from
every per-account sync, so the sweep inherits the existing lock, watermark
and run recording with no schema change). It gets a roster-wide context
(`known_accounts` with every alias and tenant) instead of one unit, skips
anything already attributable, and emits the rest with a best-guess
identifier — which lands on `ingest`'s existing unresolvable-account path.
**No change to `ingest`, `apply_proposal()`, `_shared/dedupe.ts` or the
resolution UI.** Selection rules are configurable
(`sync_settings.internal_email_domains`, `discovery_channel_patterns`):
Slack = externally-shared **or** name matches a pattern (the owner's call —
`internal-<customer>` is your own team's channel *about* a customer and is
in scope); Fireflies = any non-internal attendee **or** the token owner;
Gmail = any non-internal participant; Zendesk = every ticket. Triggered by
a "Scan for unknown accounts" button (synchronous, no queue, no Vault
secret) and once a day by `enqueue_daily_sync()`.

## D-125 — Four fixes the first live sweeps forced, each found by running it (2026-10-12)
The sweep was built, stub-tested green, and then failed four times in a row
against real data — each failure exposing something only a live run could:
1. **The runner logged nothing**, so "no unknown customers this week" and
   "the agent never managed to look" were indistinguishable. Session 5's
   own spec asked for per-tool-call logging and it was never implemented.
   Added: action, outcome, latency and response size per call (never
   content), plus turn/token/record counts per run.
2. **The agent's `skipped` list was thrown away.** For a sweep it is most
   of the answer — the evidence of what was examined and judged. Now
   persisted to `sync_runs.skipped_items` and shown on Sync Status. It was
   this list that diagnosed fix 3, in the agent's own words.
3. **`RESOLVE_ACTIONS` was actively harmful and is now removed.** It cost
   8–16s per call and *under-reports*: it returned only
   `get_transcript`/`get_user` for Fireflies, omitting `httprequest`, so
   the agent concluded Fireflies could not be listed by date and gave up
   having fetched nothing. The action catalog is fixed and already known
   (it *is* `allowlist.ts`), so it now ships in the context instead.
4. **Slack is `connected: true` but unreadable** (bot token). The connector
   check believed the flag and let the agent burn its whole budget listing
   25KB of channels it can never read. Added `READ_BLOCKED_CONNECTORS` —
   remove the Slack entry when it is re-authorized as a user.
Together these took a sweep from 137k tokens and zero output to a working
run.

## D-126 — A sweep must survive the ~150s Edge Function wall (2026-10-12)
Once the agent actually started fetching, it hit the gateway timeout — and
a timeout is the worst possible failure: every record gathered is lost AND
the unit stays locked for the full 15-minute TTL, so retries just say
"already running" with no explanation. Three changes: the loop watches its
own clock and, when the budget is nearly spent, asks for the answer NOW
with tools withdrawn (a partial result beats nothing); the sweep is given
an explicit `budget.max_items_to_examine` and told to put the remainder in
`skipped` (the watermark only advances on success, so the next run
continues); and **discovery runs on a separate, faster model**
(`CS_SYNC_DISCOVERY_MODEL`, default `anthropic/claude-haiku-5.5`) because a
sweep is bulk filtering, not the careful judgment a per-account sync makes
— on Sonnet each turn took 30–40s and a sweep could not finish at all.
Also: a finalising turn now sets `response_format: {type:'json_object'}`
and drops the tools, after a fast model answered a completed sweep with
8KB of prose; and JSON parsing tolerates markdown fences and leading prose
rather than reporting every one of these as the same opaque
"schema-invalid output".

## D-127 — First live discovery sweep: it works (2026-10-12)
Against real Fireflies data, last 7 days, posting to **local** ingest only
(reset immediately after; nothing real committed anywhere). The sweep
examined ~56 items and reported 14 records — 9 engagements and 5 action
items — across **8 companies that are not in the Hub at all**, each raising
exactly one "Account match needed" item with its held records attached
(18/18 linked). Its 42 skips were sound: 34 internal/not-a-customer (the
same pattern Session 4 found), 2 with no usable content, 1 already a known
account, 1 run-budget. Best-guess identifiers split roughly evenly between
email domains and company names, both valid per the skill. `candidates` was
empty on every resolution — expected while the Hub holds only two fictional
accounts, but it means that field is untested in practice. This is the
behaviour the session owner asked for: the first real sync will show the
team the customers nobody remembered to add, instead of only what someone
typed in first.

## D-128 — A truncated run must not look complete (2026-10-12)
Found while answering the session owner's question about the 150s limit,
not by a test. A run that stopped early — out of time, or having hit its
item budget — still reported `success`, and `success` is what advances the
watermark to `now()`. So everything the run never reached was silently
skipped, permanently. Quiet data loss, worst exactly where it is least
visible: a cold first scan, a backfill, a busy week.
Now: a truncated run reports `partial`, and the agent reports a top-level
`covered_through` (the newest item it fully examined, working oldest-first).
`finish_sync_unit` gained that argument, with explicit rules — success +
covered_through advances to that point; success without it advances to now
(a complete run); partial + covered_through advances only that far (so the
next run resumes); partial WITHOUT it holds the watermark entirely, because
re-reading a window is safe and losing it is not; failed always holds.
This also makes the 150s ceiling a non-issue rather than a wall: a sweep
too big for one invocation now drains across several runs instead of
either dying or quietly losing the remainder.

## D-129 — "Run sync now" means the whole nightly job, not half of it (2026-10-12)
The only manual trigger ran the discovery sweep alone, while the nightly
job ALSO refreshes every record type for every known account. With no real
accounts the two looked equivalent — but the moment accounts exist the
button would quietly do half the job and nobody would notice. The session
owner caught it: *"the manual trigger should ideally be looking for all
accounts for data and updated records similar to daily-automated scan."*
`enqueue_all_units()` is now the single definition of "a full sync", used
by both the nightly job and a new `enqueue_full_sync` provisioning action,
so the two cannot drift. The button queues that work and then the BROWSER
drains the queue one unit per request — which keeps every request far below
the 150s ceiling, shows live progress, and needs no Vault secret and no
background dispatcher. `cs-sync-runner`'s queue entry point now accepts a
super_admin + AAL2 session as well as the service-role key, which is what
makes that possible. The narrower sweep-only trigger is kept as "Scan for
unknown accounts only" for testing.

## D-130 — `create or replace` with a changed signature creates an OVERLOAD (2026-10-12)
Adding `p_covered_through` to `finish_sync_unit` left TWO functions in the
database — the original four-argument one and the new five-argument one —
because `create or replace function` only replaces an identical signature.
A four-argument call then binds ambiguously, and could silently keep using
the stale version that ignores the new watermark rules. Caught by
`rls_test.sql`, which still calls it with four arguments: the suite dropped
from 12 passing blocks to 10. Fixed by dropping the old signature
explicitly in the same migration. Worth remembering for every future
function signature change in this repo.

## D-131 — the sync queue had no real order, so the sweep never ran (2026-10-14)
`enqueue_all_units` appended `enqueue_discovery` after the per-account loop,
which looked like "the sweep goes last" but was worse than that: every row a
single call inserts gets the SAME `enqueued_at`, because `now()` is
transaction-stable — and `claim_sync_queue_item` ordered by `enqueued_at`
alone, with no tiebreak. The claim order was therefore heap order, i.e.
arbitrary. Across 17 production runs the discovery sweep was never claimed
once, which is why four runs spent 2.67M tokens searching for two fictional
fixture accounts and never looked for the real ones. Reordering the INSERTs
would have been cosmetic; the fix is an explicit `sync_queue.priority`
(0 = sweep, 50 = an account a human just confirmed, 100 = routine, 100+n for
accounts finding nothing) and a total claim order `(priority, enqueued_at,
id)`. General lesson for this repo: "insert order" is not an order.

## D-132 — a token cap checked between turns is not a cap (2026-10-14)
`max_tokens_per_unit` was 150,000 and live runs used 208k/226k/381k/412k.
Two compounding causes: the cap was tested only at the top of each turn, so
the turn that crossed it had already been billed; and tool results were
pushed into the conversation untruncated, where — since the whole message
array is re-sent every turn — one 90-channel Slack listing or 150-transcript
Fireflies page was re-billed again and again. Fixed by truncating each tool
result to a byte budget (cutting the longest array so the JSON stays
parseable, with a note telling the model to narrow rather than page) and by
projecting the next turn's cost from the last turn's `prompt_tokens` before
issuing it. The truncation helper was unit-tested before anything was built
on it, which caught two real bugs: the truncation note was appended after the
size search (pushing the result back over the limit) and a top-level array
spread into numeric keys instead of being cut.

## D-133 — an unproductive account gets a probe, not a deactivation (2026-10-14)
The session owner rejected deactivating the two fictional accounts: *"It can
be a human error that someone adds an invalid account and all the tokens
should not utilized on it and it becomes a bottleneck."* So the fix is
systemic. `account_sync_health` counts consecutive empty NIGHTS per account —
once per nightly cycle, not once per unit, so eight record types scanned the
same evening count once. Any find resets it unconditionally, so order within
a night does not matter. An account at 1+ empty nights is scanned on
`sync_settings.probe_token_budget` (25k) instead of the full 150k, returning
to full the moment it produces a record; a genuinely quiet customer is still
scanned nightly, just cheaply. At 30 consecutive empty nights the runner
files a `health` PROPOSAL (risk + reason) rather than writing
`organizations.health` directly — the owner asked for the existing Health
field, and a proposal delivers exactly that once approved while keeping the
one property a direct write would destroy: it cannot silently overwrite a
rating a human set, and the reason is on screen before anyone accepts it.
Tracked in its own table rather than columns on `organizations`, which
carries the generic audit trigger and would log a row on every nightly unit.

## D-134 — re-association on account approval was already built (2026-10-14)
The owner asked that "once an account has been approved or edited or set as a
namespace/org(account)/tenant the fetched details association should be
updated as well before it is approved as a valid record." This already works
and needed no code: `resolve_account_proposal` resolves the decision to a
concrete org/tenant (creating the tenant on a `map_tenant`), writes
`account_sources`, then releases every held record through
`_shared/dedupe.ts` carrying that resolved org/tenant. Worth recording
precisely because the shape surprises: the release does NOT mutate the held
row — it marks the original `superseded` and files a NEW proposal, exactly as
a fresh sighting would. Asserted directly for the first time this session
(12 checks), since Session 7's design depends on it.

## D-135 — the planning room's status was four sessions stale, and inverted (2026-10-14)
The planning dashboard still described the state as of 2026-10-12 morning:
"no real sync has run on the live hub yet, the kill switch is still on",
four unset secrets, Slack bot-only, Gmail/Zendesk unconnected. Every one of
those was out of date, and the first was the opposite of the truth — 17 real
syncs had run, the kill switch was off, and all five secrets had been set on
12 Oct. CLAUDE.md itself carried the contradiction: a Blockers line saying
the switch was off sat directly above a Known-issues line (from D-120)
saying it was on. Corrected both, and recorded the number the planning room
most needs: **17 runs, 3,466,170 tokens, 0 proposals.** The lesson for this
repo is that a status block is only load-bearing if its stale clauses are
deleted, not appended to — a reader who trusts the newest line and the
oldest line equally gets a false picture. Status facts that can invert
(kill switch, secrets set, connectors live) should be stated once, in one
place.

## D-136 — the accounts have no sources, which is why nothing was ever found (2026-10-14)
`account_sources` on cloud is **empty**: the two accounts (`Prism Analytics`,
`Meridian Laboratories`) are bare `organizations` rows. Nothing maps either
name to a Slack channel, an email domain or a Zendesk org, so a per-account
sync has no identifier to match on and correctly reports finding nothing —
which is exactly what 17 runs did, at a cost of 3.5M tokens. Sessions 5-7
all made the machinery cheaper and better ordered without changing this:
Session 7's probe budget stops a sourceless account burning a full budget,
but it cannot invent the mapping. Two things actually produce a first real
result, and neither is "run a Refresh": map sources on a real account
(Account 360 → Sources), or let the **discovery sweep** run — it works from
the connector side inward and needs no sources at all, which is precisely
why it is now claimed first.

## D-137 — skip an account with no sources, but only because the sweep now covers it (2026-10-14)
90% of one day's 1.9M tokens went to 18 per-account units that produced
nothing: both accounts had **zero `account_sources`**, so there was no
identifier to match on and the agent could only search every connector
exhaustively and honestly report finding nothing. `processUnit` now checks
`account_sources` before any model call and skips the unit at **zero tokens**
when an account has none and has never produced a record.

Done alone this would have been a bad trade: no sources -> never scanned ->
never gains sources, a self-sealing blind spot, and exactly the "we were
talking to them but nobody added them" miss that D-124 existed to fix. The
sweep's own rule made it worse — it skipped anything matching a known
account **by name** on the reasoning "that account's own sync already covers
it", so both halves would have deferred to each other.

So the skip ships with its counterpart: refold-skill.md rule 1b now says a
name match against an account whose `aliases` list is **empty** must NOT be
skipped — emit it like an unknown company, so an "Account match needed" is
raised and approving it attaches the identifier. Self-healing instead of
self-sealing. Account 360 says "Not synced - no sources mapped" rather than
leaving a silent no-op, and a skipped unit deliberately does **not** count
toward the 30-night risk flag (it was never examined, so counting it would
march an unexamined account toward a risk proposal). Status is `partial`,
not `success`, so `finish_sync_unit` holds the watermark and the window is
re-covered once sources exist.

## D-138 — a token cap cannot go below the cost of one turn (2026-10-14)
The 25k probe budget from D-133 never bound: post-fix units still cost
80-113k. The cap can only end a run *after* the turn that crosses it, and
one turn costs ~30-40k on its own — the skill prompt (12,922 chars), the
roster, the enums, the action catalog, plus every tool result so far, all
re-sent because the whole conversation goes up every turn. Lowering the
number further changes nothing. Measured improvement from D-132 is real
(accomplishment 412,784 -> 80,783, a 5.1x cut) but the floor is structural.
Only the parked rework — the runner lists and filters deterministically, the
model reads only what qualifies — moves it, by cutting the number of turns
rather than the size of the cap.

## D-139 — a record's account is no longer hostage to its identifier (2026-10-14)
The session owner hit a case none of the four resolution decisions could
express: **CFIHOS is not a company.** It is an implementation Octave is
running with Refold, so "create account" would invent a company that does not
exist, and "ignore" would bin the engagement that genuinely belonged to
Octave. Held records were only ever a COUNT on their resolution — you could
not read one, let alone move it — so the account decision was the single
lever over every record behind it.

Approvals is now two sections. **Accounts** decides what an unrecognised name
is (unchanged). **Details** lists every record waiting — held ones included,
with their content visible for the first time — each showing the account it
will be filed under, with that account editable. A new `reassign_proposal`
action moves one record: a held record is released through the same
`decideAndFile` tree a resolution uses (identical dedupe and validation), a
pending record is simply re-pointed, which is also how a confident but wrong
attribution gets corrected before approval.

Two details that matter. Remembering the identifier is a **choice, not a
consequence**: ticked, it writes an `account_source` so the next sighting
attaches itself; unticked, the record moves and the name stays un-aliased —
which is exactly right when the name is a project rather than another name
for the company. And when the last held record of a resolution is moved away,
that resolution auto-closes as *records reassigned* rather than *ignored*, so
the Accounts section never shows an item with nothing behind it.
`resolve_account_proposal` gained the same `rememberIdentifier` flag, so the
one-click "all of these belong to X" path can also decline to create an alias.

## D-140 — two ways a unit silently left the queue for good (2026-10-14)
Both found by answering "if the screen gets locked, does the sync stop?",
which turned out to be the wrong thing to worry about — the drain is driven
by awaited fetches, so a locked screen keeps going, and a sleeping machine
only pauses it (the in-flight unit still completes server-side, the rest stay
`queued`). The real fragility was what happened to a unit when a run died.

**A lock was treated as a failure.** An interrupted unit holds its
`sync_state` lock for 15 minutes; re-running inside that window returned
`locked`, and the caller wrote the row as `error` — which takes it out of
`queued` permanently. A unit that needed four more minutes was lost, and the
only sign was an "already running" message. Now `locked` leaves the row
queued with `retry_after = now() + 16 min`, and both claim paths (the SQL
`claim_sync_queue_item` and the browser drain's own query) skip a waiting row
— without that skip the drain re-picks the same locked unit forever.

**A claimed row was never reclaimed.** `claim_sync_queue_item` marks a row
`processing` and nothing reset one, so a worker killed at the ~150s wall
stranded it permanently. Latent until now only because the browser drain
never sets `processing` — it would have gone live the moment the pg_cron
dispatcher was switched on, i.e. exactly when nobody is watching. New
`requeue_stale_sync_units()` puts back anything claimed over 20 minutes ago
(above both the function wall and the 15-minute lock TTL, so it cannot race
a live run) and closes `sync_runs` rows left lying at `running`, which the
Sync Status screen was otherwise showing as runs that would never finish.
`dispatch_sync_queue()` now reclaims before it claims.

## D-141 — the Vault secret is set; the kill switch is the only thing holding it (2026-10-14)
`cs_sync_runner_auth` now exists on cloud (the service-role key, read only by
`dispatch_sync_queue()` to authenticate its `pg_net` call). The key was never
printed into the transcript — piped from `supabase projects api-keys`
straight into `vault.create_secret`. This completes the autonomous path: the
5-minute `pg_cron` tick can now dispatch for real. It does not, because
`kill_switch` is `true` — verified by calling `dispatch_sync_queue()`
directly and getting 0. That switch is now the single control over whether
the Hub spends money unattended, which is worth stating plainly given one
day's manual runs cost 3.47M tokens. Note it also gates the manual button:
with the switch on, "Run sync now" queues nothing.

## D-142 — the 138-run review: what 11.5M tokens actually bought (2026-10-15)
First dataset big enough to judge the pipeline. 138 runs over ~19.5 hours,
**11,553,163 recorded tokens**, producing **91 records** plus 17 account
matches — ~127k tokens per record, down from 448k. The real bill is higher
still: a run that dies never records its usage, and 43 runs died.

What the measurements settled:
- **The sourceless skip (D-137) works.** Prism and Meridian were scanned 37
  times for **zero tokens**; at the 124k average that avoided ~4.6M.
- **The nightly ran autonomously** at 01:30:03 — pg_cron via the Vault
  secret, no browser. Machine-independence confirmed.
- **31% of runs died** (43/138), and because the agent only emits records in
  its FINAL answer, everything gathered dies with them. This, not the
  searching, is now the dominant waste.
- **93 runs were `partial` at an average of 66 seconds**, against a wrap-up
  that begins at 65. They are all hitting the clock, not the token cap.
- **Partial does NOT duplicate.** Verified against real data: 91 proposals,
  **0 duplicated `source_ref`s**, none missing one, and 31 `updated_pending`
  outcomes — re-sent records merging into their existing proposal rather
  than filing twice. Re-covering ground costs tokens, never duplicates.

## D-143 — "cannot run now" is not "this unit failed" (2026-10-15)
The same mistake in two more places, both found by the review.

**Pausing destroyed the backlog.** Flipping the kill switch ON while units
were queued returned `failed`, and the caller wrote each row as `error` —
removing it from `queued` permanently. 30 units were lost to a pause. A
paused unit now returns `locked` (the existing "keep it queued" signal) with
no `retry_after`, since there is no lock to wait out and the operator decides
when it resumes. The 30 rows were restored by the migration.

**The reaper was unreachable exactly when it was needed.**
`requeue_stale_sync_units()` sat after `dispatch_sync_queue()`'s kill-switch
early return, so with the system paused nothing ever reclaimed a unit
stranded by a dead worker — one row from the 01:30 nightly had been stuck at
`processing` for hours and could not have recovered. Cleaning up after a
death is not "doing work" and must not be gated: the reclaim now runs first,
before any gate. Verified live — calling `dispatch_sync_queue()` with the
switch on dispatched 0 and returned the stranded unit to `queued`.

## D-144 — a lookup gets a hard ceiling; the clock is checked mid-turn (2026-10-15)
Runs were dying at the Edge Function's ~150s wall because the deadline was
only tested BETWEEN turns and no single call had a timeout — one slow Slack
or Fireflies lookup ran unbounded and took the run's records with it. Now
each call aborts at 25s (surfaced to the model as a readable tool result
telling it to narrow, not retry), and the clock is checked between calls
within a turn, with every remaining `tool_call` still answered because the
API rejects a turn with an unanswered one. Worst case is now 3 calls x 25s =
75s before finalising, leaving 75s of the wall for the final turn.
**Not done, and worth being clear about:** "save records as they are found"
is impossible under the current agent contract — the model emits records
only in its final answer, so there is nothing to save mid-run. Genuine
incremental saving would need the model to file records through a tool as it
goes. The deadline work is what converts a death into a partial that keeps
its records. Raising `CS_SYNC_DEADLINE_MS` is also off the table: this
project is on Supabase's free tier, where the wall is 150s, and the current
100s/35s split is already the right margin for it.

## D-145 — the nightly covers one day; the day picker is for manual runs (2026-10-15)
The nightly was re-scanning a full week every night. Not by configuration —
by accident of correctness. A `partial` run deliberately holds the watermark
(it did not cover the window, so it will not claim to), and **41 of 41 units
ended partial**, so the watermark never advanced and the fallback was a
7-day lookback. Measured: 7-day windows averaged 207,796 tokens, "default"
windows 206,852 — identical, because they were the same scan.

Daily mode now resolves to **exactly one day**, and deliberately does NOT
lean on the watermark for its floor: leaning on it is what produced the
week-long nightly. A watermark NEWER than a day is still honoured, since
that only makes the scan smaller. An explicit `windowDays` from the manual
trigger always wins, and the Sync Status page now says so.

The tradeoff, stated rather than buried: a missed night is no longer
re-covered automatically. That is the right shape for this system — routine
passes stay cheap, and catching up on a gap is exactly what the manual
trigger with a wider range is for. It also means a run of failures no longer
silently inflates every subsequent nightly.

Worth recording what this does NOT fix: the per-unit floor is set by fixed
overhead, not data volume. Every turn re-sends the skill prompt (12,922
chars), the roster, the enums and the action catalogue, and the agent must
still ask all four connectors about the account whichever window it has.
Observed floor 55,387 tokens, median 185,386, runs averaging 108 seconds
against a wrap-up that begins at 65 — these are time-bound, not data-bound.
A one-day window should land nearer 60-120k than 185k, which is a real cut
but nothing like the 7x the arithmetic suggests. Only the parked rework
(runner lists and filters; the model sees only qualifying items) changes the
shape of that.

## D-146 — Approvals is one list, and it leads with evidence (2026-10-16)
The screen asked for decisions it gave no basis for. A pinned "Accounts ·
match needed" section sat above a separate "Details · records waiting"
section showing the same work twice, and the resolve modal offered four
abstract choices over an opaque string — *"zendesk org 29547552465692"* —
with no way to tell what that org was or to create it. The context was
already in the database and simply unshown: that identifier's held record is
titled **"Calendly Auth Issue"**. 80 items were queued behind this.

Now one list. Records the Hub could not attribute **cluster under the
identifier they share**, so 17 records behind one Zendesk org is one
decision rather than 17 — with a per-row "this one is different" escape for
the odd one out. That keeps "a single list" without reintroducing the
repetition the two-section layout existed to avoid. Each cluster shows its
records and their evidence excerpts up front; the identifier is secondary
text, where it belongs.

New shared `AccountTenantPicker` replaces every flat account `<select>`.
Accounts are optgroup headings, tenants are indented beneath with a ↳ and a
"(tenant)" suffix, and the account's own option keeps its plain name whether
or not it has tenants — so the label never shifts depending on data shape
(caught by e2e: selecting by label failed when an account gained a tenant).
It creates accounts AND tenants inline, which is the gap that made "CFIHOS
is an implementation Octave runs" unanswerable: the right answer existed and
there was nowhere to enter it.

No backend change was needed. `reassign_proposal` already takes
`orgId` + optional `tenantId` + `rememberIdentifier` and auto-closes a
resolution when its last record leaves, so filing a cluster is just that
call per record — the last one closes the match automatically, with no
separate "resolve" step to forget.

## D-147 — one card for every pending item, and no dead ends (2026-10-16)
Stage 1 landed a single list but kept two designs inside it: an amber
grouped block for records with no account, a white card for the rest. The
owner's read was fair — it still looked like two jobs. It is one job: decide
about a record. An unattributed record is the same record missing one
answer, so the frame, the evidence and the actions are now identical, and
only the account line differs — where it is unknown it carries the control
that supplies it.

The grouping was dropped, but not the efficiency it bought: the Set-account
modal offers *"apply to all N records seen as X"*, ticked by default. The
uniformity is in the list, the batching is in the decision.

**Creating an account inline now uses the real form** — name, segment,
deployment type, deployment model — not a bare name field. An account made
mid-approval is a complete one rather than something to go back and fix.

**Tenants are offered only where they exist.** Cloud customers are a single
org by definition, so the tenant option appears only for on-prem and
dedicated-cluster accounts, plus an inline *"add a tenant under X"* once
such an account is chosen. New `dedicated_cluster` value on
`deployment_model` (its own migration — a new enum value cannot be used in
the transaction that adds it).

**And the dead end is gone.** A milestone requires a project; filing one
against an account with no matching project returned *"matches no project
under Naehas. Create the project on that account first"* — a correct check
and a useless instruction, since there was nowhere to create it from. The
modal now recognises that refusal, offers *"Create project 'X' and file
it"*, and retries. The guard stays; only the dead end goes.

## D-148 — never gate a capability on a field nobody fills in (2026-10-16)
D-147 offered the tenant option only for on-prem and dedicated-cluster
accounts, which is correct in principle and broke the feature in practice.
Checked against live data: of ten real accounts, **one** has a deployment
model set. Everything created from an approval defaults to
`deployment_type='cloud'` with `deployment_model` null, because the
resolution flow never asks — so the parent dropdown offered exactly one
account and creating a tenant was impossible. Kantata, described by the
owner as a dedicated cluster with several orgs inside it, is recorded as
plain cloud with no model at all.

The rule is now a **hint, not a gate**: every account is a candidate parent,
with on-prem/dedicated ones marked `· on-prem/dedicated` so the distinction
is still visible, and the contextual "add a tenant under X" shortcut is
offered for any chosen account. An account can also be created from inside
the tenant form, returning to it with the new account already selected as
the parent rather than dropping the user back at the start.

Generalisable: a conditional affordance keyed on optional metadata will be
wrong whenever that metadata is usually blank. Either make the field
mandatory where it matters, or let the condition inform rather than forbid.

## D-149 — the hierarchy, settled: account → tenant, two levels (2026-10-16)
Three competing models had been running at once — the mock admin panel's
`cluster → namespace → org → tenant`, the Hub's real `account → tenant`, and
an approved plan for `account → namespace → tenant`. Worse, **"org" meant two
different things**: `organizations` is the customer ACCOUNT in the Hub, while
a Refold "org" is the workspace a signup creates. That collision is why the
shape kept being hard to pin down.

The owner's definition, now authoritative:

- **Account** = an organisation using Refold; the CS team's unit of ownership
  (FDE / EDL / TA).
- **Tenant** = one signup on that account, which IS one Refold org/workspace.
  Confirmed as the same thing, not two levels.

Per deployment shape:
- **cloud** — shared infra. The account's own customers are Refold *linked
  accounts* the Hub deliberately does not track individually; account-level
  metrics only, so **no tenants**.
- **dedicated_cluster** — a Refold-managed instance for one account; usually
  one signup per their customer, one linked account each. Each signup is a
  tenant. Metrics for the account AND per tenant.
- **on_premise** — the account installs via helm/terraform on its own infra
  (Refold has no access). Several K8s clusters, each with several namespaces,
  each namespace one installation, each installation one or more signups.
  Each signup is a tenant. Metrics for the account AND per tenant.

**Cluster and namespace are identification, not hierarchy** — the owner's
explicit call. They are columns on `tenants` (`cluster_name`,
`namespace_name`, plus `refold_org_id` and `linked_account_id`), so every
query and RLS policy stays two levels deep while the UI groups on-prem
tenants into cluster → namespace accordions. Presentation over flat data is
far cheaper to own than two more tables with their own policies, FKs and
D-068 ambiguity risk.

This **supersedes the approved plan's `namespaces` table** — Stage 2 no
longer needs one, which removes the largest piece of schema work from it.

## D-150 — the doc protocol is enforced, not just written (2026-10-16)
The end-of-session protocol has required updating PROGRESS.md and this
file's status block since Phase 6. It was still skipped for four sessions
running (50–53) while `devlog.md` and `decisions.md` stayed current — and
the owner had to notice, for the second time (D-135 was the same failure,
and logging the lesson did not prevent the repeat). A rule that lives only
in prose gets dropped under momentum.

So it is now checkable: `scripts/docs-check.ts` (`npm run docs:check`,
also inside `npm run verify`) fails when the newest `docs/devlog.md` entry's
date disagrees with CLAUDE.md's "Last session" or PROGRESS.md's pointer, or
when the newest devlog entry cites a `D-` id that has no section here.
Verified by deliberately staling CLAUDE.md and confirming a non-zero exit.

The protocol itself was rewritten to say "do ALL of this unprompted — if the
owner asks whether the docs were updated, the protocol has already failed",
and gained three things it had been missing: build-spec-v3.md /
product-overview.md when the domain model, a contract or a screen's behaviour
changes (the spec described a hierarchy that had been false for weeks —
D-149); redeploying any changed Edge Function; and the `--env-file
supabase/.env` requirement for e2e, without which stub mode is off and the
runner calls the real Refold API with an empty key.

What the check cannot catch is whether the spec was updated when it should
have been — there is no reliable textual signal for "the domain model
changed" — so that stays a prompted note rather than a gate.

## D-151 — accounts and tenants were write-once; moving a tenant is not an UPDATE (2026-10-16)
Neither an account nor a tenant could be corrected after creation — no name,
segment, lifecycle, deployment shape, and no way to change which account a
tenant belonged to. That is untenable here specifically because so many are
created mid-approval from a company name the agent guessed, and because the
owner's own Kantata split happened *after* its tenants existed.

Editing the simple fields is ordinary (`updateAccount` already took most of
them and merely had no UI; `updateTenant` is new). **Re-parenting is not.**
Twelve tables carry `tenant_id` beside `org_id`, so changing only the
tenant's parent would leave every record of that tenant pointing at an
account it no longer belongs to — silently, with no error, surfacing only as
a record appearing under the wrong customer. `move_tenant()` does both halves
in one SECURITY DEFINER transaction: the tenant, its records across all
twelve tables, and the `account_sources` identifiers that resolve to it (left
behind, those would make the next sync re-attribute the tenant's traffic to
the account it just left).

Two deliberate refusals rather than silent behaviour: moving onto an account
that already has a tenant of that name raises a readable message instead of a
raw 23505, and a move to the current parent is a 0-row no-op instead of an
error. One explicit UPDATE per table, matching `apply_proposal()`'s fixed
allow-list style — a dynamic loop over `information_schema` would silently
pick up any future table, which is exactly the implicit behaviour this
codebase avoids.

The RLS block asserts the property that matters and cannot be eyeballed: after
a move, no record disagrees with its tenant about which account it belongs to.

## D-152 — the hierarchy is shown by expanding one table, not by a second design (2026-10-16)
The Portfolio board needed to show what sits under an account without
becoming two layouts — the trap the Approvals screen fell into, where
records with and without an account looked like different species (D-147).
So `DataTable` gained an optional `renderExpanded`: accounts with tenants
get a chevron and open in place; cloud accounts, which have none by
definition, render exactly as before. One component, one design.

On-prem tenants are grouped under the cluster each signup runs in. That is
**presentation only** — the tenants remain a flat list (D-149), so no query
or policy gains a level.

One bug worth recording because it is easy to repeat: `renderExpanded`
returned `<AccountTenants/>` unconditionally, and a JSX element is always
truthy even when the component renders `null`. Every row therefore grew a
chevron and the ones without tenants expanded to nothing. Emptiness has to
be decided by the caller, before constructing the element. It was caught
only because the e2e assertion was made unconditional — the earlier guarded
version (`if (await expander.count())`) would have skipped silently and
passed, which is exactly how the tenant-parent bug reached the owner.

New `/accounts/:orgId/tenants/:tenantId` page: a tenant is one signup on an
account, so its page lives under that account rather than as a top-level
entity. It shows where the signup runs and says plainly that metrics are
absent — for air-gapped accounts, that Refold has no access and figures
arrive by entry or upload.

## D-153 — retire the fixture-backed screens, and say so where they remain (2026-10-16)
Stage 2d was planned as "delete `useMockData.ts`". It cannot be, and finding
out why mattered more than the deletion.

**Removed from the internal app:** `/overview`, `/cloud-customers` and
`/onprem-customers` — all three entirely fixture-backed and superseded by
Portfolio plus the merged account page. They redirect rather than 404, so
existing links still land somewhere useful. `homeRoute()` was unaffected
(`/home` was already first in the nav).

**Made real:** global search. It was wired to fixtures, so typing a real
customer's name returned nothing while fictional companies matched — worse
than no search, because it answers confidently and wrongly. It now queries
`organizations` and `tenants`, with RLS scoping it for free (a customer owner
sees only their own, which the fixture version could not guarantee).

**Kept, deliberately:** `useMockData.ts` still backs the cloud/on-prem owner
detail pages, namespaces and the owner dashboard. Those portals are FROZEN —
"kept working, no new work" — and deleting their data source would break
them. They are no longer reachable by a super admin, so the internal
experience is clean; the fixtures now serve only the frozen surfaces.

**Flagged rather than silently left:** there is no `feature_flags` table at
all. That screen reads and writes in-memory fixtures, so a toggle changes
nothing in any customer's deployment. A banner now says so. This is worse
than a fake metric and worth naming: a fake number misinforms, but implied
control invites someone to act on it.

## D-154 — the nav the owner specified, built when they asked rather than when I had planned (2026-10-16)
The owner described the information architecture they wanted several
messages before this — Home, Portfolio (Board / Add details / Coverage),
Settings holding feature flags, users & roles, ingest tokens and sync
status, plus Audit log and Standups. I staged it as "Stage 3" and shipped
four sessions of other work first, so from their seat the thing they had
actually asked for kept not appearing. They were right to push. The staging
was my judgement, not their instruction, and a deferral is only reasonable
while the person waiting agrees with it.

Built as specified: the collapsed **Admin** disclosure is gone, and
everything inside it is a section of Settings — which is where an admin
looks for configuration, rather than behind a separate group they have to
know about. Audit Log is top-level. Portfolio gains the **Add details** tab.
Old routes still resolve, so bookmarks and deep links keep working.

Two judgement calls, both flagged rather than hidden: **Approvals** was not
in the owner's list but is kept top-level — it is the screen they use most
and its omission reads as an oversight, not a decision. **People** was not
listed either; it sits under Settings beside Users & roles, since both are
about people.

The **Add details** tab states plainly that upload is not built yet and
points at what does work, instead of presenting a tab that silently does
nothing.

## D-155 — a tenant's metrics were going to overwrite its siblings' (2026-10-17)
Found while building Stage 2c, not by a report. `metric_values` has carried
`tenant_id` since the tenants work and `apply_proposal()` has been inserting
it ever since — but the uniqueness constraint was never widened:

    unique nulls not distinct (org_id, metric_key, period, project_id)

Two tenants of one account reporting the same metric for the same period
therefore collide, and the second silently replaces the first. Nothing had
hit it only because no metric rows exist anywhere (verified against
production: 0 rows). It would have bitten the first time an on-prem customer
reported per-namespace figures — which is precisely what this stage exists
to enable. Constraint now includes `tenant_id`; the demo seed's ON CONFLICT
had to follow, which is how the gap surfaced at all.

The account-level Metrics view also had to start excluding tenant-scoped
rows, or a tenant's figure would show as the account's.

## D-156 — the uploaded file is not kept; only its contents (2026-10-17)
Stage 2c asked for csv/json/xlsx/doc upload "that the agent can read". Built
as: parse in the browser, write ordinary `metric_values` rows with
`source = 'file'`, never store the file. No bucket, no storage policies, no
Edge Function, and no second copy of customer data to look after — the value
of an upload is its contents, and keeping the file as well buys nothing.

Only **csv and json** are accepted. xlsx and doc need a parsing dependency
this app does not carry, so they are refused with a reason ("export the
sheet as CSV") rather than accepted into a queue nothing reads. That would
have been the same silent no-op as the feature-flag toggles (D-153).

Rows are validated before anything is written: unknown `metric_key`s are
reported and skipped rather than failing one row at a time against the
foreign key, and a preview lists what will be recorded. The parsers live in
`src/lib/metricParse.ts` rather than beside the component precisely so they
can be tested directly — 12 cases, including each refusal.

# Parked

Out-of-scope ideas land here instead of derailing the current prompt block.
Format: one line each, with the session it came from.

- Maintenance / pre-production cleanup (deploy stage): rotate the Supabase CLI
  access token; rotate the secret (service-role) key + DB password; change the
  demo-user passwords or keep the hosted preview URL unlisted (known demo creds
  are publicly reachable once deployed); review/disable demo logins before wider
  sharing.
- **Token sustainability — move listing/filtering out of the agent and into
  the runner (Session 41, 2026-10-12).** Deliberately parked; the current
  architecture stands for now. The measurement that prompted it: one live
  7-day discovery sweep cost **154,000 tokens to produce 14 records** — so
  roughly **98% of the spend was searching, not reporting**. Two causes:
  (a) every turn re-sends the whole conversation, so an 18KB meeting list
  fetched on turn 2 is paid for again on every later turn; (b) the agent
  does the cheap filtering ("is anyone here outside refold.ai?") that is a
  deterministic string comparison. Proposed fix when picked up: the runner
  lists and filters per connector, and hands the model only the few items
  that qualify. Expected to cut a daily sweep to the low thousands of
  tokens, make the filter exact rather than a judgment call, AND make the
  watermark exact — because the runner would control ordering and counting
  instead of trusting a model-reported `covered_through` (see D-128's
  remaining weakness). Rough costs at today's volumes for scale: a daily
  sweep is ~2 cents on Haiku; the real exposure is per-account units at
  ~20 accounts × 8 record types nightly on Sonnet (order of $10/day vs
  ~$0.50/day on a cheaper model) — which the fix above largely removes the
  need to trade off, since it cuts volume rather than quality.
- Other known token/accuracy gaps to pick up with the above:
  `max_tokens_per_unit` is a setting in the UI that **nothing reads** (a
  dead control); the sweep's `max_items_to_examine` is hardcoded at 20 and
  is advisory to the model, not enforced; and `covered_through` is
  self-reported, so a confidently-wrong value could advance the watermark
  past unread items (the omission case is already safe).
- Rotate the OpenRouter API key (Session 39, 2026-10-12): it was pasted in
  plaintext into a chat transcript when it was handed over, same category as
  the Refold API key below. It is live on cloud as `OPENROUTER_API_KEY` and
  works; rotate it (and re-run `supabase secrets set`) before go-live.
- Custom SMTP before inviting the real team (Session 28, 7.2a): Supabase's
  built-in email sender is capped at 2 emails/hour, too low for onboarding a
  real CS team via the invite flow.
- Standups (Session 31, equal-admins Part 3): anyone-hosts model designed
  (D-085) but not built — this session shipped only Parts 1–2 (people
  simplification + Home), per the Head of CS's own "ship 1–2, stop, report"
  instruction. Needs `standups`/`standup_entries`/`action_items` schema + a
  screen.
- People activity screen (Session 31, equal-admins Part 4): per-person
  detail page (active roles, history, recent activity, standup entries) not
  built this session — the People directory (D-086) covers roles/reports_to
  only so far.
- Performance indexes / KPIs (Session 31, equal-admins Part 4): explicitly
  deferred to a later block, alongside gamification (Phase 10) — compute
  from `account_roles` history + the audit log; no new tracking needed.
- Per-token rate limiting on the Ingest API (7.4 session): not needed until
  7.5 actually runs a sync on a schedule; revisit when that lands.
- Rotate the Refold API key (7.5-pre session): exposed in an earlier
  planning chat, per the session owner — not during this discovery
  session, which only ever read its length/prefix.
- Production key (`pk…`) + a production-environment MCP server/account
  before go-live (7.5-pre session): this discovery only used the
  test-environment (`tk…`) key and server; a separate production setup is
  needed before 7.5 runs against real customer data in prod.