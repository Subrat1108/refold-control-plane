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

# Parked

Out-of-scope ideas land here instead of derailing the current prompt block.
Format: one line each, with the session it came from.

- (empty)