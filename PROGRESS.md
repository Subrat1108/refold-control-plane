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
- [x] 6.3 — Portal split (VITE_PORTAL)
- [x] Seed/login fix — demo logins require `supabase db reset`; seed adds auth.identities (D-037)
- [x] 6.4 — RBAC + provisioning UI (complete: 6.4a + 6.4b)
- [x] 6.4a — Provisioning engine + super-admin user mgmt (Edge Function, invite-accept, admin UI; D-038–D-042)
- [x] 6.4b — Customer-owner user mgmt + owner-defined sub-roles (+RLS) + owner AAL2 + Phase-0 self-edit lockdown (D-043–D-046)
- [ ] 6.5 — Live data layer (provider switch; metrics-proxy)
- [ ] 6.6 — QBR export (export-xlsx)
- [ ] 6.7 — Netlify deploy + polish

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

Date: 2026-07-31
Completed: 6.4b — customer-owner user management + owner-defined sub-roles + owner AAL2, plus a Phase-0 security fix. Phase 0 (D-043): profiles self-edit locked down via column-level UPDATE grant (only full_name), closing the self-escalation path. Edge Function owner lane (D-044, no fork): owner_invite_user/owner_assign_sub_role/owner_set_user_status — own-org + own-type + AAL2, audit w/ org_id. Owner sub-role RLS (D-045): current_account_type() helper + sub_roles_owner_insert/update policies; owners write via direct RLS-gated client. Owner AAL2 (D-046): needsMfa now covers owners. OrgUsersPage (`/users`, owner-gated) in cloud+onprem portals. Verified: rls_test ALL PASSED (self-escalation denied, owner sub-role org-scoping); owner-lane suite 14/14 (AAL1/member/cross-org/wrong-type/self-disable rejections; own-org actions + accept→active); typecheck/lint/build green ×3; no service-role key in bundles.
Also (same day) hotfix D-047: MFA enrollment stuck at "Preparing MFA…" (422) — StrictMode double-enroll orphaned an unverified TOTP factor; enrollTotp() now cleans up stale unverified factors + MfaStepUp prepare runs once per mount.
Decisions made: D-043, D-044, D-045, D-046, D-047
Known issues: — (cloud Supabase project URL/keys still user-provided; provisioned orgs shown via pending-invites panel until 6.5; metrics still mock via external_ref bridge)