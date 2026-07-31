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
- [ ] R2b — Feature-flag cluster scope (4-scope panel + cluster/namespace affordances; D-053)
- [ ] 6.5 — Live data layer (provider switch; metrics-proxy)
- [ ] 6.6 — QBR export (export-xlsx)
- [ ] 6.7 — Netlify deploy + polish (now ONE site, not three — per R1)

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
Completed: R2a — corrected the on-prem hierarchy to cluster→namespace→org→tenant (build-spec §4 amend; D-049–D-052; mock-only, D-027). New types Cluster (first-class, decommissionable) + NamespaceOrg; OnPremOrgDetail returns clusters; tenants/all metrics re-scoped to the org WITHIN a namespace; NamespaceDetail slimmed to header+env vars. Mock rebuilt as the full nest (5 clusters, 10 namespace-orgs, ≥1 degraded + ≥1 down). NamespaceClusters reworked (per-cluster groups; cluster+namespace decommission via confirm modal → ephemeral status; clickable rows). NamespaceDetailPage = header+Upgrade/Decommission+Organizations list (shared DataTable)+Env Vars; NEW NamespaceOrgDetailPage = 5 DetailTabs at nested :nsOrgId route. StatusBadge gained decommissioned style. Verified: nest via tsx script, typecheck/lint/build green, dev serves 200 (interactive drill-down/decommission click-testable, not headlessly asserted).
Decisions made: D-049, D-050, D-051, D-052
Known issues: — (R2b feature-flag cluster scope still to do; cloud Supabase project URL/keys still user-provided; metrics still mock via external_ref bridge)