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
Completed: Seed/login fix. Diagnosed the admin-portal "Incorrect email or password": the seed is correct (live sign-in for super + cloud returns tokens; users confirmed, aud/role=authenticated) — the real cause is that `supabase start` does NOT re-run seed.sql on a persisted volume, so a stale local db lacks the current demo users. Fix = `supabase db reset` (documented prominently in README). Also hardened the seed with auth.identities rows (robustness/future-proofing; GoTrue v2.193 password login worked without them, but real users always have them). Verified after db reset: super + cloud sign-in via anon client return AAL1 sessions; rls_test green. Prior session: 6.3 portal split.
Decisions made: D-037
Known issues: — (cloud Supabase project URL/keys still to be created by user; metrics still mock via external_ref bridge until 6.5)