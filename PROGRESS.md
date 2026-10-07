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

## Phase 7 — Refold CS Hub (docs/build-spec-v3.md)

- [x] 7.1 — Data model v3: migrations (enums, segments/metric_definitions, organizations extend, proposals/sync_state/sync_runs, projects+subtables, account records), RLS, generic audit trigger, provenance/dedupe, TS types, fictional local fixtures (D-055–D-065)
- [ ] 7.2 — God-mode workspace (Portfolio board, Account 360, coverage view)
- [ ] 7.3 — Approvals inbox + audit log screen
- [ ] 7.4 — Ingest API
- [ ] 7.5 — CS Sync Skill + runner + Refresh (was 6.5)
- [ ] 7.6 — Chat agent
- [ ] 7.7 — Reports (was 6.6)
- [ ] 7.8 — Air-gapped import

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

Date: 2026-10-07 (later same day)
Completed: Single-environment switch (D-066) — Netlify's production branch is now `dev` (user-switched), and the cloud Supabase project is the only database until the first customer goes live; `main` left as-is for go-live. Pushed the 8 Phase 7.1 migrations to cloud (db push, confirmed exactly those 8 pending via --dry-run first) — `migration list` now shows all 17 migrations matching local/remote. Extracted the Phase-7 fictional fixtures out of seed.sql into a standalone, idempotent `supabase/demo/phase7_demo_data.sql` (D-067) — creates no auth users, resolves attribution dynamically to whichever super_admin profile exists (not a fixed demo id) so it also works standalone on the cloud SQL Editor; loaded locally via config.toml's `sql_paths` (a `psql \i` include was tried first and does NOT work with the CLI's seed runner — fixed). Read-only cloud verification via `supabase db dump`: all 16 Phase-7 tables, all 14 audit triggers, and the tightened `audit_log_select` RLS policy confirmed present on cloud, byte-for-byte matching what was designed. Checked `rls_test.sql`: it is NOT wrapped in a rolling-back transaction (several writes persist), so it must never be run against the cloud project — flagged, not run there. Updated CLAUDE.md's Deployment section + session protocol (push migrations before code, since dev now auto-deploys).
Verified: db push dry-run matched exactly the 8 expected files; migration list shows 17/17 local=remote; local db reset seeds both files cleanly in the new two-file order; full rls_test.sql still green after the seed restructuring; cloud schema dump (read-only) confirms every new table/trigger/policy.
Decisions made: D-066, D-067
Known issues: none outstanding from this session. demo data NOT yet run against cloud — the user runs supabase/demo/phase7_demo_data.sql in the SQL Editor if/when they want sample data on the live site.