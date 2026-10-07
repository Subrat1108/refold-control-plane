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

Date: 2026-10-07
Completed: Phase 7 kickoff — 7.1 Data model v3 (backend only, no UI). Product re-scoped to the Refold CS Hub (super-admin only; customer portals frozen; D-055). 8 append-only migrations: new enums; `segments`/`metric_definitions` lookups (seeded); `organizations` extended (segment/deployment_model/health/lifecycle_stage/owner/data_access_mode/aliases, backfilled); `proposals`/`sync_state`/`sync_runs`; `projects`+milestones/accomplishments/risks/asks; `escalations`/`tickets`/`engagements`/`metric_values`/`portfolio_notes` — every CS record table carries provenance (source/source_ref/created_by/updated_by/verified_at/proposal_id) and a per-org `source_ref` dedupe key. One generic SECURITY DEFINER audit trigger (`write_audit_log()`) attached to organizations + all 13 new tables, firing for both authenticated and service_role writes. Hardened `audit_log`: revoked direct insert/update/delete (trigger-only writes now) and fixed a real leak — tightened `audit_log_select` so a customer owner can no longer see Phase-7 CS data via the audit trail (with a backfill so existing owner-visible rows weren't silently lost). RLS on every new table: super_admin-only, AAL2 for writes, zero customer-role access (not just org-scoped — none). New TS types (`Account`, `Project`, `Risk`, `Proposal`, etc.) in `src/types/index.ts`. Local fictional fixtures (reusing Prism Analytics/Meridian Laboratories) for 7.2/7.3. Also retroactively closed out 6.7 (Netlify + cloud Supabase deploy, which had shipped without ever being logged) and removed the dead `vercel.json`.
Verified: `supabase db reset` applies cleanly (all 17 migrations); extended `rls_test.sql` proves AAL1-write rejection, zero customer-role access across new tables, full audit trail (create/update/delete with correct before/after/org_id), per-org dedupe + cross-org independence, and the audit_log leak-fix — all passing locally. typecheck/lint/build green. Did NOT push migrations to the cloud project this session (old CLI token revoked) — see Known issues.
Decisions made: D-054–D-065
Known issues: 8 new local migrations (20261007000001–008) are ready to push to the cloud project but have NOT been pushed — the Supabase CLI access token used for the 6.7 deploy was revoked/rotated; a fresh token is needed before `supabase db push`. Cloud Supabase project URL/keys still user-provided for local dev.