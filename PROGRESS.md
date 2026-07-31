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
- [x] 6.4a — Provisioning engine + super-admin user mgmt (Edge Function, invite-accept, admin UI; D-038–D-042)
- [ ] 6.4b — Customer-owner user mgmt + owner-defined sub-roles (+RLS) + owner AAL2 step-up
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
Completed: 6.4a — Provisioning engine + super-admin user management. Built the `provisioning` Edge Function (sole service-role holder; self-verifies super_admin + AAL2 before every action: provision_org, invite_super_admin, assign_sub_role, set_user_status, accept_invite; audit_log on each). Added a service_role GRANTs migration (D-039). Invite-accept flow (`/accept-invite` top-level page). Admin UI: SuperAdminsPage (`/admin-users`) + AddCustomer/PendingInvites on the customer pages. Verified locally: authz rejections (401/403), AAL2 success paths, Mailpit invite, full accept→active→sign-in, disable/enable/assign; typecheck/lint/build green ×3, no service-role key in bundles, rls_test green after reset.
Decisions made: D-038, D-039, D-040, D-041, D-042
Known issues: — (cloud Supabase project URL/keys still user-provided; provisioned orgs not yet in mock customer lists — shown via pending-invites panel until 6.5; metrics still mock via external_ref bridge)