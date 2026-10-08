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

# Parked

Out-of-scope ideas land here instead of derailing the current prompt block.
Format: one line each, with the session it came from.

- Maintenance / pre-production cleanup (deploy stage): rotate the Supabase CLI
  access token; rotate the secret (service-role) key + DB password; change the
  demo-user passwords or keep the hosted preview URL unlisted (known demo creds
  are publicly reachable once deployed); review/disable demo logins before wider
  sharing.
- Custom SMTP before inviting the real team (Session 28, 7.2a): Supabase's
  built-in email sender is capped at 2 emails/hour, too low for onboarding a
  real CS team via the invite flow.