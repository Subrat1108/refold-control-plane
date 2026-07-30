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
- [ ] 6.3 — Portal split (VITE_PORTAL)
- [ ] 6.4 — RBAC + provisioning UI
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

Date: 2026-07-30
Completed: Phase-0 amendment (D-032, nullable org_id on sub_roles+audit_log, new migration + RLS + extended rls_test) and 6.2 — Auth + MFA. Supabase browser client (src/lib/supabase.ts); SupabaseAuthProvider loads session+profile+AAL and re-implements useAuth() compat shape (D-033); real email+password /login; TOTP MFA enroll/challenge with AAL2 step-up enforced for super_admin (D-034, RequireAuth→MfaStepUp). Removed dev role-switcher (D-002/D-026) + placeholder password gate (D-023/D-031); deleted AuthContext/AuthGateContext/useAuthGate. Verified end-to-end on local stack (cloud owner aal1 + RLS isolation; super_admin aal1→TOTP→aal2). typecheck/lint/build green.
Decisions made: D-032, D-033, D-034
Known issues: — (cloud Supabase project URL/keys still to be created by user; metrics still mock via external_ref bridge until 6.5)