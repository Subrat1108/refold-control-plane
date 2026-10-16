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
- [x] Home + Standups + People activity (Parts 2–4): Home (personal "my day" — my accounts, needs attention, my reports, recent activity, all scoped); Standups (anyone hosts, standups/standup_entries/action_items, host-can-edit-any RLS, remembered participant set via saved_views, deterministic "since last standup" draft, live mode, blocker→ask/action-item); People activity (role history, recent activity, open action items, recent standup entries on the existing People directory) (D-087–D-090). Performance indexes/KPIs stay deferred — the data they need (account_roles history, project_members, audit actor, approvals, standups) is confirmed fully captured.
- [x] 7.4 — Ingest API: `ingest_tokens` table (select super-admin-only, no client insert/update), `create_ingest_token`/`revoke_ingest_token` provisioning actions, new `ingest` Edge Function (bearer-token auth, verify_jwt disabled, upsert/dedupe decision tree, race-safe via partial unique index), Ingest Tokens admin screen
- [ ] 7.5 — CS Sync Skill + runner + Refresh (was 6.5). **7.5-pre done** (D-097–D-099): Refold MCP connection confirmed and the `cs-sync` skill finalized against the real server (`skills/cs-sync/`, `docs/refold-mcp.md`) — connected live, confirmed the agent-mode `RESOLVE_ACTIONS`/`EXECUTE_ACTION` contract, real action IDs/schema enums filled in, health-dedupe tested against local ingest. Four real connection/app-admin gaps found (not code issues): Zendesk/Gmail not connected for the `cs-hub` linked account, Slack's bot is not in any channel, `search_messages` is structurally unavailable (bot vs. user token), and zero Refold workflows exist (blocks `metric` entirely). **7.5-pre2 Sessions 1–2 of 6 done.** Session 1 (D-100–D-103): accounts/tenants are the only truth — `tenants` + `account_sources` tables (supersede `aliases` for matching), `dormant` lifecycle value, `tenant_id` on 9 record tables, `apply_proposal()`/`ingest` updated, Account 360 sources panel. Session 2 (D-104–D-107): "account match needed" — `held` proposal status + `account_resolution` meta-proposals, the `ingest` dedupe tree extracted to `supabase/functions/_shared/dedupe.ts` (shared with the new release path), a pinned Approvals-inbox section with all 4 resolution decisions (map to existing / map as tenant / create new account / ignore), `sync_learnings` pulled forward minimally for the ignore-list + alias-map audit trail. **Order changed (D-108):** Session 4 (skill realignment + new record types) → Session 5 (runner) → first real sync → Session 3 (learning loop proper) → Session 6 (context-store bootstrap) — the learning loop needs real approval decisions to learn from, which don't exist until 4/5 ship and a real sync runs. **Session 4 of 6 done** (D-109–D-113): `action_item`/`engagement` record types wired end to end (`ingest`, `apply_proposal()`, `_shared/dedupe.ts`, schema/docs); `skills/cs-sync/` fully revised against the real daily-CS-workflow rules + live Slack-connector discovery (user-token + custom-app support confirmed, `search:read` scope gap found); `refold-skill.md` regenerated for Refold → MCP → CS Hub → Skills. Early real-data check against Fireflies (local-only, reset after) validated the resolution path against real transcripts and surfaced one skill rule (skip meetings with no identifiable customer domain). **Session 5 of 6 done** (D-114–D-121): the sync runner. New `cs-sync-runner` Edge Function — reuses 7.1's previously-unwired `sync_runs`/`sync_state`; new `sync_settings`/`sync_queue` + 6 SQL functions; `pg_cron`/`pg_net` (5-minute tick, Vault-authenticated dispatch). Builds the sync context, runs `skill.md` as an Anthropic tool-use agent (session-token/MCP for `RESOLVE_ACTIONS`, deterministic REST for `EXECUTE_ACTION`), proxying every tool call so a non-read-only call is rejected server-side before reaching Refold. Validates output, posts to `ingest`. Scoped (Refresh) runs synchronously; daily/backfill fan out one unit per invocation via the queue. New Action Items tab on Account 360 (nowhere else for its Refresh button to live), a shared `RefreshButton` wired into every CS-sync section, and a new `/sync-status` admin screen. Kill switch set ON on cloud immediately after shipping, so the new cron tick can't autonomously enqueue anything — the user flips it off and runs the first real sync themselves, per their explicit instruction. Five Edge Function secrets + one Vault secret remain unset on cloud (confirmed via `supabase secrets list`). **Session 6 of 6 done** (D-124–D-127): the discovery sweep — a `record_type='discovery'` run tied to no account, carried on the internal org's `sync_state` slot, that finds companies nobody added and files them through the existing held/`account_resolution` path (no change to `ingest`, `apply_proposal()`, `_shared/dedupe.ts` or the resolution UI). Live-verified against real Fireflies into LOCAL ingest only: 14 records across 8 companies not in the Hub. **Two fix sessions, 2026-10-12** (`0acfe02`, `ce5ff75`, `2fca4b6`): Slack user-token custom actions wired so **all four connectors are live**; four causes of a 2M-token zero-record production run fixed (stale "known gaps" skill text that stopped the agent trying three working connectors, a 36500-day default lookback, a dead token cap, a wrong channel pattern); the two sync buttons collapsed into one "Run sync now" with a definable day range, default 7. **Session 7 done, 2026-10-14** (D-131–D-134): discovery first + a budget that stops dead accounts — `sync_queue.priority` and a total claim order (the sweep had never once been claimed in 17 runs, because one `enqueue_all_units` call stamps every row with the same `enqueued_at` and the claim had no tiebreak); a real token cap (per-call tool-result truncation + next-turn projection, after a 150k cap produced 412k runs); `account_sync_health` + a 25k probe budget for accounts finding nothing, with a `health` **proposal** at 30 empty nights; a resolved account queued for its full pass immediately. **The first real syncs have now run and produced nothing** — 17 runs, 3,466,170 tokens, 0 proposals — because the two cloud accounts have **0 `account_sources`** between them. Remaining: an account with sources mapped (or a sweep run) to get a first real result, then Session 3 (learning loop), then the context-store bootstrap.
- [ ] **Production-readiness track** (owner-directed, 2026-10-16; supersedes parts of 7.2b/7.3 UI). **Stage 1 done** (D-146–D-148): Approvals is one list with one card design — every pending item renders identically whether or not it has an account, leading with the record and its evidence rather than an opaque identifier; records sharing an unrecognised name are decided together ("apply to all N"); accounts and tenants are creatable inline using the real Add-account form; the milestone "needs a project" dead end now offers to create the project and retry. New `AccountTenantPicker` + `useAccountTree()` replace every flat account select. **Hierarchy settled** (D-149): account → tenant, two levels — a tenant is one signup = one Refold org/workspace; cloud accounts have none; cluster/namespace are identification columns (`cluster_name`, `namespace_name`, `refold_org_id`, `linked_account_id`), NOT tiers, so the planned `namespaces` table is cancelled. **Stage 2 next**: one merged page per account and tenant (absorbing the cloud/on-prem customer pages), on-prem cluster → namespace grouping, "Add details" + file upload, and retiring the 770-line `useMockData.ts`. **Stage 3**: nav/settings restructure (Home · Portfolio · Approvals · Standups · Audit log · Settings).
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

Date: 2026-10-16
Completed: Session 55 — made the documentation protocol enforceable (D-150).
The owner should not have to ask whether docs were updated; they had to
twice. `npm run docs:check` now fails when devlog/CLAUDE.md/PROGRESS.md
disagree about the latest session or the devlog cites a missing D- id, and
`npm run verify` bundles it with typecheck/lint/build. The end-of-session
protocol was rewritten to 11 explicit unprompted steps and gained
build-spec-v3/product-overview updates, Edge Function redeploys, and the
e2e `--env-file` requirement.
Session 54 — Stage 2a: `/accounts/:orgId` gained a Deployment tab absorbing
the old cloud/on-prem customer pages (shape, tenants grouped by cluster,
honest empty state for metrics — no mock numbers ported);
`CustomerDetailRedirect` folds old super-admin links in while leaving the
frozen customer portals alone. All 12 accounts given an explicit deployment
shape: Kantata split into Kantata Engg + Kantata PS (6 tenants), Naehas 6
tenants across two clusters, Octave/Movius/zycus on-prem air-gapped.
Could NOT work the Approvals backlog as asked: provisioning needs a real
AAL2 session and raw SQL would bypass the one write pipeline; pre-created
the six accounts the sweep found instead so each resolution is a pick.

Earlier the same day: Production-readiness Stage 1 (Sessions 50–52) and the hierarchy
settled (Session 53). Approvals: one list, one card design for every pending
item attributed or not, leading with the record and its evidence — an opaque
`zendesk-org:24623057340828` was in fact "Calendly Auth Issue", and that
context had been in the database unshown. Records sharing an unrecognised
identifier are decided together via "apply to all N"; accounts and tenants
are creatable inline with the real Add-account form; the milestone "needs a
project" refusal now offers "Create project 'X' and file it" and retries.
Two bugs of my own caught by the owner and fixed: duplicate components left
by successive patches (file reset and reapplied in one pass), and tenant
creation gated on `deployment_model` — a field only 1 of 10 accounts has set,
which left one selectable parent and made the feature unusable (D-148: never
gate a capability on a field nobody fills in).
Hierarchy (D-149): account → tenant, two levels. A tenant is one signup =
one Refold org/workspace. Cloud accounts have no tenants (their customers are
Refold linked accounts the Hub deliberately ignores); dedicated-cluster and
on-prem accounts have one per signup. Cluster and namespace are
identification columns on a tenant, not tiers — the planned `namespaces`
table is cancelled and Stage 2 is smaller for it. Three competing models and
a collision on the word "org" (the ACCOUNT here vs a Refold workspace) are
now resolved in build-spec-v3 § 2.0.
Verified: 16 RLS blocks; smoke-login; e2e extended for the unified card, the
inline account form and real tenant creation; typecheck/lint/build.
Cloud: 3 migrations pushed (dedicated_cluster enum, tenant identification);
cs-sync-runner + provisioning redeployed earlier in the week.
Decisions made: D-146–D-149
Known issues: account deployment models mostly unset (Kantata stored as
cloud despite being a dedicated cluster) — Stage 2's views read that field.
Kill switch ON, 30 units queued.

---

Date: 2026-10-14 (later same day)
Completed: Docs only — corrected the planning room's status, which was four
sessions stale and whose headline claim was inverted (it said no real sync
had run and the kill switch was on). Verified against cloud: 17 runs,
3,466,170 tokens, 0 proposals, 0 discovery runs, kill switch OFF, all five
Edge Function secrets set on 12 Oct, all four connectors live. CLAUDE.md
carried the contradiction internally — a Blockers line saying the switch was
off sat directly above a D-120 Known-issues line saying it was on. Found the
actual reason 17 runs produced nothing, which is none of the things Sessions
5-7 fixed: `account_sources` on cloud is EMPTY, so the two accounts are bare
organizations rows with nothing mapping them to a Slack channel, email
domain or Zendesk org (D-136). Also corrected a number reported earlier the
same day: 2.67M was the latest 12 runs; across all 17 it is 3.47M.
Decisions made: D-135, D-136
Known issues: "run a manual Refresh on an account you know" will still find
nothing until that account has sources mapped; the discovery sweep needs
none and is now claimed first.

---

Date: 2026-10-14
Completed: 7.5-pre2 Session 7 — discovery first, and a budget that stops
dead accounts. Four production runs had cost 2.67M tokens for zero records,
all of it spent hunting two fictional fixture accounts; deleting them was
explicitly rejected, so the fix is systemic. Root cause was worse than
expected (D-131): the sweep was not merely enqueued last — one
enqueue_all_units call stamps every row with the SAME enqueued_at (now() is
transaction-stable) and the claim ordered by it with no tiebreak, so claim
order was heap order and the sweep was never claimed once in 17 runs. Added
sync_queue.priority (0 = sweep, 50 = an account a human just confirmed,
100 = routine, 100+n for accounts finding nothing) and a total claim order.
Token cap made real (D-132): it was only checked between turns, and tool
results entered the conversation untruncated where the whole array is
re-sent each turn — so a 150k cap produced 412k runs. Results are now
truncated per call (longest array cut, JSON stays parseable, with a note
telling the model to narrow rather than page) and the next turn's cost is
projected before it is issued. Probe budget + risk flag (D-133): new
account_sync_health counts consecutive empty NIGHTS per account (once per
nightly cycle, not per unit; any find resets it); an account at 1+ empty
nights is scanned on probe_token_budget (25k) instead of 150k and returns
to full the moment it produces a record; at 30 nights the runner files a
`health` PROPOSAL (risk + reason) rather than writing organizations.health
directly, so it can never silently overwrite a human's rating. Surfaced on
Account 360 from 3 nights and in a new "Accounts not producing data" table
on /sync-status. Resolving an account_resolution now queues that account's
full pass immediately. Re-association on account approval needed no code
(D-134) — already built; asserted directly for the first time.
Verified: fresh db reset; rls_test.sql new ACCOUNT SYNC HEALTH block + all
12 prior green; a 6-case unit test of the truncation helper (which caught
two real bugs before anything was built on it); a 13-check stub-mode script
against the real local Edge Function; a 12-check re-association script;
smoke-login all 3 roles; npm run e2e green (extended); typecheck/lint/build
green.
Cloud: db push --dry-run matched exactly 1 migration; migration list 43/43
local=remote; cs-sync-runner + provisioning redeployed; the one already-
queued discovery unit promoted to priority 0.
Decisions made: D-131–D-134
Known issues: kill switch is OFF on cloud (the owner turned it off to run
their own syncs) with 15 units queued from 2026-10-12 — they drain
sweep-first now. Whether the 150k full cap should come down is a judgement
to make after the first run that actually finds something.

---

Date: 2026-10-12 (later same day)
Completed: 7.5-pre2 Session 6 — the discovery sweep, closing a real gap the
session owner spotted: the runner only ever synced accounts that already
existed, so a conversation with a company nobody added to the Hub was
invisible. New `record_type='discovery'` sweep, tied to no account, carried
on the internal org's unused sync_state slot (so it inherits the existing
lock/watermark/run-recording with no schema change). It gets the whole
account roster instead of one unit, skips anything already attributable,
and emits the rest with a best-guess identifier — landing on ingest's
existing held/account_resolution path, so "Account match needed" (including
*Create new account*) handles it with NO change to ingest,
apply_proposal(), _shared/dedupe.ts or the resolution UI. Selection rules
are configurable settings (internal_email_domains,
discovery_channel_patterns); Slack counts a channel if it's externally
shared OR named like `internal-<customer>`, per the owner's call. Triggered
by a "Scan for unknown accounts" button on /sync-status (synchronous — no
queue, no Vault secret needed) and once a day by enqueue_daily_sync().
The delete/reset tooling originally asked for was dropped — the owner
deferred it.
Getting it working took seven fixes that only live runs could surface
(D-125/D-126): the runner logged nothing (a Session 5 requirement never
implemented) so a sweep reporting nothing was undiagnosable; the agent's
`skipped` list was discarded rather than kept; RESOLVE_ACTIONS was removed
as actively harmful (it under-reported, omitting `httprequest`, so the
agent concluded Fireflies couldn't be listed by date and gave up having
fetched nothing — its own skipped-reason said so); Slack was treated as
usable because it reports connected:true despite being unreadable; and
three changes for the ~150s Edge Function wall — a self-watching deadline
that finalises with tools withdrawn, an explicit examine-budget, and a
separate faster model for sweeps (CS_SYNC_DISCOVERY_MODEL, default
haiku-5.5) since Sonnet couldn't finish one at all. Plus forced JSON mode
on finalising turns after a completed sweep replied with 8KB of prose.
Verified: 11-check stub suite (unknown company held, two records → exactly
one resolution, re-run idempotent, kill switch); rls_test.sql 12/12 blocks;
smoke-login; npm run e2e (extended for the scan button); typecheck/lint/
build. **Live-verified** against real Fireflies data into LOCAL ingest only
(db reset immediately after, nothing real committed): ~56 items examined,
14 records — 9 engagements, 5 action items — across 8 companies not in the
Hub, 18/18 held records linked to their resolution, and 42 sound skips (34
internal/not-a-customer).
Cloud: 2 migrations pushed, 40/40 local=remote; cs-sync-runner and
provisioning redeployed. Kill switch still ON; no production sync run.
Decisions made: D-124–D-127
Known issues: two test-procedure traps hit this session — rls_test.sql
leaves fixtures (incl. a deliberately-invalid `profiles` proposal) that
break a later e2e on the same DB, so always reset between them; and a run
killed mid-flight holds its unit lock for the full 15-minute TTL, with
retries only saying "already running". The `candidates` field on
resolutions came back empty throughout the live run — expected with only
two fictional accounts present, but effectively untested.

---

Date: 2026-10-12
Completed: Switched the sync runner's LLM provider from the Anthropic API
to OpenRouter (D-122), at the session owner's request. Verified the key
against OpenRouter's own `/auth/key` endpoint before touching code (valid,
paid, $246.53 remaining). `anthropic.ts` → `llm.ts`, rewritten for the
OpenAI-compatible chat/completions contract — this is not a credential
swap: system prompt as a message, OpenAI function-format tools,
`tool_calls[]` with JSON-string `arguments`, `finish_reason ===
'tool_calls'`, `{role:'tool'}` result messages, `prompt_tokens`/
`completion_tokens`. `OPENROUTER_API_KEY` replaces `ANTHROPIC_API_KEY` and
is now set on cloud; `CS_SYNC_MODEL` defaults to `anthropic/claude-sonnet-5`.
Nothing outside `llm.ts` changed. One real bug caught by the live test:
an em-dash in the `X-Title` header threw at `fetch` (header values are
latin-1 only — D-123).
Verified: 11-check live round trip against the real OpenRouter API (forced
tool call → tool result → final text turn, ~1.3k tokens) — the first time
the runner's agent loop has been proven against a real model at all;
fresh db reset; `npm run e2e` green (stub mode, never calls OpenRouter);
typecheck/lint/build green. `cs-sync-runner` redeployed.
Decisions made: D-122, D-123
Known issues: the OpenRouter key was handed over in plaintext in a chat
transcript — parked for rotation before go-live. Still unset on cloud:
`REFOLD_API_KEY`, `REFOLD_LINKED_ACCOUNT_ID`, `REFOLD_MCP_SERVER_ID`,
`CS_HUB_INGEST_TOKEN`, and the `cs_sync_runner_auth` Vault secret. Kill
switch is still ON — no real sync has been run.

---

Date: 2026-10-11 (still later same day)
Completed: Pre-session fix: SKILL.md's domain-only Fireflies skip rule was
too blunt (most customer decisions surface in internally-attended
meetings) — revised to attribute via a participant email domain OR a
named account/tenant mention, skipping only when neither finds anything
(D-114). 7.5-pre2 Session 5 of 6 — the sync runner. New `cs-sync-runner`
Edge Function, the first real caller of the `cs-sync` skill. Found and
reused 7.1's `sync_runs`/`sync_state` tables — defined back then but never
actually driven by any code until now (D-115); new `sync_settings`
(singleton kill switch/cron-time/caps row) and `sync_queue` (daily/
backfill fan-out); 6 new SECURITY DEFINER functions (lock/watermark/
queue-claim/enqueue-daily/enqueue-backfill/dispatch) plus `get_enum_values`
so the sync context's `allowed_values` reads live from Postgres instead of
a hand-copied list. `pg_cron`/`pg_net` enabled — one job ticks every 5
minutes (not at the scheduled time directly, so the admin screen can
change it with a plain UPDATE); dispatch authenticates to the Edge
Function via a Postgres Vault secret holding the service-role key (set
once by hand against cloud, per the session owner's explicit go-ahead on
that approach).
The runner builds the sync context per SKILL.md's contract, runs the
skill as an Anthropic tool-use agent — a cached session token for
`RESOLVE_ACTIONS` (the one agent-mode-only MCP tool with no deterministic
equivalent), the deterministic REST execute path for `EXECUTE_ACTION`
itself once a call is resolved (D-116) — proxying every tool call through
a server-side allowlist (`allowlist.ts`) that rejects a non-read-only
`httprequest` call (a Fireflies mutation, a non-GET Zendesk call) BEFORE
it ever reaches Refold; this is why the runner doesn't hand the model
Anthropic's built-in MCP connector directly. Output is validated
(`validate.ts`, reusing `_shared/dedupe.ts`'s existing `REQUIRED_FIELDS`
instead of a new JSON-Schema dependency — D-117) with one repair attempt,
then posted to local `ingest`. Scoped (Refresh button) runs synchronously
and return the result directly; daily/backfill runs fan out through
`sync_queue`, one unit per Edge Function invocation. Two new `provisioning`
actions (`update_sync_settings`, `enqueue_backfill`). Model id corrected to
`claude-sonnet-5` (the instruction's `claude-sonnet-5-5` isn't real — D-118).
Frontend: a new read-only Action Items tab on Account 360 (its Refresh
button had nowhere else to live — D-119), a shared `RefreshButton`
component wired into Escalations/Tickets/Projects/Engagements/Action
items/Metrics/health plus a header "refresh everything" button, and a new
`/sync-status` admin screen (recent runs, settings form, backfill trigger).
Two real bugs found and fixed while verifying: a default-privilege rule on
this project grants table/function access directly to `anon`/
`authenticated`, not just `public` — every `revoke ... from public` in the
new migration now also names `anon, authenticated` explicitly (D-121); and
the stub-mode e2e fixture's nonsense `account` value was inflating the
"Account match needed" count a later part of the same e2e test depends on
being exactly 4 — fixed by pointing it at a real seeded account, and
separately seeded a fixed local-only ingest token (same fixture category
as the seeded TOTP factor) so stub-mode testing stops needing a fresh
token minted by hand after every `db reset`.
Verified: fresh db reset; rls_test.sql new block ("SYNC RUNNER") + all 10
prior blocks green; smoke-login all 3 roles; a throwaway stub-mode script
(17 checks: happy path, repair path, final-failure path, lock contention,
connector-skip audit row, allowlist rejections) all green against the
real local Edge Function; `npm run e2e` extended (Action Items tab,
Refresh button flow in stub mode, Sync Status page) green; typecheck/
lint/build green.
Cloud: db push --dry-run matched exactly the 3 new migrations; migration
list 38/38 local=remote; `cs-sync-runner` deployed new, `provisioning`
redeployed. Kill switch set to `true` on cloud immediately after, so the
new cron tick can't autonomously enqueue anything before the user is
ready. `supabase secrets list` confirmed none of the 5 required Edge
Function secrets exist yet, and the one Vault secret for cron dispatch
auth isn't set up either.
Decisions made: D-114–D-121
Known issues: per the user's explicit instruction, no real sync was
triggered this session — the user runs the first one themselves once
secrets are in place and the kill switch is flipped off. Sessions
remaining: the first real sync, Session 3 (learning loop proper), Session
6 (context-store bootstrap).

---

Date: 2026-10-11 (yet later same day)
Completed: Order change logged (D-108): 7.5-pre2 runs Session 4 → 5 →
first real sync → 3 → 6, not 1-2-3-4-5-6 as originally planned, since the
learning loop (Session 3) needs real approval decisions to learn from.
7.5-pre2 Session 4 of 6 — align the skill + new record types. Two new
CS-sync record types end to end: `action_item` (reuses standups'
`action_items`, gains `project_id`/`tenant_id`, a `priority` enum,
`owner_text` fallback, the standard provenance set, its dedupe index, and
the `action_items_delete` policy every other record table has — 2
migrations, since a brand-new enum value can't be used in the same
transaction that adds it) and `engagement` (already-built 7.1 table, pure
wiring). New `resolveOwner()` in `_shared/dedupe.ts` (exact
case-insensitive `profiles.full_name` match, free-text fallback on no/
multiple matches). `ingest`, `apply_proposal()`, `payload.schema.json`,
`docs/ingest-api.md` extended; `provisioning`'s held-record release loop
extended to validate both new types at release time (plus a pre-existing
metric/health validation gap there, found and fixed as an in-scope
adjacent fix). `skills/cs-sync/` fully revised (Slack/Gmail/Fireflies/
Zendesk/Drive rules, `httprequest` read-only hard rule, account/tenant
"send your best guess" rule, `learnings`-following contract) against the
real daily-CS-workflow skill's rules (read locally, never committed) plus
live, read-only Slack-connector discovery: user-token OAuth support
confirmed (`workspace_token` field + a live authorize URL with a
populated `user_scope`), the fixed redirect URI
(`https://api.gocobalt.io/api/v1/slack/callback`), custom-app support via
Auth Profiles, and a real gap — the default app's scopes don't include
`search:read`, so re-auth alone won't fix Slack search. `refold-skill.md`
regenerated — the file for Refold → MCP → CS Hub → Skills.
One field-naming correction: the ingest API's `action_item` fields are
`description`/`due_date` (matching the table's real columns), not the
task wording's `task`/`due` — the mismatch would have silently broken
dedupe. Two real bugs found+fixed while testing: array fields compared by
reference not value in `_shared/dedupe.ts`'s normalization, and
`engagement_date` missing from `DATE_FIELDS`. Closing step: acted as the
agent, synced real Fireflies transcripts (last 7 days) against a
**local-only** ingest token — 1 external customer call produced 1
`engagement` + 3 `action_item` records, 2 internal meetings correctly
produced no records; all held pending resolution as expected, merged
under one shared `account_resolution`. One generalizable finding folded
into the skill: skip meetings with no identifiable customer domain
outright rather than filing `account_resolution` for them. Local DB reset
immediately after; no real content committed anywhere (confidentiality
rule).
Verified: fresh db reset; rls_test.sql new block ("CS-sync action_items/
engagements") + all 9 prior blocks green; smoke-login all 3 roles;
typecheck/lint/build green (no UI changes this session, so no e2e run).
Cloud: db push --dry-run matched exactly the 2 new migrations;
migration list 35/35 local=remote; `ingest` and `provisioning` both
redeployed (both were modified).
Decisions made: D-109–D-113
Known issues: the `httprequest` read-only rule is documented in the skill
but not yet enforced server-side — that's an explicit Session 5 runner
requirement, not a gap in this session's scope. Sessions 5, the first
real sync, 3, and 6 remain, built only as separately approved.

---

Date: 2026-10-11 (later same day)
Completed: 7.5-pre2 Session 2 of 6 — "Account match needed." An
unresolvable account or tenant identifier never gets guessed or silently
rejected: the dependent record becomes a `held` proposal linked to a new
`account_resolution` meta-proposal naming the identifier. Same-identifier
sightings reuse one pending resolution (not a new one every run); race-
safety backstops (`proposals_resolution_dedupe`, `proposals_held_dedupe`)
mirror 7.4's existing pattern, shipped as 2 migrations since Postgres
forbids using a brand-new enum value in the same transaction that added
it. Extracted `ingest`'s dedupe/upsert tree (plus the record-type schema
knowledge both sides need — broader than originally scoped, flagged) into
`supabase/functions/_shared/dedupe.ts`, now shared with a new
`resolve_account_proposal` provisioning action handling all 4 decisions
(map to existing account / map as tenant, creating it if needed / create
a brand-new account / ignore). The first three save the identifier to
`account_sources` (instant resolution next time) and log a
`sync_learnings` `alias_map` row; ignore adds it to `sync_learnings` so it
never re-proposes itself, confirmed via a later identical sighting being
rejected immediately. `sync_learnings` itself is pulled forward minimally
from the not-yet-built Session 3 (just the table + these two deterministic
write paths — no admin UI, no agent-written rules yet). Approvals inbox
gets a pinned "Account match needed" section with held-record counts and
one modal covering all 4 decisions.
Verified: a 24-check throwaway script (resolution reuse/race-safety,
all 4 decisions, the ignore-list fast path, required-field and required-
project safety nets at release time, full audit coverage); rls_test.sql
new block + all 8 prior green; smoke-login; npm run e2e (new seed fixture
`seed_account_resolutions.sql`, local-only, walks through all 4 decisions
through the real UI — found and fixed a real bug along the way: 
`account_resolution` proposals were leaking into the normal Approvals
list and rendering a doomed-to-fail generic Approve button); typecheck/
lint/build green.
Decisions made: D-104–D-107.
Known issues: none outstanding from this session's own scope. Sessions
3–6 of the 7.5-pre2 plan remain, built only as separately approved.

---

Date: 2026-10-11
Completed: 7.5-pre2 Session 1 of 6 — accounts & tenants are the only
truth. Plan first (a 6-session split, approved after 4 clarifying
questions) derived from two local confidential sources (never committed):
the real daily-CS-report skill and its context store, surfacing a known
flaw (the agent invents/duplicates accounts, e.g. treating a program as
its own account). New `tenants` table (an end-customer/program/sub-account
under one account — never an account itself) and `account_sources`
(structured, exact-match Slack-channel/email-domain/Zendesk-org-id/
Fireflies-hint/name-variant lookups per account and per tenant, editable
in Account 360) supersede `organizations.aliases` for matching. Checked
and ruled out reusing `projects` (delivery concept, orthogonal) and the
on-prem `NamespaceOrg` (frozen-portal mock-data concept, not a real table)
before adding the new table. `dormant` added as a new `lifecycle_stage`
value; "unverified" deliberately reuses `verified_at is null` (7.2b),
no new value. `tenant_id` added to 9 record tables (7 planned +
engagements/asks, added for consistency); `apply_proposal()` and
`ingest`'s account/tenant resolution updated to match. Also did this
session's connector discovery (Refold's full action catalogs for Slack/
Gmail/Fireflies/Zendesk, independent of what's attached) feeding the
6-session plan: confirmed Zendesk/Fireflies genuinely have no list/search
action at all (not an attachment gap), but found and live-confirmed a
working `httprequest`-based deterministic workaround for Fireflies (date-
range transcript listing via its GraphQL API, Refold auto-injecting the
stored credential) — expected to work the same way for Zendesk once
connected.
Verified: a throwaway script covering account/tenant resolution (incl.
scoping — a tenant's identifier must not cross-resolve under a different
account), dedupe with tenant_id included, and the apply_proposal write-
through; rls_test.sql new block + all 7 prior green; smoke-login; npm run
e2e (found and fixed 3 pre-existing latent test bugs unrelated to this
session's own feature code — EmptyState headings substring-matching their
page title's exact-match assertion on a truly fresh/empty database for
Ingest Tokens, Standups, and People — never caught before because e2e had
apparently never run against a 100% pristine reset); typecheck/lint/build
green. Found and fixed one real bug in my own work before reporting it:
the migration's aliases→account_sources backfill runs before local
fixture aliases are seeded (migrations apply before seeds on `db reset`),
so it correctly backfills on cloud (where aliases already exist) but
needed a matching local-fixture insert to work on a fresh local reset too.
Decisions made: D-100–D-103.
Known issues: none outstanding from this session's own scope. Sessions
2–6 of the 7.5-pre2 plan remain, built only as separately approved.

---

Date: 2026-10-10
Completed: 7.5-pre — Refold MCP discovery + finalized the CS Sync Skill.
Discovery and documentation only, no app code or schema touched, no build.
Connected live to the real `CS Hub` MCP server (test environment):
session-token auth, JSON-RPC over streamable HTTP, agent-mode contract
(`RESOLVE_ACTIONS`/`EXECUTE_ACTION` only — no skill-index tools, since
`expose_skills` is off), the `linked_account_id` header requirement on
every tool call, and a deterministic non-LLM REST execute path for
already-known actions (outer HTTP status always 200 — check `node_status`
in the body). Confirmed via the Applications API and live calls: Slack and
Fireflies are connected, Zendesk and Gmail are not (`connected: false`,
every call fails "Application Authentication not found"). Further live
testing found three more real gaps: the connected Slack identity is not a
member of any channel (`not_in_channel` on every channel history read
tried); `search_messages` is structurally unusable (needs a user token, not
a bot token); and the org has zero Refold workflows published, so the
`metric` record type has no source, deterministic or otherwise. Finalized
`skills/cs-sync/` against the real server (real action IDs, CS Hub schema
enums read directly from Postgres, Zendesk as the ticketing system, DRAFT
markers removed) and generated `skills/cs-sync/refold-skill.md` — a single
merged document ready to paste into Refold → MCP → CS Hub → Skills → Add
Skill by hand (confirmed no skill CRUD API exists). Tested `health:<account
id>` dedupe against local ingest (duplicate_skipped / proposed_update /
updated_pending, exactly as designed — no change to `docs/ingest-api.md`
needed). The planned "hand-run one real ticket" step couldn't use real
Zendesk data (the connection gap above), so one fictional-but-schema-valid
ticket record was hand-built, validated against `payload.schema.json`, and
posted to a local-only ingest token instead — proving the pipe, not Zendesk
connectivity; reported as a deviation. New `docs/refold-mcp.md` documents
the connection mechanics (no secrets, no customer content). A proposed 7.5
plan (runner design, deterministic vs. LLM-driven split, secrets needed,
watermarks, Refresh buttons, pg_cron, cost/limit guards) is in devlog,
awaiting go-ahead before any build.
Decisions made: D-097–D-099. Parked: rotate the Refold API key (exposed in
an earlier planning chat, not this session); stand up a production
(`pk…`) key + server/account before go-live.
Known issues: four real connection/app-admin gaps (above) block 7.5 from
syncing anything beyond Slack metadata and Fireflies connectivity today —
none are code issues; all need Refold-dashboard/app-admin work first.

---

Date: 2026-10-09 (later still)
Completed: 7.4 — Ingest API. New `ingest` Edge Function (bearer-token auth
via `cshub_`-prefixed hashed tokens, `verify_jwt = false` in config.toml —
the function's own token lookup is the only gate, proven both locally and
against the deployed cloud function); `ingest_tokens` table (select
super-admin-only, no client insert/update at all); two new `provisioning`
actions to mint/revoke tokens; full upsert/dedupe decision tree
(pending-merge / previously-rejected-skip / real-row compare-or-propose-
update / create) with normalized equality comparisons and a partial unique
index as the race-safety backstop; `superseded_pending` for a delete
against a still-pending create; 200-record/2MB limits enforced while
streaming the body; privacy-safe logging (ids/counts/codes only). Minimal
`/ingest-tokens` admin screen (create/one-time reveal/revoke) since 7.5
has no other way to get a token. Docs: build-spec-v3.md §4.3 rewritten to
the final contract; new docs/ingest-api.md as the reference 7.5's CS Sync
Skill will be written against.
Verified: a throwaway script covering every outcome status + edge case
(found and fixed one real bug — delete validation ordering); rls_test.sql
new block + all 6 prior green; smoke-login.ts; npm run e2e (extended for
the new token screen); typecheck/lint/build green. Cloud: db push
--dry-run matched exactly 1 migration; migration list 30/30; ingest
deployed new + provisioning redeployed; live curl against the deployed
function confirmed the 401-from-our-code auth gate in production.
Decisions made: D-091–D-096
Known issues: none outstanding. 7.5 (CS Sync Skill) is blocked on Refold
MCP server details, as already noted above.

---

Date: 2026-10-09 (yet later same day)
Completed: Standups (Part 3) + People activity (Part 4), as designed in
D-081–D-086 — no redesign. One migration: standups/standup_entries (host
can edit any entry in their own standup, a participant can edit their own,
everyone else can still read — focus, not access control)/action_items
(shared team artifacts, never auto-closed). Remembered participant set
reuses saved_views (page='standup_participants'); default resolution:
remembered → direct reports → empty. Deterministic "since last standup"
draft (audit actor activity + new escalations/tickets + due milestones on
the participant's active accounts, since their last entry). /standups +
/standups/:id (board, live mode with a timer) added to primary nav.
People's existing per-person slide-over extended with role history, recent
activity, open action items, recent standup entries — no scores/KPIs
(confirmed, not newly built: the data those will need is fully captured).
Cleanup 1: product-overview.md §6's journeys rewritten off the old
hierarchy framing; grepped both docs for lingering "Head of CS"/title/team
references and fixed the one genuine contradiction found (§5.12's audit
log gated "(Head of CS)").
Cleanup 2 (required): added Playwright (nothing existed before — no test
runner at all). tests/e2e/smoke.spec.ts signs in through the REAL login +
MFA challenge screens via a seeded pre-verified TOTP factor (local-only
fixture, secret confirmed plain-text locally) and clicks through Home/
Portfolio/Account 360 (every tab + a write)/Approvals (approve)/Audit log/
Standups (start, edit, live mode)/People (open activity view). **Caught and
fixed a real regression from last session**: the People directory's
reports_to-name lookup used a self-referential PostgREST embed
(`profiles!profiles_reports_to_fkey(...)`) that 400s even with the hint
PostgREST's own error suggests — a genuine PostgREST limitation, not a
typo — confirmed by direct API testing. The whole People page had been
silently broken since equal-admins Parts 1–2 shipped; no UI test existed
then to catch it. Fixed by resolving the name client-side instead.
Verified: fresh db reset; rls_test.sql's new standups block + all 5 prior
blocks green; smoke-login.ts all 3 roles; `npm run e2e` green (ran twice
for reliability, after hitting and fixing 3 real test/selector bugs along
the way — see devlog); typecheck/lint/build green. The host machine's
known memory pressure (11.3GB/12GB swap) caused one Vite dev-server hang
mid-run — not retried blindly; confirmed via direct curl polling that the
server had genuinely stalled, then it recovered on its own and every
subsequent run was fast and stable.
Cloud: db push --dry-run matched exactly 1 migration; migration list
29/29 local=remote; no Edge Function changes, no redeploy needed.
Decisions made: D-087–D-090
Known issues: none outstanding from this session's own scope. Performance
indexes/KPIs remain deferred (Phase 10, with gamification).

---

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