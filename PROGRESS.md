# Build progress

## Prompt blocks

- [x] 5.1 — Scaffold and layout shell
- [x] 5.2 — Mock data layer
- [x] 5.3 — God View dashboard (super_admin)
- [x] 5.4 — Customer list pages (cloud + on-prem)
- [x] 5.5 — Cloud org detail (5 tabs)
- [x] 5.6 — On-prem org detail + namespace list
- [x] 5.7 — Namespace detail (6 tabs inc. env vars)
- [x] 5.8 — On-prem customer admin view
- [x] 5.9 — Feature flags slide-over panel
- [x] 5.10 — AI Credits card
- [x] 5.11 — Global search
- [x] 5.12 — Polish pass
- [x] Hotfix — global search crash on first keystroke (Session 14) + route ErrorBoundary

## Phase 6 — re-architecture (docs/build-spec-v2.md)

- [x] 6.1 — Supabase project + schema + RLS
- [x] Phase-0 amendment — nullable org_id on sub_roles + audit_log (D-032)
- [x] 6.2 — Auth + MFA
- [x] 6.3 — Portal split (VITE_PORTAL) — later REVERSED by R1 (D-048)
- [x] Seed/login fix — demo logins require `supabase db reset`; seed adds auth.identities (D-037)
- [x] 6.4 — RBAC + provisioning UI (complete: 6.4a + 6.4b)
- [x] 6.4a — Provisioning engine + super-admin user mgmt (Edge Function, invite-accept, admin UI; D-038–D-042)
- [x] 6.4b — Customer-owner user mgmt + owner-defined sub-roles (+RLS) + owner AAL2 + Phase-0 self-edit lockdown (D-043–D-046)
- [x] R1 — Unify the three portals into one app + single login (reverses 6.3; D-048)
- [x] R2a — On-prem hierarchy cluster→namespace→org→tenant: data model + nesting + decommission (D-049–D-052)
- [x] R2b — Feature-flag cluster scope (4-scope panel + cluster/namespace affordances; D-053)
- [x] 6.5 — folded into 7.5 (Refold platform metrics now arrive via the CS Sync Skill/MCP, not a standalone metrics-proxy; D-061)
- [x] 6.6 — folded into 7.7 (Reports — monthly status report + EBR pack; D-061)
- [x] 6.7 — Netlify deploy (live, one site — retroactively logged D-054); ongoing polish folds into Phase 7 work

## Phase 7 — Refold CS Hub (docs/build-spec-v3.md; docs/product-overview.md)

- [x] 7.1 — Data model v3: migrations (enums, segments/metric_definitions, organizations extend, proposals/sync_state/sync_runs, projects+subtables, account records), RLS, generic audit trigger, provenance/dedupe, TS types, fictional local fixtures (D-055–D-065)
- [x] 7.2a — *Superseded* by the equal-admins model (D-081–D-086) — titles/teams/account_assignments were built, then reversed by the Head of CS. See below.
- [x] 7.2b — Portfolio + Account 360: Portfolio board (the account list, grouped by segment) + coverage tab, Account 360 (6 tabs: Overview/Projects/Escalations/Tickets/Engagements/Metrics), Add account (no invite), inline add/edit/delete, Mark verified, source badges — ScopeSwitcher + saved views wired into Portfolio (D-079)
- [x] 7.3 — Approvals inbox + audit log screen (scoped: My accounts/My team/Everyone): apply_proposal()/reject_proposal() SQL functions (approve actually applies the change via a fixed table allow-list + audits the decision itself), pending-count nav badge, CSV export on the audit log (D-080)
- [x] Equal admins — people simplification (Part 1): `account_roles` (per-account role tag, record-keeping, history) replaces titles/teams/account_assignments/owner_profile_id; `reports_to` (optional, UX-only, cycle-checked); rewritten scope helpers; People directory screen; Portfolio/Account 360 "Add to my accounts"/"Leave account"; nav reorder + collapsed Admin group (D-081–D-086)
- [x] Home (Part 2): personal "my day" — my accounts, needs attention, my reports, recent activity, all scoped
- [ ] Standups (Part 3) + People activity/performance indexes (Part 4) — designed in docs (D-085, Parked), not built; was "Home + per-team Standups + Team (FDE performance)" before the equal-admins reversal
- [ ] 7.4 — Ingest API
- [ ] 7.5 — CS Sync Skill + runner + Refresh (was 6.5)
- [ ] 7.6 — Ask the Hub (chat agent)
- [ ] 7.7 — Reports (monthly status, EBR, QBR — was 6.6)
- [ ] 7.8 — Air-gapped import

## Phase 8 — Lifecycle (planned)
Contacts, POCs, onboarding templates/plans, engagement cadence, project timeline.

## Phase 9 — Knowledge (planned)
Drive-backed documents, knowledge base, Refold member role (read-only internal), global search.

## Phase 10 — Gamification (planned)
Points, streaks, badges, team leaderboards — computed from the audit log + provenance + approvals turnaround; no new tracking needed (D-075).

## Deployment

- [x] vercel.json + SPA routing configured
- [x] Password gate added (placeholder auth)
- [ ] Deployed to Vercel free tier
- [x] .env.example committed

## Version control & docs

- [x] GitHub repo created — Subrat1108/refold-control-plane; URL updated in CLAUDE.md (planning-room instructions still need it)
- [x] dev branch set as default working branch
- [x] CLAUDE.md committed on dev
- [x] CLAUDE.local.md added to .gitignore
- [x] docs/build-spec.md committed (full instruction set, Sections 1–11)
- [x] docs/devlog.md committed
- [x] docs/decisions.md committed

## Last session
(See docs/devlog.md for full session history — this is just the pointer.)

Date: 2026-10-09 (later same day)
Completed: Equal admins — Parts 1–2 only (Standups/People-activity-KPIs
deferred, per the Head of CS's own "ship 1–2, stop, report" instruction).
Reverses 7.2a's hierarchy: no titles, no teams, no RBAC by role. One
migration — guarded drops (confirmed 0 rows on cloud first, read-only) of
account_assignments/teams/team_members/organizations.owner_profile_id/
profiles.title; new account_roles (per-account role tag, record-keeping,
history via ended_at, no DELETE policy) + profiles.reports_to (optional,
cycle-checked); scope helpers rewritten. Edge Function: set_title →
set_reports_to. Frontend: usePeople.ts/useSavedViews.ts replace
useTeamStructure.ts; TeamStructurePage → PeoplePage (/people); Portfolio/
Account 360 get Add-to-my-accounts/Leave-account + live EDL display; nav
reordered with a collapsed Admin group. New Home page (/home): my accounts,
needs attention, my reports, recent activity. Docs (build-spec-v3.md,
product-overview.md) rewritten to the equal-admins model in full.
Verified: fresh db reset; rls_test.sql's new block + all 4 prior blocks
green; smoke-login.ts all 3 roles; typecheck/lint/build green; a throwaway
script exercised set_reports_to (incl. cycle rejection) through the real
Edge Function plus add/end/change-role against the real API.
Cloud: db push --dry-run matched exactly 1 migration (applied cleanly,
proving the 0-row guards held); migration list 28/28 local=remote;
provisioning redeployed (action set changed).
Decisions made: D-081–D-086
Known issues: Standups and People activity/KPIs not built (Parked). No
browser-automation tool available — UI not click-tested interactively.

---

Date: 2026-10-09
Completed: 7.3 — Approvals inbox + audit log screen. `apply_proposal()`/
`reject_proposal()` SQL functions (SECURITY DEFINER, AAL2-gated): approving
a proposal actually applies create/update/delete to the real target table
(one explicit branch per table against a fixed allow-list — milestones,
accomplishments, risks, escalations, tickets, metric_values, organizations
health changes) and audits the decision itself with action='approve'/
'reject' (the generic trigger can't produce that label). `/approvals`
(filterable inbox, field-level diff, approve/edit-then-approve/reject/bulk,
ScopeSwitcher+SavedViewsMenu, pending-count nav badge) and `/audit-log`
(filterable, paginated, CSV export, ScopeSwitcher). One migration (the two
functions — no new tables, proposals/audit_log already had everything).
3 local-only fixture proposals added (update/delete) alongside 7.1's
existing 2 (create), so every operation type is exercisable.
Verified: fresh db reset; rls_test.sql all 5 blocks PASS (new block: AAL1/
non-super-admin rejected, approve actually mutates + audits, reject leaves
the target table untouched + audits, a disallowed target_table raises,
customer roles see 0 proposals); smoke-login.ts all 3 roles PASS; typecheck/
lint (0 errors)/build green. A throwaway script exercised approve/
edit-then-approve (confirmed the override payload wins, not the original)/
reject/bulk against the real AAL2-protected API, confirmed the pending
count drops to 0 and audit_log shows the right approve/reject counts.
Cloud: db push --dry-run matched exactly 1 migration; migration list
27/27 local=remote; no Edge Function changes this block.
Decisions made: D-080
Known issues: same no-browser-automation-tool gap as 7.2b — UI not
click-tested interactively, verified at the API/RLS/schema layer instead.
Approvals inbox will stay thin on real data until 7.5/7.6/7.8 ship actual
proposal producers.

---

Date: 2026-10-08 (later same day)
Completed: 7.2b — Portfolio + Account 360. Portfolio board (grouped by
segment, filters, Add account with no invite, key milestones/recommendations)
+ coverage tab (7-section current/stale/missing matrix); Account 360 with 6
tabs (Overview incl. change-health-with-reason + mark-verified; Projects with
nested milestones/accomplishments/risks/asks + the project_members
assignment UI deferred from 7.2a; Escalations; Tickets; Engagements; Metrics),
every row carrying a SourceBadge. One migration (organizations gained
health_reason/verified_at/updated_by — the one real schema gap found during
planning; D-079). Everything else (projects, milestones, escalations,
tickets, engagements, metric_values, portfolio_notes) was already-shipped
7.1 schema — this block is UI + hooks only.
Verified: fresh db reset; rls_test.sql all 4 blocks PASS (new 7.2b block
checks the organizations AAL2 gate on the new columns + customer-role
zero-rows on the account-record tables not yet individually asserted);
smoke-login.ts all 3 roles PASS; typecheck/lint (0 errors)/build all green;
a throwaway script exercised every CRUD path in usePortfolio.ts against the
real AAL2-protected API (account/project/milestone/accomplishment/risk/
ask/escalation/ticket/engagement/metric-value/portfolio-note writes, plus
confirming the generic audit trigger fires) — all passed. No browser-
automation tool is available in this environment, so the UI itself was not
click-tested end-to-end; this is flagged rather than claimed.
Cloud: db push --dry-run matched exactly 1 migration; migration list 26/26
local=remote; no Edge Function changes this block, so no redeploy needed.
Decisions made: D-079
Known issues: cross-account "Projects" screen and the "Accounts" nav item
(distinct from Portfolio's board) are deferred — see D-079. "Pending
approval" never appears in the coverage matrix yet (needs 7.3's proposals).
No interactive browser verification (tooling gap, not a known defect).

---

Date: 2026-10-08
Completed: 7.2a — people, teams, assignments, scoped views (titles; teams/
team_members; account_assignments + derived owner_profile_id; project_members
replacing projects.fdes/edl_profile_id via a guarded drop; saved_views; 8
scope-helper functions; Team Structure screen with ScopeSwitcher +
SavedViewsMenu). During verification, found and fixed a real regression from
last session's audit_log hardening (D-064): service_role had silently lost
`insert` on audit_log, and separately `writeAudit()` was still writing dead
pre-7.1 column names — both broke every manual Edge Function audit write
(not just the new set_title action). Fixed via an 8th migration + a
writeAudit() fix, logged as D-078.
Verified: fresh db reset; rls_test.sql all 3 blocks PASS; a 6-check set_title
script PASS including the audit row; smoke-login.ts all 3 roles PASS;
typecheck/lint (0 errors)/build all green. Cloud: read-only fdes/
edl_profile_id count confirmed 0 rows before pushing; db push --dry-run
matched exactly 8 migrations; migration list 25/25 local=remote; provisioning
Edge Function redeployed.
Decisions made: D-069–D-078
Known issues: none outstanding. Project-members assignment UI intentionally
deferred to 7.2b (D-077).