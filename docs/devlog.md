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

## Session 30 — 2026-10-09 — 7.3: Approvals inbox + audit log screen
**Built:** closes the write-pipeline loop (build-spec-v3 § 3). The real
design question was what "approve" does — the spec says it applies the
change, and the audit trail needs literal `action='approve'`/`'reject'`,
which the generic trigger can't produce on its own. Built two SECURITY
DEFINER functions instead of a client-side status flip:
`apply_proposal(proposal_id, decided_by, payload_override)` and
`reject_proposal(proposal_id, decided_by, reason)` (migration
`20261009000001_apply_proposal.sql`). `target_table` is checked against a
fixed allow-list matching § 3.1's pending kinds exactly — milestones,
accomplishments, risks, escalations, tickets, metric_values (create/update/
delete), organizations (update only, health changes) — one explicit branch
per table rather than dynamic SQL, so there's no identifier-injection
surface and a disallowed table raises instead of silently doing nothing.
Each function applies the change, marks the proposal decided, and writes
one explicit `audit_log` row with the real action, all as one transaction.
- **`/approvals`:** filter bar (type/source) + ScopeSwitcher/SavedViewsMenu,
  a card per pending proposal (proposer, source, evidence, before→after
  diff fetched live from the target table), Approve / Edit then approve
  (pre-filled form, calls apply with the edited payload) / Reject (reason
  required), checkbox + bulk-approve.
- **`/audit-log`:** filter bar (table/action/date range) + ScopeSwitcher,
  paginated `DataTable` of who/action/record/account/changed-fields, CSV
  export (a small client-side builder — nothing like it existed yet).
- **Nav:** `usePendingProposalCount` renders a live badge on the Approvals
  item (hidden at 0, per spec).
- **Fixtures:** 7.1's `phase7_demo_data.sql` already seeded 2 pending
  proposals (both 'create' — I'd missed this on first pass). Added 3 more,
  local-only (`seed_proposals.sql`), covering 'update' and 'delete' so
  edit-then-approve and reject are actually exercisable, not just creates.
**Verified:** fresh `db reset`; `rls_test.sql` all 5 blocks PASS (new block:
AAL1 and non-super-admin rejected; approving the milestones proposal
actually updates the row *and* writes exactly one `action='approve'` audit
row; rejecting leaves the target table untouched and writes
`action='reject'`; an `insert`ed disallowed-table proposal (`profiles`)
raises rather than no-op-ing; customer roles see 0 proposals);
`smoke-login.ts` all 3 roles PASS; typecheck/lint (0 errors)/build green.
A throwaway script ran the full approve/edit-then-approve/reject/bulk flow
against the real API — confirmed the edited payload wins over the original
on edit-then-approve, the rejected ticket survives, the pending count drops
from 5 to 0, and `audit_log` shows exactly 4 approves + 1 reject.
Cloud: `db push --dry-run` matched exactly 1 migration; `migration list`
27/27 local=remote; no Edge Function changes this block.
**Deviations:** none from the approved plan, beyond the fixture-overlap
correction above (planned 5 new proposals, shipped 3, since 2 already
existed).
**Decisions:** D-080
**Next:** Home + per-team Standups + Team (FDE performance) — pulled ahead
of Phase 8.
**Issues:** same no-browser-automation-tool gap as 7.2b (see CLAUDE.md) —
verified at the API/RLS/schema layer, not click-tested. The Approvals inbox
will stay thin on real data until 7.5/7.6/7.8 ship actual proposal
producers (chat agent, agentic sync, file import).

---

## Session 29 — 2026-10-08 — 7.2b: Portfolio + Account 360
**Built:** the two screens a CS person actually works in day to day
(build-spec-v3 § 6; product-overview § 5.2–5.3), on top of 7.1's schema and
7.2a's scope/saved-views plumbing.
- **Portfolio** (`/portfolio`): Board tab is the account list — grouped by
  segment, filterable (segment/health/lifecycle), `ScopeSwitcher` +
  `SavedViewsMenu` wired in, each row showing health/lifecycle/deployment/
  owner/open-escalations/next-milestone/last-engagement/coverage%. "Add
  account" (no invite, direct `organizations` insert). Key milestones +
  Recommendations+impact sections (`portfolio_notes`). Coverage tab: a
  7-section (projects/milestones/risks/escalations/tickets/engagements/
  metrics) current/stale/missing matrix per account.
- **Account 360** (`/accounts/:orgId`): header + 6 tabs — Overview (health
  with reason, mark verified, open escalations, next milestones, recent
  activity from `audit_log`), Projects (project cards with nested
  milestones/accomplishments/risks/asks, inline add/remove, an EDL/FDE/TA
  assignment slide-over fulfilling 7.2a's deferred `project_members` UI —
  D-077), Escalations (add/resolve), Tickets (manual add — sync is 7.5),
  Engagements (log/timeline), Metrics (enter value per period, grouped by
  category). Every row carries a `SourceBadge` (source + "verified Nd ago").
- **Schema:** one migration — `organizations` gained `health_reason`,
  `verified_at`, `updated_by` (the one real gap found planning this block;
  every other table this screen touches already shipped in 7.1). New hook
  file `usePortfolio.ts` (~40 functions: reads + direct-write CRUD across
  accounts/projects/milestones/accomplishments/risks/asks/escalations/
  tickets/engagements/metric_values/portfolio_notes/project_members), new
  `SourceBadge` component, nav + router entries.
**Verified:** fresh `db reset`; `rls_test.sql` all 4 blocks PASS (new block
covers the `organizations` AAL2 gate on the 3 new columns + customer-role
zero-rows on account-record tables not yet individually asserted —
engagements/metric_values/portfolio_notes/milestones/accomplishments/asks);
`smoke-login.ts` all 3 roles PASS; typecheck/lint (0 errors)/build green. A
throwaway script exercised every write path in `usePortfolio.ts` against the
real AAL2-protected API end to end (account → project → project_member →
milestone → accomplishment → risk → ask → escalation + resolve → ticket →
engagement → metric value → portfolio note), confirmed the generic audit
trigger fires on the new writes, and confirmed the `organizations` columns
round-trip correctly. **No browser-automation tool is available in this
environment, so the UI itself was not click-tested end to end** — flagged
explicitly rather than claimed; everything above the rendering layer (RLS,
schema, the exact queries/mutations the components call) is verified
directly against the real API.
Cloud: `db push --dry-run` matched exactly 1 migration; `migration list`
26/26 local=remote; no Edge Function changes this block, no redeploy needed.
**Deviations:** two scope calls not spelled out in the spec, both logged as
decisions rather than silently assumed — Portfolio's board *is* the account
list (no separate "Accounts" screen this block), and the cross-account
"Projects" nav item (product-overview § 5.6) is deferred, since it's not in
build-spec-v3's 7.2b bullet list and Account 360's Projects tab covers
per-account work already.
**Decisions:** D-079
**Next:** 7.3 — Approvals inbox + audit log screen.
**Issues:** no browser-based manual QA this block (tooling gap — see
Verified, above). "Pending approval" never shows in the coverage matrix yet
(needs 7.3's proposals/approvals data). Standalone Projects screen and a
distinct "Accounts" nav item remain deferred (D-079).

---

## Session 28 — 2026-10-08 — 7.2a: people, teams, assignments, scoped views
**Built:** the people-and-permissions foundation 7.2b builds on (build-spec-v3
§ 5 "People, teams and views"; docs/product-overview.md). Supersedes the
previous session's single-7.2 plan — now split 7.2a (this)/7.2b (D-076).
- **8 append-only migrations:** enums (profile_title/assignment_role/
  saved_view_scope); `profiles.title` (super_admin only, CHECK-constrained);
  `teams`/`team_members` (surrogate id on team_members so the generic audit
  trigger populates a real record_id, D-072); `account_assignments` +
  `organizations.owner_profile_id` turned into a DERIVED column (primary EDL →
  else primary TA → else NULL) enforced by a force-overwrite trigger, not
  convention (D-070); `project_members` replacing `projects.fdes`/
  `edl_profile_id` via a GUARDED DROP (fails loudly if any data exists, rather
  than fuzzy name-matching — D-071); `saved_views` (owner-only RLS, no audit
  trigger — personal preferences, D-072); 8 scope-helper SECURITY DEFINER
  functions (my/team/person/my_team × account/project) — focus only, never
  access control (D-073); an 8th migration hotfixing an `audit_log` grant
  regression found during this session's own verification (D-078).
- **Edge Function:** new `set_title` super_admin+AAL2 action (D-069), same
  shape as `assign_sub_role`/`set_user_status`; `writeAudit()` fixed to write
  `record_table`/`record_id` (was still writing the pre-7.1 column names,
  D-078); redeployed.
- **UI:** `/team-structure` (super_admin nav item) — People (set title),
  Teams (create/edit/members), Accounts (assign EDL/TA/FDE + primary). New
  `ScopeSwitcher` + `SavedViewsMenu` components + `useScope(page)` hook
  (localStorage-persisted, default-resolution chain D-074) wired into the
  Accounts list as the proof surface. Project-members UI deferred to 7.2b's
  Account 360 (D-077).
- **Types:** `Profile`/`ManagedUser` gained `title`; new `Team`/`TeamMember`/
  `AccountAssignment`/`ProjectMember`/`SavedView` + composed `TeamSummary`/
  `AccountAssignmentRow`. `Project.fdes`/`edlProfileId` removed.
- **Fixtures:** 6 fictional CS people (local only, full login-capable — D-069),
  2 teams (one FDE in both, exercising the multi-team union), assignments
  across both fictional accounts. Cloud demo-data script updated to write
  `project_members` instead of the dropped columns.
**Verified (honest):** read-only `supabase db dump --data-only` against cloud
BEFORE pushing confirmed `projects` had 0 rows (no `INSERT` in its data
section) — the guarded drop was safe. A throwaway `set_title` script
(not committed) first caught the audit row silently missing — traced to
`service_role` having lost `insert` on `audit_log` (D-064, last session) and,
once that was fixed, to `writeAudit()` still writing dead pre-7.1 column
names — both fixed this session (D-078) and re-verified clean. Final
verification, all against a fresh `db reset`: `rls_test.sql` all 3 blocks
PASS (title not self-editable; owner_profile_id force-override proven
directly; team_members' surrogate-id audit trail proven; saved_views private
per owner including a blocked cross-owner insert; all 8 scope helpers return
the exact expected sets — Reza/Tomás/Owen/Grace/Dana, including the
multi-team union and the empty-set case; customer roles see zero rows across
all 5 new tables); the `set_title` script's full 6 checks PASS (AAL1/
non-super-admin/invalid-title/non-super_admin-target rejections, happy path,
and the audit row — now present); `scripts/smoke-login.ts` all 3 roles PASS.
`db push --dry-run` matched exactly the 8 migrations (7 planned + the
hotfix); real push applied cleanly; `migration list` confirmed 25/25
local=remote; `functions deploy provisioning` succeeded.
**Deviations:** found and fixed a real regression from last session (D-064)
during this session's own verification — see D-078. No deviation from the
approved (amended) 7.2a plan itself.
**Decisions:** D-069–D-078
**Next:** 7.2b — Portfolio + Account 360.
**Issues:** —

## Session 27 — 2026-10-07 — HOTFIX: production login broken (PGRST201)
**Symptom:** live site sign-in succeeded (token returned) but the app stayed
on `/login` for everyone — the profile-load query failed with `300 PGRST201`
("more than one relationship was found for 'profiles' and 'organizations'").
**Cause:** 7.1 added `organizations.owner_profile_id → profiles`, giving
`profiles`/`organizations` a second relationship alongside the original
`profiles.org_id → organizations`. `AuthProvider.loadProfile()`'s unqualified
`organizations(...)` embed became ambiguous.
**Built:**
- Fixed the one affected call site: `AuthProvider.tsx` →
  `organizations!profiles_org_id_fkey(...)`. Response key is unchanged
  (`organizations`), so no other code touched.
- Audited every other `.select()` embed in `src/` (2× `profiles→sub_roles`,
  1× `invitations→organizations`) against the full FK graph across every
  migration — all three confirmed single-relationship, left unchanged.
  `supabase/functions/provisioning` has zero embeds — no redeploy needed.
- New `scripts/smoke-login.ts` (committed, env-var credentials, no passwords
  in the repo): signs in as each demo role and runs the exact AuthProvider
  profile query. Added to the session protocol — run it against a fresh
  `db reset` before pushing any session with new migrations.
- CLAUDE.md: new "Supabase / PostgREST queries" coding rule (check for a
  second FK before/after adding one near an existing embed) + the smoke-check
  step in the end-of-session protocol.
**Verified (honest):** fresh local `db reset` (all 17 migrations); smoke check
— all three roles (super_admin, Prism owner, Meridian owner) sign in and load
profile + org cleanly. typecheck/lint/build green.
**Deviations:** none.
**Decisions:** D-068
**Next:** 7.2 — God-mode workspace.
**Issues:** —

## Session 26 — 2026-10-07 — Single environment + push Phase 7.1 to cloud
**Built:** operational session, no new features.
- **D-066 single environment:** Netlify's production branch is now `dev` (user
  switched it) — every push to `dev` deploys. Cloud Supabase
  (`xwtxrdxktbogswxuuetp`) is the only DB until the first customer goes live;
  `main` left alone for go-live. Added to the session protocol: push migrations
  to cloud before pushing code to `dev`, since code now reaches prod the moment
  it's pushed.
- **Pushed the 8 Phase 7.1 migrations to cloud:** `db push --dry-run` first
  (confirmed the pending list was exactly those 8, nothing else), then the real
  push. `migration list` shows all 17 local=remote.
- **D-067 demo data extracted:** `supabase/demo/phase7_demo_data.sql` — the
  Phase 7.1 fictional fixtures, pulled out of `seed.sql`, idempotent, creates
  no auth users. Tried loading it from `seed.sql` via `psql \i`/`\ir` first —
  the Supabase CLI's seed runner doesn't support meta-commands at all (`db
  reset` failed: `syntax error at or near "\\"`); fixed by adding it as a
  second entry in config.toml's `[db.seed].sql_paths` instead. Also redesigned
  attribution to resolve dynamically (`select … from profiles where
  account_type='super_admin' order by created_at limit 1`) instead of a fixed
  demo profile id, and to create its own two fictional org rows if missing —
  both needed because the cloud project has the migrated schema but none of
  the local demo seed's profiles/orgs.
- **Read-only cloud verification** via `supabase db dump --linked`: all 16
  Phase-7 tables, all 14 `*_audit` triggers, and the tightened
  `audit_log_select` policy confirmed present on cloud, matching the design
  exactly. No mutations performed.
- **rls_test.sql checked, not run on cloud:** it is NOT wrapped in a
  rolling-back transaction — a `full_name` change, a 'Prism QA' sub-role row,
  and two "Dedupe test risk" rows all persist. Confirmed unsafe for cloud;
  did not suggest running it there.
- CLAUDE.md: Deployment section rewritten for single-env mode; session
  protocol gained the migrate-before-code-push rule.
**Verified (honest):** db push dry-run matched exactly 8 files; migration list
17/17 in sync; local db reset seeds both files in the new order without error;
full rls_test.sql still green afterward; cloud schema dump confirms every new
table/trigger/policy present.
**Deviations:** demo-data attribution + org-creation design differs from the
original seed.sql fixture (fixed ids) — necessary for cloud-standalone use,
noted in D-067.
**Decisions:** D-066, D-067
**Next:** 7.2 — God-mode workspace. (Optionally: run phase7_demo_data.sql
against cloud via the SQL Editor if demo data on the live site is wanted.)
**Issues:** —

## Session 25 — 2026-10-07 — Phase 7 kickoff: 7.1 Data model v3
**Built:** backend-only CS Hub data model (build-spec-v3 § 5), no UI wiring.
- **Housekeeping:** committed `docs/build-spec-v3.md`; confidentiality grep
  clean; retroactively closed out 6.7 (Netlify + cloud Supabase were already
  live but never logged — D-054); removed the dead `vercel.json`; CLAUDE.md
  reframed as the Refold CS Hub, Deployment target → Netlify, new
  Confidentiality rule (spec § 0).
- **8 append-only migrations:** new enums (org_health, lifecycle_stage,
  deployment_model, project_health, risk_severity, etc. — several status enums
  aren't explicit in the spec, chosen as sensible defaults, flagged inline);
  `segments`/`metric_definitions` lookups (seeded, incl. the § 2.2 EBR catalog);
  `organizations` extended (segment/deployment_model/health/lifecycle_stage/
  owner/data_access_mode/aliases, backfilled — health auto-fills 'active',
  lifecycle defaults 'prospect' for new rows but existing rows explicitly
  backfilled 'live'); `proposals`/`sync_state`/`sync_runs`; `projects` +
  milestones/accomplishments/risks/asks; `escalations`/`tickets`/`engagements`/
  `metric_values`/`portfolio_notes`. Every CS record table carries provenance
  (source/source_ref/created_by/updated_by/verified_at/proposal_id) and a
  per-org `(org_id, source_ref)` dedupe unique index (portfolio_notes has no
  org_id — dedupes on source_ref alone).
- **Generic audit trigger:** one SECURITY DEFINER function
  (`write_audit_log()`), attached to organizations + 13 new tables, reads
  OLD/NEW generically via `to_jsonb` with ONE special case (org_id := id only
  for organizations — a blind id-fallback for every table would have broken
  portfolio_notes/sync_runs, which have no org_id; caught during design, not in
  testing). NOT attached to profiles/sub_roles/invitations/saved_report_configs
  (already manually audited — would double-log) or segments/metric_definitions
  (pure lookups).
- **audit_log hardened:** revoked direct insert/update/delete from
  authenticated + service_role (trigger-only writes now); fixed a real leak —
  tightened `audit_log_select` so an owner can't see Phase-7 CS data via the
  audit trail just because org_id matches (with a backfill so D-046's existing
  owner-visible rows weren't silently dropped).
- **RLS:** every new table is super_admin-only, AAL2 for writes, zero
  customer-role access regardless of org match (D-039 grants to
  authenticated+service_role).
- **Types:** `Account`, `Segment`, `Provenance`, `Project`, `Milestone`,
  `Accomplishment`, `Risk`, `Ask`, `Escalation`, `Ticket`, `Engagement`,
  `MetricDefinition`, `MetricValue`, `PortfolioNote`, `Proposal`, `SyncState`,
  `SyncRun` + all new enums in `src/types/index.ts`.
- **Fixtures:** local-only `seed.sql` additions reusing the two existing
  fictional demo accounts (Prism Analytics, Meridian Laboratories) — projects,
  milestones, accomplishments, risks, an ask, an escalation, tickets,
  engagements, metric values, 2 pending proposals.
**Verified (honest):** `supabase db reset` applies all 17 migrations cleanly;
extended `rls_test.sql` proves AAL1-write rejection, zero customer-role access
across `projects`/`risks`/`tickets`/`escalations` for owner+owner+member, a
complete audit trail (create/update/delete, correct before/after/org_id) for a
super-admin AAL2 CRUD cycle, per-org dedupe rejecting a duplicate source_ref
while the same source_ref in a different org succeeds, and the audit_log
leak-fix (owner sees 0 rows for record_table IN projects/risks). typecheck/
lint/build green (build was unusually slow this session — background/Docker
resource contention, not a code issue; reran clean). Did NOT push to the cloud
project (old CLI token revoked) — 8 migrations ready whenever a fresh token is
available.
**Deviations:** several enum value sets are inferred, not spec-explicit (flagged
inline in the enums migration and in D-062); a few extra integrity constraints
added beyond the literal spec text (tickets/metric_values natural keys,
metric_definitions.sort).
**Decisions:** D-054–D-065
**Next:** 7.2 — God-mode workspace (Portfolio board, Account 360, coverage view).
**Issues:** 8 Phase 7.1 migrations pending a cloud push (need a fresh Supabase
CLI access token — the one used for 6.7 is revoked).

## Session 24 — 2026-07-31 — R2b: feature-flag cluster scope
**Built:** feature flags now work at four scopes — global | cluster | namespace |
org (added `cluster`). Mock/UI only (D-027).
- **Types:** `FlagScope += cluster` (order global, cluster, namespace, org).
- **Panel (no fork):** `FeatureFlagsPanel` props `orgId/orgName` → `scope +
  entityId + entityName`; `useFeatureFlags(scope, entityId)` →
  `fetchFeatureFlags(scope, entityId)`. Scope badge gained a Cluster pill.
- **Mock:** +3 cluster-scoped flags; `fetchFeatureFlags` returns the whole pool
  for `global`, else global + that scope's flags.
- **Affordances (super_admin, D-006):** flag-icon button on each cluster group
  header (NamespaceClusters) + "Edit feature flags" on the namespace detail
  header, each opening the shared panel scoped to that cluster/namespace.
- **Existing triggers** (org-detail button, customer-list flag icon,
  /feature-flags page) updated to pass `scope="org"`/global — behavior unchanged.
**Verified (honest):** tsx unit-check of all four scope fetches (global=10 incl.
3 cluster; cluster/namespace/org = global + own, org no longer leaks namespace/
cluster flags). typecheck/lint/build green. D-017 Save (console diff, no persist)
unchanged. Panel open-per-scope + badges are code-complete + build-verified;
interactive click-through available on the dev server, not headlessly asserted.
**Deviations:** org panel no longer lists namespace flags (moved to the namespace
panel) — intentional under the clean scope model; noted in D-053.
**Decisions:** D-053
**Next:** 6.5 live data layer, or 6.7 one-site Netlify deploy (per user).
**Issues:** —

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