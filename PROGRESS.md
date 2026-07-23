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
- [ ] 5.12 — Polish pass

## Deployment

- [x] vercel.json + SPA routing configured
- [ ] Password gate added (placeholder auth)
- [ ] Deployed to Vercel free tier
- [ ] .env.example committed

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

Date: 2026-07-23
Completed: 5.11 — Global search. Fleshed out SearchDropdown (super_admin topbar) into grouped global search (Organizations/Namespaces/Connectors, 3 per group, icons, breadcrumbs, keyboard nav, outside-click/Escape close). Reshaped searchAll → grouped SearchResults incl. connectors; connector/tab deep-link via ?tab=. Kept onSearch filter-input mode for customer-list pages.
Decisions made: D-020, D-021
Known issues: —