# Devlog

Newest entry first. One entry per build-room session. Keep entries short —
this file is read at the start of every session, so token economy matters.

Template:

```
## Session N — YYYY-MM-DD — <prompt block>
**Built:** what actually got done (files/components, 2–4 lines)
**Deviations:** anything that differs from the build spec, and why
**Decisions:** IDs logged to docs/decisions.md, or "none"
**Next:** the single next prompt block
**Issues:** open bugs / TODOs, or "—"
```

---

## Session 60 — 2026-10-17 — Stage 2c: getting figures in by hand or from a file
**Built:** `MetricEntry` — manual entry plus csv/json upload — on both the
account's Metrics tab and the new per-tenant page, which previously had no
way to record anything. The file is parsed in the browser and written as
ordinary metric rows with `source = 'file'`; it is never stored (D-156), so
there is no bucket, no storage policy and no second copy of customer data.
Unknown metric keys are caught and reported before any write rather than
failing against the foreign key, and a preview shows what will be recorded.
Parsers extracted to `src/lib/metricParse.ts` so they could be tested
directly.
**Deviations:** xlsx and doc were asked for and are refused with a reason
("export the sheet as CSV"). Reading them needs a dependency this app does
not carry, and accepting a file into a queue nothing reads would be the same
silent no-op as the feature-flag toggles. Said on screen, not hidden.
**Found while building (D-155):** `metric_values`'s uniqueness constraint
excluded `tenant_id` even though `apply_proposal()` has been writing that
column for weeks — so two tenants of one account reporting the same metric
for the same period would silently overwrite each other. Zero rows exist in
production, so nothing was lost, but it would have bitten the first
per-namespace figures an on-prem customer gave us. Constraint widened; the
account-level view now excludes tenant rows so a tenant's figure cannot show
as the account's.
**Verified:** 12-case parser unit test (happy paths, column order, baseline,
missing headers, bad rows kept separate from good, both json shapes, and
every refusal); new RLS block proving account-level and two tenants coexist
for the same metric and period, and that a tenant re-reporting replaces only
its own row; 18 blocks total; smoke-login; e2e; typecheck/lint/build;
migration pushed.
**Decisions:** D-155, D-156
**Next:** real feature-flag storage, and settling what the frozen customer
portals show before any customer goes live. Still deferred by the owner:
file-records-as-found, token rework.
**Issues:** unchanged.

---

## Session 59 — 2026-10-16 — Stage 3: the nav the owner actually asked for
**Built:** The owner pushed back — they had specified this IA several
messages earlier and I kept deferring it behind my own staging (D-154). Done
now: the collapsed "Admin" group is gone; Users & roles, People, Feature
flags, Ingest tokens and Sync status are sections of Settings. Nav is Home ·
Portfolio · Approvals · Standups · Audit Log · Settings. Portfolio gains the
**Add details** tab, which says outright that file upload is not built yet
and points at what does work rather than being a tab that does nothing.
**Deviations:** two additions to the owner's list, both deliberate and
flagged — Approvals is kept top-level (not in their list, but the screen
they use most; reads as an oversight), and People sits under Settings beside
Users & roles since both concern people. Old routes still resolve so
bookmarks keep working.
**Verified:** e2e rewritten for the new nav — the three moved items are now
reached through Settings the way a user would — green twice; 17 RLS blocks;
smoke-login all three roles; typecheck/lint/build.
**Decisions:** D-154
**Next:** Stage 2c — the actual file upload (csv/json/xlsx/doc), the only
metrics route for air-gapped accounts.
**Issues:** unchanged.

---

## Session 58 — 2026-10-16 — Stage 2d: retire the fixture-backed screens
**Built:** `/overview`, `/cloud-customers` and `/onprem-customers` removed
from the internal nav and redirected to Portfolio — all fixture-backed and
superseded. Global search rewritten against real `organizations` and
`tenants` (it previously searched fixtures, so a real customer's name
returned nothing). A banner on Feature Flags states outright that there is
no `feature_flags` table and a toggle changes nothing (D-153).
**Deviations:** the plan said "delete useMockData.ts". It cannot be deleted:
it still backs the cloud/on-prem owner detail pages, namespaces and the
owner dashboard, and those portals are frozen — "kept working, no new work".
Deleting their data source would break them. They are now unreachable by a
super admin, so the internal app is clean while the fixtures serve only the
frozen surfaces. Reported rather than forced.
**Verified:** 17 RLS blocks; smoke-login (all three roles, including the two
customer owners whose pages still use fixtures); e2e extended for both
redirects and for global search finding a real account by name;
typecheck/lint/build.
**Decisions:** D-153
**Next:** Stage 2c — "Add details" + file upload (csv/json/xlsx/doc), the
only metrics route for air-gapped accounts. Then Stage 3 (nav).
**Issues:** feature flags remain non-functional behind an honest banner;
building real flag storage is separate work. Customer portals still render
fixtures to their owners — fine while no customer is live, but it must be
settled before one is.

---

## Session 57 — 2026-10-16 — Stage 2b (part 2): the hierarchy on the board
**Built:** `DataTable` gained an optional `renderExpanded`, so an account
with tenants opens in place on the Portfolio board while a cloud account
renders exactly as before — one component and one design rather than a
second layout for "accounts with children" (D-152). On-prem tenants are
grouped by the cluster each signup runs in (presentation only; the data
stays flat per D-149). New `/accounts/:orgId/tenants/:tenantId` page showing
where a signup runs and an honest empty state for metrics.
**Deviations:** none. One real bug caught mid-build: `renderExpanded`
returned `<AccountTenants/>` unconditionally and a JSX element is truthy
even when the component renders null, so EVERY row grew a chevron and the
ones without tenants expanded to nothing. Emptiness must be decided by the
caller before the element is constructed.
**Verified:** the e2e assertions for this were deliberately made
unconditional — the guarded first version would have skipped silently and
passed, which is how the tenant-parent bug reached the owner last time. That
change is what caught the chevron bug. 17 RLS blocks; e2e green twice in a
row (one intervening failure was the known People-sheet Escape flake on a
cold dev server, not this work); typecheck/lint/build.
**Decisions:** D-152
**Next:** Stage 2d (retire `useMockData.ts`), then 2c (Add details + file
upload), then Stage 3 (nav).
**Issues:** unchanged. Note the local fixtures give Prism Analytics tenants
despite being a cloud account, which the model says should not happen — the
board shows whatever exists rather than hiding real rows, but it is a
fixture inconsistency worth tidying.

---

## Session 56 — 2026-10-16 — Stage 2b (part 1): accounts and tenants are editable
**Built:** The owner found that nothing about an account or tenant could be
changed after creation — name, segment, lifecycle, deployment shape, or which
account a tenant sits under (D-151). Added `EditAccountModal` (all of the
above, reachable from the account header) and `EditTenantModal` (name,
cluster, namespace, Refold org id, linked account id, AND parent account),
plus `updateTenant` and a `move_tenant()` SQL function. `updateAccount`
gained `deploymentType`; it already took the rest and simply had no UI.
Re-parenting is the non-obvious part: twelve tables carry `tenant_id` beside
`org_id`, so `move_tenant()` moves the tenant, its records across all twelve,
and its `account_sources` identifiers in one transaction — leaving those
behind would make the next sync re-attribute the tenant's traffic to the
account it just left.
**Deviations:** none. Scope added to Stage 2b at the owner's request; the
Portfolio-board hierarchy and per-tenant pages are still to come in 2b.
**Verified:** new RLS block asserting the property that cannot be eyeballed —
after a move, no record disagrees with its tenant about which account it
belongs to — plus a readable name-collision refusal, a no-op self-move, and
that a customer owner cannot move anything; 17 blocks total; smoke-login;
e2e extended for the edit-account modal; typecheck/lint/build; migration
pushed.
**Decisions:** D-151
**Next:** Stage 2b part 2 — hierarchy on the Portfolio board + per-tenant
pages. Then 2d (retire useMockData), 2c (Add details + upload).
**Issues:** unchanged — kill switch on, 30 units queued; Naehas cluster names
still unknown.

---

## Session 55 — 2026-10-16 — make the doc protocol enforceable
**Built:** The owner asked not to have to prompt for doc updates after every
deployment, decision and spec change. The protocol already required most of
it and was still skipped for four sessions (D-150) — so it is now mechanical:
`scripts/docs-check.ts` / `npm run docs:check` fails when devlog, CLAUDE.md
and PROGRESS.md disagree about the latest session, or when the devlog cites a
`D-` id with no section in decisions.md. `npm run verify` bundles typecheck +
lint + build + docs:check. The end-of-session protocol was rewritten to 11
explicit steps, stating it runs unprompted, and gained what it had been
missing: build-spec-v3.md / product-overview.md on domain-model, contract or
screen-behaviour changes; redeploying changed Edge Functions; and the
`--env-file supabase/.env` requirement for e2e.
**Deviations:** the check cannot verify the spec was updated when it should
have been — no reliable textual signal for "the domain model changed" — so
that remains a printed reminder rather than a gate.
**Verified:** confirmed the check FAILS (exit 1, named reason) against a
deliberately staled CLAUDE.md, then passes restored. A check that cannot fail
is worthless.
**Decisions:** D-150
**Next:** Stage 2b — hierarchy on the Portfolio board + per-tenant pages.
**Issues:** unchanged.

---

## Session 54 — 2026-10-16 — Stage 2a: one page per account
**Built:** `/accounts/:orgId` gains a **Deployment** tab carrying what
`/cloud-customers/:id` and `/onprem-customers/:id` used to show: the account's
shape in plain words, its tenants (grouped by cluster for on-prem, which is
presentation over flat data per D-149, with namespace / org / linked-account
ids shown), and an honest empty state where platform metrics would be. Those
old pages were fed entirely by mock fixtures, so nothing was ported — a
sparse true page beats a full fictional one, and Stage 2c's "Add details" is
how the gaps get filled. New `CustomerDetailRedirect` folds the old
super-admin links into the merged page while leaving customer-owner portals
alone (they are frozen, and `/accounts` is super-admin only — redirecting an
owner would hand them Access denied instead of their own view).
Also set every account's deployment shape from the owner's own description:
Naehas / zycus / octave / Movius (new) on-prem air-gapped, Kantata split into
**Kantata Engg** and **Kantata PS** (both dedicated cluster) with Praecipio,
TMP, Basware, Scivida, QBD and Cheil as Kantata PS tenants, six Naehas
tenants across two clusters (cluster names deliberately left null and the
split preserved in notes rather than invented), and the remaining four cloud
accounts set explicitly rather than left null. 12/12 accounts now carry a
shape, which is what Stage 2b's views read.
**Deviations:** the owner asked me to work the 80-item Approvals backlog.
I could not: `provisioning` requires a real signed-in session with AAL2 and
I have no production login, and doing it in raw SQL would reimplement the
dedupe tree outside the one write pipeline. Instead I pre-created the six
accounts the sweep found (Bluecopa, Revinate, PayIt, Akkuro, Similarweb,
Infinitecx) so each resolution is a pick rather than a create, and handed
over an exact 9-to-do / 3-to-leave list. The three left are `zendesk-org:*`
identifiers whose evidence names no company at all.
**Verified:** 16 RLS blocks; smoke-login; e2e extended (Deployment joins the
tab walk; an old customer link asserted to land on /accounts/:id);
typecheck/lint/build.
**Decisions:** none new — executes D-149.
**Next:** Stage 2b (hierarchy on the Portfolio board + tenant pages), then 2d
(retire useMockData), then 2c (Add details + upload).
**Issues:** Naehas has a stray 7th tenant "Amex" with no namespace, created by
an earlier resolution and probably overlapping `e1`; left rather than deleted
since records may point at it. Kantata Engg holds ~14 records filed before the
split that may belong to Kantata PS.

---

## Session 53 — 2026-10-16 — the hierarchy, settled and encoded
**Built:** The owner defined the domain properly and it collapsed three
competing models into one (D-149). Account = an organisation using Refold;
tenant = one signup = one Refold org/workspace — confirmed as the same thing,
not two levels. Cloud accounts have no tenants (their customers are Refold
linked accounts the Hub deliberately ignores); dedicated-cluster and on-prem
accounts have one per signup. Cluster and namespace are IDENTIFICATION on the
tenant, not tiers: `tenants` gains `cluster_name`, `namespace_name`,
`refold_org_id`, `linked_account_id` plus an index for the grouped on-prem
lookup. The picker asks for cluster/namespace only when the parent account is
on-premise, where they mean something.
**Deviations:** this supersedes the approved plan's `namespaces` table —
Stage 2 is now smaller, not larger. Also surfaced the "org" collision that
had been making this hard to discuss: `organizations` is the ACCOUNT here,
while a Refold org is the workspace a signup creates.
**Verified:** new RLS block (a tenant carries its location, is findable by
cluster + namespace, and stays invisible to a customer owner) + all 15 prior
blocks; smoke-login; e2e; typecheck/lint/build; migration pushed.
**Decisions:** D-149
**Next:** Stage 2 proper — one merged page per account and tenant, with the
on-prem grouping, replacing the mock admin panel.
**Issues:** account deployment models are still mostly unset (Kantata is
stored as cloud despite being a dedicated cluster), and Stage 2's views read
off those fields.

---

## Session 52 — 2026-10-16 — tenant creation actually works
**Built:** Owner hit two bugs in yesterday's picker: the tenant parent
dropdown listed one account, and there was no way to create an account from
the tenant form. Root cause measured against live data — only 1 of 10
accounts has a `deployment_model`, since anything created from an approval
defaults to cloud/null, so filtering parents by it hid almost everything
(D-148). The on-prem/dedicated rule is now a hint rather than a gate: all
accounts are candidate parents, the likely ones marked `· on-prem/dedicated`,
and "+ Create a new account…" sits inside the tenant form, returning to it
with the new account preselected. The top-level "+ Create a new tenant…" and
the contextual "add a tenant under X" are both ungated.
**Deviations:** none. Worth flagging for the owner rather than changing
unilaterally: Kantata is stored as `cloud` with no deployment model despite
being a dedicated cluster — Stage 2's hierarchy work will depend on that
being right.
**Verified:** e2e extended to actually create a tenant and assert its parent
list contains multiple accounts plus the create-account option — the gap
that let the original bug through, since the old test only opened the form;
15 RLS blocks; typecheck/lint/build.
**Decisions:** D-148
**Next:** Stage 2 — the real hierarchy and one merged page per entity.
**Issues:** unchanged — kill switch on, 30 units queued.

---

## Session 51 — 2026-10-16 — one card, one form, no dead ends
**Built:** Owner feedback on Stage 1: still two designs inside the one list,
and a hard stop when filing a milestone. Both fixed (D-147). `RecordCard`
replaces `ProposalCard` + `UnresolvedCluster` — every pending item, attributed
or not, renders the same way; only the account line differs, and where it is
unknown it carries "Set account". Grouping dropped in favour of an "apply to
all N records seen as X" checkbox in the modal, so uniformity in the list
does not cost repeated decisions. `SetAccountModal` replaces both the cluster
and move modals. The picker's inline account creation now uses the real
Add-account fields (segment, deployment type, deployment model) rather than a
name; tenants are offered only for on-prem and dedicated-cluster accounts,
with an inline "add a tenant under X" once one is selected. New
`dedicated_cluster` deployment model (own migration — new enum values cannot
be used in the transaction that adds them). The milestone dead end now
offers "Create project 'X' and file it" and retries.
**Deviations:** my successive surgical edits left duplicate components in
ApprovalsPage (two EditThenApproveModals, two RejectModals); I reset the file
to the last commit and reapplied in one pass rather than keep patching.
**Verified:** 15 RLS blocks; smoke-login; e2e extended for the unified card
and the inline account form; typecheck/lint/build; migration pushed. e2e
flaked twice on the People sheet's Escape while the dev server was warming
after edits, then passed 4 consecutive times — the committed baseline passes
too, so not from this change, but that assertion is cold-start sensitive.
**Decisions:** D-147
**Next:** Stage 2 — the real hierarchy and one merged page per entity.
**Issues:** unchanged — kill switch on, 30 units queued.

---

## Session 50 — 2026-10-16 — Approvals as one list (production-readiness Stage 1)
**Built:** Stage 1 of the approved production-readiness plan. The pinned
resolution section and the separate held-records section are gone; both are
now rows in one list. Unattributed records cluster under the identifier they
share so a cluster is ONE decision, with a per-row override. Every row leads
with what the record is and its evidence excerpt — the identifier is
secondary, which was the owner's actual complaint ("i do not have context on
what this org is"). New `AccountTenantPicker` (accounts as optgroup headings,
tenants indented with ↳) replaces the flat selects in both Approvals modals
and the Sync Status backfill picker, and can create an account OR a tenant
inline. New `useAccountTree()` fetches accounts + tenants together. No
backend change: `reassign_proposal` already did everything needed, including
auto-closing a resolution when its last record leaves (D-146).
**Deviations:** none to the plan. Two of my own slips, both caught: deleting
the old resolve modal took `RejectModal` with it (restored from git), and the
picker's account option was labelled "X — the account itself" only when X had
tenants, so an e2e `selectOption({ label })` failed the moment data shape
changed — labels are now stable either way.
**Decisions:** D-146
**Next:** Stage 2 — the real hierarchy (namespaces table, `tenants.namespace_id`,
dedicated-cluster deployment type) and one merged page per account/namespace/
tenant, replacing the mock-data admin panel.
**Issues:** unchanged — kill switch on, 30 units queued, file-as-you-go still
deferred by the owner's own sequencing.

---

## Session 49 — 2026-10-15 — the nightly covers one day, not seven
**Built:** The owner's rule: "daily sync should only sync per day not 7 days.
7 days or more/less is for manual trigger." Daily mode now resolves to
exactly one day and no longer falls back to the watermark for its floor —
which is what had been producing week-long nightlies, since a `partial` run
holds the watermark by design and 41 of 41 units ended partial. A watermark
newer than a day is still honoured (it only shrinks the scan); an explicit
day range from the manual trigger always wins; backfill keeps its 90 days.
Sync Status now states the distinction on screen.
**Deviations:** none to the instruction. Flagged rather than hidden: a missed
night is no longer re-covered automatically — catching up is what the manual
trigger's wider range is for. Also recorded what this does not fix (D-145):
the per-unit floor is fixed overhead re-sent every turn, not data volume, so
a one-day window should land nearer 60-120k than the 185k median rather than
falling sevenfold. Runs average 108s against a 65s wrap-up — time-bound, not
data-bound.
**Verified:** 8-case unit test of the window rules (daily with no watermark,
with a stale 30-day watermark, with a fresh 6-hour one, the daily sweep, two
manual ranges, the manual sweep default, backfill); 15 RLS blocks; e2e;
typecheck/lint/build. One JSX break of my own, caught by typecheck and
repaired before it reached anything.
**Decisions:** D-145
**Next:** let a real nightly run and measure the actual one-day cost.
**Issues:** 31 units remain queued behind the kill switch; the learning loop
will not reduce tokens (it adds to the context re-sent each turn) — it buys
accuracy, not spend.

---

## Session 48 — 2026-10-15 — the 138-run review, and three faults it exposed
**Built:** Reviewed the first dataset big enough to judge the pipeline — 138
runs, 11,553,163 tokens, 91 records (D-142). Confirmed the sourceless skip
saved ~4.6M tokens (37 runs at zero cost), the nightly fired autonomously at
01:30 via pg_cron, and — answering a direct question — that a `partial` run
does NOT duplicate: 0 duplicated `source_ref`s across 91 proposals, with 31
`updated_pending` outcomes showing re-sends merging correctly.
Three fixes. A paused unit no longer returns `failed`, which was writing
queue rows to `error` and removing them permanently — pausing had destroyed
30 units; they are restored (D-143). The stale-unit reaper now runs BEFORE
the kill-switch gate, since cleaning up after a dead worker is not "doing
work" — verified live by reclaiming a unit stranded since the 01:30 nightly
(D-143). And each outbound lookup now aborts at 25s with the clock checked
between calls inside a turn, so one slow call can no longer run past the
~150s wall and take the run's records with it (D-144).
**Deviations:** I had offered "save records as they are found" and withdrew
it — the model emits records only in its final answer, so there is nothing
to save mid-run; real incremental saving needs a tool-based filing contract.
Also withdrew the suggestion to raise `CS_SYNC_DEADLINE_MS`: the project is
on the free tier (150s wall), where the current margin is already correct.
**Decisions:** D-142, D-143, D-144
**Next:** 31 units are queued and will start the moment the kill switch goes
off — roughly 3.4M tokens at current efficiency. The owner decides.
**Issues:** 31% of runs were dying before this session's fix; the fix is
deployed but unproven against real traffic. Per-record cost is still ~127k.

---

## Session 47 — 2026-10-14 — what happens to the queue when nobody is watching
**Built:** Prompted by "if the screen gets locked, does the sync stop?". The
screen was the wrong thing to worry about — the drain is driven by awaited
fetches, so a locked screen keeps going and a sleeping machine only pauses
it. Reading the code to answer that turned up two ways a unit left the queue
for good (D-140). A `locked` result was written as `error`, taking a
recoverable unit out of `queued` permanently; it now stays queued with a
`retry_after`, and both claim paths skip a waiting row (without that, the
drain re-picks the same locked unit forever). And a row marked `processing`
was never reclaimed, so a worker killed at the wall stranded it — latent only
because the browser drain never sets `processing`, and due to go live with
the dispatcher. New `requeue_stale_sync_units()` puts back anything claimed
over 20 minutes ago and closes `sync_runs` rows stuck at `running`;
`dispatch_sync_queue()` reclaims before it claims.
Also set the `cs_sync_runner_auth` Vault secret on cloud (D-141), completing
the autonomous path. The key was piped from `supabase projects api-keys`
into `vault.create_secret` without ever being printed.
**Deviations:** none to the plan. Two of my own test bugs: an INSERT with 6
values for 5 columns, and running `rls_test.sql` twice against one database
(the standing trap — it leaves fixtures), which reported 0 passing blocks
until reset.
**Decisions:** D-140, D-141
**Next:** the owner decides the kill switch — it is currently `true`, which
holds the nightly job AND makes "Run sync now" queue nothing.
**Issues:** the sweep still finishes near the 150s wall with no per-tool-call
timeout, and records are still only posted at the end — so a wall-hit loses
what was gathered, even though the unit is now correctly retried.

---

## Session 46 — 2026-10-14 — Approvals in two sections; a record can change account
**Built:** CFIHOS is not a company — it is an implementation Octave is running
— and no resolution decision could say so: "create account" invents a company,
"ignore" bins the engagement that belonged to Octave. Held records were a bare
count on their resolution, unreadable and unmovable. Approvals is now
**Accounts** (what is this name?) and **Details** (every record waiting, its
account shown and editable). New `reassign_proposal` provisioning action:
a held record is released through the same `decideAndFile` tree a resolution
uses; a pending record is re-pointed in place, which also fixes a wrong
attribution before approval. Remembering the identifier is a checkbox, not a
side effect — unticked, the record moves without the name becoming an alias.
Moving the last held record auto-closes its resolution as *records
reassigned*. `resolve_account_proposal` gained the same `rememberIdentifier`
flag. New `useHeldRecords` hook, `HeldRecordCard`, `MoveAccountModal` (with
create-an-account inline, so Octave can be made on the spot).
**Deviations:** my first `decideAndFile` call passed `tenantId`/`projectId`
as arguments; they are merged into `data` — corrected against the canonical
release loop. Cleaned the cloud records first at the owner's request: all
proposals, sync runs, queue and watermarks reset; accounts, `account_sources`
and the two `alias_map` learnings from their Kantata/OvationCXM approvals
kept. Three e2e failures chased: one was my own setup (`functions serve`
without `--env-file` silently skips `supabase/.env`, so stub mode was off and
the runner called the real Refold API with an empty key — "application list
failed: 400"); one was real (I renamed the heading, the test asserted the old
text); one was an ambiguous `getByLabel('Account')` matching the dialog and
the remember-checkbox too. A fourth, the People sheet's Escape, was a flake —
passed on re-run and twice after.
**Decisions:** D-139
**Next:** the owner's call on the 5 profiles blocking fixture deletion; the
parked token rework.
**Issues:** unchanged — the sweep still finishes near the 150s wall with no
per-tool-call timeout, and records are still only posted at the end.

---

## Session 45 — 2026-10-14 — stop paying to search for accounts that map to nothing
**Built:** Measured where the tokens actually go: of one day's 1,908,594,
**1,719,860 (90%) went to 18 per-account units that produced nothing**, and
188,734 to the single sweep that found 7 companies and 12 records. The cause
was not efficiency — both accounts had zero `account_sources`, so there was
no identifier to match on. `processUnit` now checks `account_sources` first
and skips at **zero tokens** when an account has none and has never produced
a record (D-137). Shipped with its counterpart so it is not self-sealing:
refold-skill.md rule 1b — a name match against an account with an empty
`aliases` list is no longer skipped by the sweep, it is emitted so an
"Account match needed" attaches the identifier. Account 360 shows "Not
synced - no sources mapped". `skill-prompt.ts` regenerated (round-trip
verified identical).
**Deviations:** the skip first used an invented `skipped_no_sources` status;
`sync_run_status` is an enum ('running','success','failed','partial') and it
would have thrown — corrected to `partial`, which is also the honest choice
since it holds the watermark for a window that was never examined. Also
recorded why the 25k probe budget never bound (D-138): a cap can only end a
run after the turn that crosses it, and one turn costs ~30-40k because the
whole conversation is re-sent each time. D-132's fix is real and measured
(412,784 -> 80,783 on accomplishment, 5.1x) but the floor is structural.
Cleared the cloud sync history at the owner's request (34 runs, 36 queue
rows, 2 tracking rows); all 9 pending and 6 held proposals kept. Deleting
the two fictional accounts is BLOCKED and left undone: `profiles.org_id` is
RESTRICT and 5 users hang off them, including two real colleagues
(amritha.m@, rishiikesh.b@) and the three demo logins smoke-login tests.
**Decisions:** D-137, D-138
**Next:** the owner's call on those 5 profiles; then the parked rework.
**Issues:** the sweep finished at 144s against a 150s wall — the deadline is
still only checked between turns and there is no per-tool-call timeout, so a
slow call can still lose a whole run. Records are still only posted at the
end, so a wall-hit loses everything gathered.

---

## Session 44 — 2026-10-14 — correct the planning room's status (no code)
**Built:** docs only. The planning dashboard was four sessions stale and its
headline claim was inverted — it said no real sync had run and the kill
switch was on. Verified against cloud instead: **17 runs, 3,466,170 tokens,
0 proposals, 0 discovery runs, kill switch OFF**, all five Edge Function
secrets set on 12 Oct, all four connectors live since `0acfe02`. CLAUDE.md
carried the contradiction internally (a Blockers line saying the switch was
off directly above a D-120 Known-issues line saying it was on); fixed.
PROGRESS.md's 7.5 bullet stopped at "Session 5 of 6 done" and now covers
Session 6, the two 12 Oct fix sessions and Session 7.
**Deviations:** found the actual reason 17 runs produced nothing, which is
not any of the things fixed in Sessions 5-7: `account_sources` on cloud is
**empty**, so the two fictional accounts are bare `organizations` rows with
nothing mapping them to a Slack channel, email domain or Zendesk org. The
agent had no identifier to match on and correctly reported finding nothing.
This also means the suggested next step of "run one manual Refresh on an
account you know" would still find nothing — logged as D-136 with the two
things that actually would (map sources, or run the sweep, which needs none).
Also corrected a number I reported earlier in the session: the 2.67M figure
was the latest 12 runs, not the total; across all 17 it is 3.47M.
**Decisions:** D-135, D-136
**Next:** unchanged — a first real result, then Session 3 (learning loop),
then the context-store bootstrap.
**Issues:** the sweep's 20-item budget is still advisory to the model rather
than enforced, and `covered_through` is still model-reported; the
token-sustainability rework (runner lists+filters) remains parked.

---

## Session 43 — 2026-10-14 — discovery first; a budget that stops dead accounts
**Built:** Four production runs had cost 2.67M tokens for zero records, all
spent hunting two fictional fixture accounts; deleting them was rejected
("It can be a human error that someone adds an invalid account and all the
tokens should not utilized on it"), so the fix is systemic. One migration
(`20261014000002_account_sync_health.sql`): `sync_queue.priority` + a total
claim order, `account_sync_health`, `record_account_scan_result()`,
`mark_account_sync_flagged()`, `enqueue_account()`,
`sync_settings.probe_token_budget`, and `enqueue_all_units` reordered so the
sweep goes first. `llm.ts` truncates every tool result and projects the next
turn's cost before issuing it. `index.ts` picks a probe budget for accounts
finding nothing, records each unit's outcome, and files a `health` proposal
at 30 empty nights. `provisioning` queues a just-resolved account's full
pass. UI: probe-budget field + "Accounts not producing data" on
`/sync-status`, an empty-nights indicator on Account 360 from 3 nights.
**Deviations:** The root cause was worse than planned for — the sweep was
not merely enqueued last. One `enqueue_all_units` call stamps every row with
the same `enqueued_at` (now() is transaction-stable) and the claim ordered
by it with no tiebreak, so claim order was heap order; reordering the
INSERTs alone would have been cosmetic. Added the priority column, which was
not in the approved plan. Confirmed live: prod had a discovery unit queued
at the backfilled default 100, indistinguishable from the other 14 —
promoted to 0 by hand (an update; nothing deleted). One planned item needed
no code: re-association on account approval already worked, so it was
asserted (12 checks) rather than rebuilt.
**Decisions:** D-131–D-134
**Next:** the owner's first real sync on the new ordering — the real test of
whether discovery-first finds the actual accounts. Then 7.5-pre2 Session 3
(learning loop), then Session 6 (context-store bootstrap).
**Issues:** kill switch is OFF on cloud (the owner turned it off) with 15
units still queued from 2026-10-12; they drain sweep-first now. Whether the
150k full cap should come down is a judgement to make after the first run
that actually finds something. Token-sustainability rework still parked.

---

## Session 42 — 2026-10-12 — park token sustainability; Slack custom-action spec
**Built:** docs only, no code. Token sustainability parked explicitly with
the measurement behind it (one live 7-day sweep = 154k tokens for 14
records, ~98% spent searching not reporting) plus the proposed fix (runner
lists+filters, model sees only qualifying items — which would also make the
watermark exact rather than model-reported). Recorded in decisions.md's
Parked list and CLAUDE.md's known issues, along with the related weak
controls: `max_tokens_per_unit` is a settings-UI field nothing reads, the
sweep's 20-item budget is advisory not enforced, and `covered_through` is
self-reported. New `docs/slack-custom-actions.md` — a ready-to-hand-over
spec for creating user-token Slack actions on the Refold connector (the
stock connector is bot-token only, so channel reads and search are
impossible), including the exact Slack endpoints, action ids, OAuth scopes,
and the follow-up edits this repo needs (allowlist, action catalog, and
removing Slack from READ_BLOCKED_CONNECTORS) before they take effect.
**Deviations:** none — the session owner chose to keep the current
architecture and defer the token work.
**Decisions:** none (parked items only)
**Next:** the owner's first end-to-end prod run. Gmail is now connected and
verified working, so the sweep has two live sources (Fireflies + Gmail).
**Issues:** Gmail going live roughly doubles what a sweep examines, which
raises per-run token cost — another reason the parked filtering work
matters. Zendesk still not connected.

---

## Session 41 — 2026-10-12 — resumable sync + a full manual run
**Built:** three fixes from the session owner's questions about the sweep
and the 150s limit. (1) A truncated run now reports `partial` and carries
`covered_through`, so the watermark advances only as far as the run
actually got — previously an early stop still reported `success`, moving
the watermark to now() and silently dropping everything it never reached
(D-128). (2) "Run sync now" queues what the NIGHTLY job queues — every
record type for every account plus the sweep — via a shared
`enqueue_all_units()`, then the browser drains the queue one unit per
request. That keeps every request far under the 150s ceiling, shows live
progress, and needs no Vault secret; the runner's queue entry point now
accepts a super_admin+AAL2 session as well as the service-role key
(D-129). The old sweep-only trigger stays as "Scan for unknown accounts
only" for testing. (3) The agent is told to work oldest-first and report
how far it got.
**Deviations:** none from the ask.
**Decisions:** D-128–D-130
**Next:** unchanged — the owner runs the first real sync; then Session 3,
the learning loop.
**Issues:** `create or replace function` with a CHANGED signature creates
an overload rather than replacing, leaving two versions where a shorter
call binds ambiguously — caught by rls_test dropping from 12 blocks to 10,
fixed with an explicit drop (D-130). Also hit the same test-order trap as
yesterday twice more: rls_test leaves fixtures that break a re-run or a
later e2e on the same database, so reset between every suite.

---

## Session 40 — 2026-10-12 — 7.5-pre2 Session 6: the discovery sweep
**Built:** the missing half of the runner. Session 5 only ever synced
accounts that already exist, so a conversation with a company nobody added
was invisible — the session owner caught it. New `record_type='discovery'`:
a sweep tied to no account, carried on the internal org's unused
`sync_state` slot (so it inherits lock/watermark/run-recording with no
schema change), fed a roster-wide context, skipping anything already
attributable and emitting the rest with a best-guess identifier — which
lands on `ingest`'s existing held/`account_resolution` path. **No change to
ingest, apply_proposal(), _shared/dedupe.ts or the resolution UI.**
Selection rules configurable (`internal_email_domains`,
`discovery_channel_patterns`). "Scan for unknown accounts" button on
/sync-status (synchronous — no queue, no Vault secret) plus a daily
enqueue. Also persisted the agent's `skipped` list to
`sync_runs.skipped_items` and surfaced it in the UI.
**Deviations:** the delete/reset tooling in the original ask was dropped —
the owner deferred it ("lets not delete anything"). Four fixes the live
runs forced (D-125): per-tool-call logging (a Session 5 requirement never
implemented — without it a sweep that reported nothing was undiagnosable);
`skipped` persisted rather than discarded; `RESOLVE_ACTIONS` **removed** as
actively harmful (it under-reported, omitting `httprequest`, so the agent
concluded Fireflies couldn't be listed and gave up); and Slack treated as
read-blocked despite `connected: true`. Then three more for the ~150s Edge
Function wall (D-126): a self-watching deadline that finalises with tools
withdrawn, an explicit examine-budget, and a separate faster model for
sweeps (`CS_SYNC_DISCOVERY_MODEL`, default haiku-5.5) — on Sonnet a sweep
could not finish at all. Plus forced JSON mode on finalising turns after a
completed sweep answered in 8KB of prose, and fence-tolerant JSON parsing.
**Decisions:** D-124–D-127
**Next:** the owner runs the first real sweep on prod (still not triggered
here) — then Session 3, the learning loop.
**Issues:** two self-inflicted test-procedure traps worth remembering, both
hit this session: `rls_test.sql` leaves fixtures behind (including a
deliberately-invalid `profiles` proposal) that break a later `npm run e2e`
on the same database — always `db reset` between them, as CLAUDE.md's
protocol already says; and a run killed mid-flight leaves its unit locked
for the full 15-minute TTL, so retries only say "already running" with no
hint why. `candidates` on a resolution came back empty on every item in
the live run — expected with only two fictional accounts present, but that
field is effectively untested.

---

## Session 39 — 2026-10-12 — switch the runner's LLM provider to OpenRouter
**Built:** Session owner supplied an OpenRouter key instead of an Anthropic
one. Verified it first against OpenRouter's own `/auth/key` endpoint (valid,
paid tier, $246.53 of $250 remaining, no expiry, not a provisioning key)
before touching code. `anthropic.ts` → `llm.ts` (renamed on purpose — a file
called `anthropic.ts` calling OpenRouter is a trap), rewritten for
OpenRouter's OpenAI-compatible chat/completions shape: system prompt as a
`system` message, OpenAI function-format tools, `tool_calls[]` with
JSON-**string** `arguments`, `finish_reason === 'tool_calls'`, tool results
as `{role:'tool', tool_call_id}` messages, `prompt_tokens`/
`completion_tokens` usage names. `ANTHROPIC_API_KEY` → `OPENROUTER_API_KEY`;
`CS_SYNC_MODEL` default → `anthropic/claude-sonnet-5` (OpenRouter ids are
namespaced; confirmed against its live catalog). Nothing outside `llm.ts`
changed — `processUnit`, the read-only allowlist, validation and the queue
are all provider-agnostic.
**Deviations:** none from the ask. One real bug caught by the live test on
its first run: the `X-Title` attribution header carried an em-dash and
`fetch` threw `Cannot convert argument to a ByteString` before the request
left the machine — header values are latin-1 only (D-123).
**Decisions:** D-122, D-123
**Next:** unchanged — the user runs the first real sync themselves once the
remaining Refold/ingest secrets are set and the kill switch is flipped off.
**Issues:** the OpenRouter key was handed over in plaintext in a chat
transcript, so it is parked for rotation before go-live (same category as
the Refold key). Verified live with 11 checks (~1.3k tokens, a few cents):
the full two-turn tool-calling round trip — forced tool call → tool result
fed back → final text turn. This is the first time the runner's agent loop
has been proven against a real model at all; the Anthropic path shipped
yesterday was never exercised live.

---

## Session 38 — 2026-10-11 — 7.5-pre2 Session 5: the sync runner
**Built:** Pre-session fix: SKILL.md's domain-only Fireflies skip rule
revised to attribute via domain OR a named account/tenant mention (D-114).
New `cs-sync-runner` Edge Function — the first real caller of the `cs-sync`
skill. Reuses 7.1's `sync_runs`/`sync_state` (never actually driven by any
code before now, D-115); new `sync_settings` (singleton kill switch/cron
time/caps) + `sync_queue` (daily/backfill fan-out); 6 new SECURITY DEFINER
functions (lock/watermark/queue-claim/enqueue/dispatch) + `get_enum_values`.
`pg_cron`/`pg_net` tick every 5 minutes; dispatch authenticates via a
Postgres Vault secret holding the service-role key. The runner builds the
sync context, runs skill.md as an Anthropic tool-use agent (session-token/
MCP for `RESOLVE_ACTIONS`, the deterministic REST path for `EXECUTE_ACTION`
once validated — D-116), proxying every tool call itself so a non-read-only
`httprequest` call is rejected server-side before reaching Refold
(`allowlist.ts`). Output validated (`validate.ts`, reusing `_shared/
dedupe.ts`'s REQUIRED_FIELDS — D-117) with one repair attempt, then posted
to local `ingest`. Scoped (Refresh button) runs synchronously; queued
(pg_cron) runs process one `sync_queue` row per invocation. New `update_
sync_settings`/`enqueue_backfill` `provisioning` actions. Frontend: new
Action Items tab on Account 360 (D-119, nowhere else for its Refresh button
to live), a shared `RefreshButton` component wired into every CS-sync
section (Escalations/Tickets/Projects/Engagements/Action items/Metrics/
health, plus a "refresh everything" header button), and a new `/sync-status`
admin screen (recent runs, settings form, backfill trigger).
**Deviations:** Model id corrected to `claude-sonnet-5` (the instruction
said `claude-sonnet-5-5`, not real — D-118). Two real test-environment bugs
found and fixed while verifying: (1) a default-privilege rule on this
project grants EXECUTE/table access directly to `anon`/`authenticated`, not
just `public` — `revoke ... from public` alone didn't block a direct call;
every revoke now names all three (D-121). (2) the stub-mode e2e fixture's
nonsense `account` value was quietly inflating the "Account match needed"
count a later part of the same e2e test depends on being exactly 4 — fixed
by pointing the fixture at a real seeded account id, and separately seeded
a fixed local-only ingest token (same fixture category as the seeded TOTP
factor) so the stub-mode token stops going stale on every `db reset`.
**Decisions:** D-114–D-121
**Next:** the user runs the first real sync themselves (explicitly not
triggered this session) — then 7.5-pre2 Session 3 (the learning loop
proper), then Session 6 (context-store bootstrap).
**Issues:** `kill_switch` set to `true` on cloud immediately after this
session's migrations shipped, specifically so the new 5-minute pg_cron tick
can't autonomously enqueue anything before the user is ready — flip it off
from `/sync-status` (or ask) when ready to go live. Five Edge Function
secrets (`REFOLD_API_KEY`, `REFOLD_LINKED_ACCOUNT_ID`, `REFOLD_MCP_SERVER_ID`,
`ANTHROPIC_API_KEY`, `CS_HUB_INGEST_TOKEN`) and one Postgres Vault secret
(`cs_sync_runner_auth`, for pg_cron's dispatch auth) are not yet set on
cloud — confirmed via `supabase secrets list`, none exist today beyond the
platform defaults.

---

## Session 37 — 2026-10-11 — 7.5-pre2 Session 4: align the skill + new record types
**Built:** Order changed (D-108, logged last session): Session 4 now runs
before Session 5/first-real-sync/Session 3. Two new CS-sync record types
end to end — `action_item` (reuses standups' `action_items` table, gains
`project_id`/`tenant_id`, a `priority` enum, `owner_text` fallback, the
standard provenance set, its dedupe index, and the `action_items_delete`
policy every other record table has — split across two migrations because
a brand-new enum value can't be used in the same transaction that adds
it) and `engagement` (already-built 7.1 table, pure wiring). New
`resolveOwner()` in `_shared/dedupe.ts` (exact case-insensitive match
against `profiles.full_name`, free-text fallback on no/multiple matches).
`ingest`/`apply_proposal()`/`payload.schema.json`/`docs/ingest-api.md` all
extended; `provisioning`'s held-record release loop extended to validate
both new types at release time (plus a pre-existing metric/health gap
found and fixed there too — D-111). `skills/cs-sync/` fully revised
(Slack/Gmail/Fireflies/Zendesk/Drive rules, `httprequest` read-only hard
rule, account/tenant "send your best guess, let the Hub hold it" rule,
`learnings`-following contract) against the real daily-CS-workflow
skill's rules (read locally, never committed) plus this session's live
Slack-connector discovery (D-112). `refold-skill.md` regenerated — the
file for Refold → MCP → CS Hub → Skills.
**Deviations:** Ingest API field names for `action_item` are
`description`/`due_date`, not the task wording's `task`/`due` — matching
the table's real columns (D-109; the mismatch would have broken dedupe
silently). Two real bugs found+fixed during testing: array fields compared
by reference not value, and `engagement_date` missing from `DATE_FIELDS`
(D-110). The `httprequest` read-only rule is documented but not yet
enforced in code — that's an explicit Session 5 runner requirement, not a
gap in this session's scope. An early real-data check against Fireflies
(local-only token, reset after) found most meetings in-window are
internal with no identifiable customer domain — folded into the skill as
a new `skip` rule rather than routing those through `account_resolution`
(D-113).
**Decisions:** D-109–D-113
**Next:** 7.5-pre2 Session 5 — the runner + unauthorized-connector skip.
**Issues:** none outstanding from this session's own scope.

---

## Session 36 — 2026-10-11 — 7.5-pre2 Session 2: "Account match needed"
**Built:** `held` proposal status + `account_resolution` meta-proposals
(`proposals.blocked_by_resolution_id`); two race-safety indexes mirroring
7.4's `proposals_pending_dedupe`, shipped as 2 migrations (Postgres won't
let a brand-new enum value be used — e.g. in a partial index's WHERE — in
the same transaction that added it). Extracted `ingest`'s dedupe/upsert
tree into `supabase/functions/_shared/dedupe.ts`; new `resolve_account_
proposal` provisioning action (map_existing / map_tenant / create_account
/ ignore) releases every held record through that same shared logic
rather than a second copy. `sync_learnings` pulled forward minimally from
Session 3 (table + `alias_map`/`ignore` write paths only). Approvals inbox
gained a pinned "Account match needed" section + one resolve modal
covering all 4 decisions.
**Deviations:** the shared-module extraction ended up broader than
approved — releasing a held record needs the same *validation* (required
fields, `KNOWN_FIELDS`, project/tenant lookups) `ingest` uses, not just
the dedupe tree, so that schema knowledge moved to `_shared/` too (D-105).
`resolve_account_proposal` is a `provisioning` action, not an
`apply_proposal()` extension, despite the original instruction saying to
extend `apply_proposal` — same reasoning 7.3 already uses to exclude
`asks`/`engagements`/`projects` from it (D-107).
**Decisions:** D-104–D-107.
**Next:** 7.5-pre2 Session 3 — the learning loop proper (agent-written
`rule`/`example` kinds, the admin "Sync learnings" screen, guardrails) —
awaiting go-ahead.
**Issues:** `npm run e2e` caught a real bug unrelated to a specific line
change — a side effect of adding `account_resolution` proposals at all:
they showed up in the normal Approvals list (status is just `pending`
like any other) and rendered a generic "Approve" button that would always
fail against `apply_proposal()`'s allow-list. Fixed by excluding
`target_table = 'account_resolution'` from the default proposals query —
it only ever surfaces through the pinned section now.

---

## Session 35 — 2026-10-11 — 7.5-pre2 Session 1: accounts & tenants are the only truth
**Built:** plan first (large task — proposed and got approval for a
6-session split, plus 4 clarifying questions on judgment calls), then only
Session 1. Derived from two local confidential sources, read for structure/
rules only and never committed: the real daily CS workflow's skill and its
context store — surfacing a known flaw (the agent invents/duplicates
accounts, treating an end-customer program as its own account). New
`tenants` table (an end-customer/program/sub-account — never an account)
and `account_sources` (structured, exact-match identifiers per account and
per tenant, editable in Account 360) supersede `organizations.aliases` for
matching; `ingest`'s account/tenant resolution and `apply_proposal()`
updated accordingly. Checked and ruled out two candidate reuses before
adding a table: `projects` (delivery concept, orthogonal) and the on-prem
`NamespaceOrg` (frozen-portal mock-data concept, never a real table).
`dormant` added as a new `lifecycle_stage` enum value; "unverified"
deliberately reuses the existing `verified_at is null` (7.2b) rather than a
second mechanism. `tenant_id` added to 9 record tables (D-102). Also did
this session's own connector discovery (full Refold action catalogs for
Slack/Gmail/Fireflies/Zendesk) to ground the 6-session plan — confirmed
Zendesk/Fireflies genuinely have no list/search action (not an attachment
gap) but found and live-confirmed a working `httprequest` deterministic
workaround for Fireflies.
**Deviations:** `tenant_id` added to `engagements`/`asks` too, beyond the
7 tables originally scoped (D-102) — flagged, not silently expanded.
Found mid-session that `engagements` already existed from 7.1 (the
approved plan's "genuinely new table" assumption for a later session was
wrong — D-103). Found and fixed a real bug in my own migration before
reporting it: the aliases→account_sources backfill runs during migrations,
before local fixture aliases are seeded (seeds run after migrations on
`db reset`), so it works correctly on cloud but needed a matching local-
fixture insert to backfill correctly on a fresh local reset too.
**Decisions:** D-100–D-103.
**Next:** 7.5-pre2 Session 2 — "Account match needed" (held proposals +
the account-resolution Approvals flow) — awaiting go-ahead, per the
approved session split.
**Issues:** `npm run e2e` surfaced 3 pre-existing latent bugs, unrelated to
this session's feature code, never caught before because this repo's e2e
suite had apparently never actually run against a 100%-pristine `db
reset` before now: on a genuinely empty list, the Ingest Tokens/Standups/
People EmptyState headings ("No ingest tokens"/"No standups yet"/"No
people yet") substring-match their page's own exact-match heading
assertion. Fixed with `exact: true` on those three assertions.

## Session 34 — 2026-10-10 — 7.5-pre: Refold MCP discovery + finalize cs-sync
**Built:** discovery and documentation only — no app code, no schema, no
runner. Authenticated against the real Refold API (session-token flow,
test environment, `tk…` key) and connected live to the org's one MCP
server ("CS Hub", `mode: agent`, `expose_skills: false`,
`interactive_auth: false`) over streamable HTTP JSON-RPC. Confirmed the
agent-mode tool contract (`RESOLVE_ACTIONS`/`EXECUTE_ACTION` only — no
skill-index tools), the undocumented-until-now `linked_account_id` header
requirement on `tools/call`, and a deterministic non-LLM REST execute path
(`/api/v2/integration-schema/{slug}/actions/{action_id}/execute`, outer
HTTP status always 200 regardless of outcome). Resolved real action IDs
and input schemas for every planned capability. Read the CS Hub's own
Postgres enums and `metric_definitions` directly to fill
`allowed_values`/`metric_key` lists. Finalized `skills/cs-sync/` (SKILL.md,
reference/tool-map.md, reference/record-types.md) against all of the
above, removed the DRAFT markers, and generated
`skills/cs-sync/refold-skill.md` as one merged Goal/Pre-checks/Steps/
On-success/On-failure document ready for manual paste into Refold → MCP →
CS Hub → Skills → Add Skill (no skill CRUD API exists — confirmed from the
full OpenAPI spec). Tested `health:<account id>` dedupe end-to-end against
a local `db reset` + local ingest token (duplicate_skipped →
proposed_update → updated_pending, exactly as `docs/ingest-api.md` already
specifies). New `docs/refold-mcp.md` documents the connection mechanics
(auth flow, endpoint form, mode, limits, the deterministic option) with no
secrets and no customer content.
**Deviations:** Step 7 ("hand-run the skill for one real account × tickets,
post to local ingest") couldn't use real Zendesk data — Zendesk isn't
connected for the `cs-hub` linked account (see Issues). Used one
fictional-but-schema-valid ticket record instead, following
`record-types.md`'s own mapping, to validate the skill-output →
`payload.schema.json` → local-ingest pipe. This proves the pipe, not
Zendesk connectivity — stated explicitly, not silently substituted.
**Decisions:** D-097–D-099. Parked: rotate the Refold API key (exposed in
an earlier planning chat, per the session owner — not this session, which
only ever read its length/prefix); stand up a production (`pk…`) key +
server/account before go-live.
**Next:** 7.5 proper (runner + Refresh + daily job) — proposed plan below,
awaiting go-ahead. Nothing in this session is a blocker for writing the
plan; the four gaps below are blockers for the runner actually *producing*
synced records once built, not for building it.
**Issues:** Four real connection/app-admin gaps, confirmed live, all fixed
by Refold-dashboard/app-admin work rather than code: (1) Zendesk and Gmail
show `connected: false` for the `cs-hub` linked account — every call fails
"Application Authentication not found"; (2) the connected Slack identity
(bot) is not a member of any channel in the workspace, so channel-history
reads return `not_in_channel` for every channel tried, customer channels
included; (3) Slack's `search_messages` needs a user-scope token and this
connection is bot-token-based (`not_allowed_token_type`) — structurally
unavailable, not a permissions fix; (4) the org has zero Refold workflows
published, so the `metric` record type has no source at all, deterministic
or agent-driven. Also: neither Zendesk nor Fireflies exposes a list/search
action — only get-by-id — so "what changed since `since`" has no direct
answer for tickets or meeting transcripts without another signal supplying
the id first; this is a design input for the runner (lean on Slack/email
discovery to surface ids), not fixable by a Refold-side connection change.

### Proposed 7.5 plan (runner + Refresh + daily job) — awaiting go-ahead

**Runner design.** A new Edge Function (or a `pg_cron`-invoked one) builds
the **sync context** per `skills/cs-sync/SKILL.md`'s contract from CS Hub
state (`sync_state` watermarks, account aliases/projects, `known_records`
for in-flight items, `metric_definitions`, `allowed_values` read live from
the enums/table confirmed this session), calls the Anthropic API with the
`cs-sync` skill loaded and that context as the prompt, parses the model's
single JSON reply, and POSTs `{run, records}` to `/functions/v1/ingest`
using a dedicated production ingest token (7.4). `skipped` entries are
logged, never sent to ingest.

**Deterministic vs. LLM-driven, given what this session found.** Nothing
is fully deterministic yet — even ticket-by-id and metric pulls (the two
candidates) have no deterministic *discovery* step (no list/search action,
no workflow at all for metrics). Until those exist, every sync run is
LLM-driven: the model decides what to fetch and how to read it, using
`RESOLVE_ACTIONS`/`EXECUTE_ACTION` through the MCP connection. Once a
Zendesk "tickets updated since" action or a metrics workflow exists, that
one record type's *fetch* step can move to the deterministic REST execute
path while extraction/mapping stays the same — worth revisiting then, not
blocking the runner now.

**Secrets needed (as Supabase project secrets, not `.env`):**
`REFOLD_API_KEY`, `REFOLD_LINKED_ACCOUNT_ID`, `REFOLD_MCP_SERVER_ID` (this
session's three, promoted from local `.env`), an Anthropic API key (new —
the runner calls the model directly, this repo has never needed one
before), and a dedicated production **ingest token** (7.4's
`create_ingest_token`, scoped and labeled for the runner, not a human's
token).

**Watermarks.** `sync_state` (one row per account × record type) already
exists from 7.1 — `last_synced_at`/`status`/`error`/`lock`. The runner
reads it to build each unit's `since`, advances it only on a `success`
outcome from ingest (never on `partial` for that unit, so a failed record
type gets retried, not silently skipped forward), and the lock prevents two
runs for the same unit overlapping (on top of 7.4's
`proposals_pending_dedupe` index, which is the last-resort backstop, not
the primary guard).

**Refresh buttons.** A `scoped` sync for one account × one record type,
triggered from that record's screen, `triggered_by` = the clicking
super-admin's own profile id (now that 7.4 validates this against real
super_admin profiles) — should show "last synced …" using `sync_state`
immediately, consistent with build-spec-v3 §4.4.

**Daily job.** `pg_cron` on a schedule, `mode: daily`, iterating every
account × record-type unit whose watermark is stale — same runner code
path as Refresh, just invoked on a timer instead of a click, per
build-spec-v3 §4.4's "one code path" rule.

**Cost / limit guards.** A per-run cap on units processed (to bound both
Anthropic spend and MCP call volume per invocation); skip (not fail) a
unit whose capability is known-blocked per this session's findings
(Zendesk/Gmail/metrics) rather than burning a model call attempting it
every single day until the connection gap is fixed; log token usage per
run for later cost visibility — no dashboard for it yet, just the data.

**Given this session's findings, the realistic first real-data run** will
only produce Slack-channel-sourced records (escalation/risk/milestone/
accomplishment/health) once the bot is invited into at least one real
customer channel — tickets, email, and metrics stay blocked until their
respective connection/workflow gaps are closed. Recommend treating "invite
the Slack bot to customer channels" as this plan's actual critical path,
not a footnote.

---

## Session 33 — 2026-10-09 — 7.4 Ingest API
**Built:** per build-spec-v3 §6, revised through 3 rounds of plan feedback
(go-ahead points preserved in full in the plan file this session started
from). One migration: `ingest_tokens` (select super-admin-only, **no**
insert/update policy for `authenticated` at all — credential material,
minted only via two new `provisioning` actions), `sync_runs`/
`proposals.ingest_token_id` traceability FKs, a partial unique index
(`proposals_pending_dedupe`) as the race-safety backstop. New `ingest`
Edge Function (`verify_jwt = false` in `supabase/config.toml` — the
function's own `cshub_`-token lookup is the only gate, proven both locally
and against the deployed cloud function: a request with no/garbage
`Authorization` header returns `401` from the function's own code, and
production carries **no** CORS header at all, confirming the earlier local
observation of one was purely the local Kong dev-proxy, not the function).
Implements the full upsert/dedupe decision tree (pending-merge →
previously-rejected-skip → real-row compare-or-update-propose → create),
normalized equality comparisons (dates/numbers/strings/enums, caller-sent
fields only), `superseded_pending` for a delete against a still-pending
create, 200-record/2MB limits (body size enforced while streaming, not via
`Content-Length`), and privacy-safe logging (ids/counts/codes only, never
request bodies or record data). Minimal admin UI: `/ingest-tokens` (new
nav item under "Admin") — create (label, expiry capped at 365d, optional
account scope), one-time plaintext reveal with copy, revoke; new
`src/hooks/useIngestTokens.ts`.
**Deviations:** none from the final approved plan. One real bug found
during the throwaway verification script (not a plan deviation, an
implementation bug caught by testing): required-field validation ran
before the `delete` branch, so every delete (whose `data` is `{}`) failed
validation before reaching delete-handling logic at all — fixed by moving
the delete branch before the known/required-field checks, which apply only
to create/update.
**Decisions:** D-091–D-096 (token scheme + verify_jwt; upsert/dedupe tree +
race index; `run.source` reuse; equality normalization; `superseded_pending`;
no-CORS + logging privacy). Parked: per-token rate limiting.
**Verified:** fresh `db reset`; a throwaway Node.js script exercising every
outcome status + edge case in the approved plan's verification list (all
pass after the delete-ordering fix); confirmed no request body/record
data/evidence ever appears in function logs; `rls_test.sql`'s new ingest-
tokens block (super-admin read-only, customer roles 0 rows, direct client
insert rejected) + all 6 prior blocks green; `smoke-login.ts` all 3 roles;
`npm run e2e` green (extended to create/reveal/revoke a token);
typecheck/lint/build green. Cloud: `db push --dry-run` matched exactly 1
migration; migration list 30/30 local=remote; `ingest` deployed new
(`verify_jwt: false` confirmed via `functions list`) + `provisioning`
redeployed; a live `curl` against the deployed `ingest` function confirmed
the 401-from-our-code behavior in production too.
**Next:** 7.5 — CS Sync Skill + runner + Refresh (was 6.5) — the first
actual caller of this endpoint; blocked on Refold MCP server details.
**Issues:** —

## Session 32 — 2026-10-09 — Standups (Part 3) + People activity (Part 4) + 2 cleanups
**Built:** the design was already decided (D-081–D-086, product-overview.md
§5.7/§12) — this session builds it, no redesign.
- **Standups:** one migration — `standups` (host, date, no `org_id` — spans
  whichever accounts its participants hold roles on), `standup_entries`
  (one per participant, `unique(standup_id, profile_id)`; the one RLS
  policy in the whole schema checking more than `is_super_admin()`/
  `is_aal2()` — a participant writes their own entry, the host writes any
  entry in their own standup, everyone else still reads it but can't
  write), `action_items` (shared artifacts like asks/escalations — any
  super admin can create/reassign/close one; "carry over until done" means
  no auto-transition, ever). No Edge Function changes — same direct-client-
  write-under-RLS pattern as `account_roles`.
- **Remembered participants:** reuses `saved_views` (it already anticipated
  `page='standups'` in its own column comment) — `page=
  'standup_participants'`, `filters: {participantIds}`, upserted on every
  standup start. Default: remembered set → direct reports → empty (the one
  judgment call the design left open, stated explicitly as D-088).
- **Deterministic "since last standup" draft:** per participant, since
  their last entry (or 24h if none) — audit-actor activity, new
  escalations/tickets, due milestones on their active accounts. Feeds
  Yesterday only; Today/Blockers start blank.
- `/standups` (history + "Start a standup") + `/standups/:id` (board, live
  mode with a timer, "turn blocker into an ask/action item") — added to
  primary nav.
- **People activity:** extended the existing per-person slide-over
  (`PeoplePage.tsx`) with recent activity (audit actor), open action items,
  recent standup entries — role history was already there. No scores — and
  confirmed, not newly built, that every input the future KPI block will
  need is already captured (`account_roles` history, `project_members`,
  audit actor, approvals, standups).
- **Cleanup 1 (docs):** product-overview.md §6's journeys (J1–J10)
  rewritten off "Head of CS"/"Team" framing into scenarios any CS admin
  runs. Grepped both docs for `Head of CS`/`title`/`team lead`/`Team
  structure`/`owner_profile_id`; found and fixed one genuine remaining
  contradiction (§5.12 gated audit-log CSV export to "(Head of CS)",
  contradicting the already-rewritten §8 permissions matrix).
- **Cleanup 2 (required, net-new):** `@playwright/test` + headless Chromium
  — nothing existed before (no test runner at all). `tests/e2e/
  smoke.spec.ts` signs in through the real login form and the real MFA
  **challenge** screen (not enrollment) using a pre-verified TOTP factor
  seeded with a fixed, known secret directly into `auth.mfa_factors`
  (confirmed plain-text locally by direct inspection — local-only fixture,
  nothing about production auth weakened). Clicks through Home → Portfolio
  → an Account 360 (every tab + adds a project) → Approvals (approves one)
  → Audit log → Standups (starts one, edits an entry, opens live mode) →
  People (opens a person's activity view). `npm run e2e` joins CLAUDE.md's
  end-of-session protocol.
**Deviations / real findings along the way:**
- The e2e suite **caught a genuine regression from last session**: the
  People directory's `fetchPeopleDirectory()` tried to embed
  `profiles!profiles_reports_to_fkey(full_name)` — a self-referential FK
  embed. Confirmed by direct API testing: PostgREST's own ambiguity error
  *suggests* exactly that hint, then 400s when you actually use it ("could
  not find a relationship... in the schema cache") — a genuine PostgREST
  self-join limitation, not a typo. The whole People page had been
  silently broken since equal-admins Parts 1–2 shipped; no UI test existed
  then to catch it. Fixed by resolving the name client-side (logged as
  D-090; extends the D-068 coding rule).
- Seeding a verified TOTP factor has a side effect: every prior throwaway
  verification script's `enroll()`-based AAL2 helper now fails for
  `super@refold.internal` ("AAL2 required to enroll a new factor") since a
  verified one already exists. Future ad hoc scripts for this user must
  challenge the seeded factor instead (documented in D-089).
- Three test-writing bugs surfaced and were fixed during the run itself (a
  stale dev-server port, an unlabeled form input needing a positional
  selector instead of `getByLabel`, and the Audit Log link being inside
  the collapsed "Admin" disclosure) — normal test-authoring iteration, not
  app bugs; none needed an app-code change except the PostgREST one above.
- The host machine's documented memory pressure (11.3GB/12GB swap) caused
  one Vite dev-server hang mid-run. Confirmed via direct `curl` polling
  that the server had genuinely stalled rather than assuming the test was
  broken; it recovered on its own and every subsequent run was fast (3–4s)
  and stable. Not glossed over, not blindly retried either.
**Verified:** fresh `db reset`; `rls_test.sql`'s new standups block (a
participant can edit their own entry but not someone else's; the host can
edit any entry in their own standup; an unrelated super admin can read but
not write; action items default to `open` and persist through a `done`
transition; customer roles see 0 rows across all 3 tables; the generic
audit trigger fires on each) plus all 5 prior blocks, still green;
`smoke-login.ts` all 3 roles; `npm run e2e` green (twice, for reliability);
typecheck/lint/build all green.
Cloud: `db push --dry-run` matched exactly 1 migration; `migration list`
29/29 local=remote; no Edge Function changes, no redeploy needed.
**Decisions:** D-087–D-090
**Next:** 7.4 — Ingest API (or whichever the planning room picks next —
Parts 1–4 of the equal-admins plan are now complete).
**Issues:** none outstanding from this session's scope. Performance
indexes/KPIs remain deferred to Phase 10 with gamification, per D-085's
Parked note (now confirmed input-complete, not newly built).

---

## Session 31 — 2026-10-09 — Equal admins: people simplification (Part 1) + Home (Part 2)
**Built:** the Head of CS reversed 7.2a's hierarchy direction entirely — no
internal org chart, no titles, no RBAC by role; a person's involvement in
an account is a per-account role tag for record-keeping, with history;
`reports_to` is optional and permission-free. Per the prompt's own escape
valve ("if it's too large, ship Parts 1–2, stop, report"), this session
shipped **Part 1** (people simplification) and **Part 2** (Home) only —
Standups (Part 3) and People activity/KPIs (Part 4) are designed in docs
but not built (Parked).
- **Schema** (one migration, `20261009000002_equal_admins.sql`): read-only
  `supabase db dump` confirmed `teams`/`team_members`/`account_assignments`/
  `project_members`/`proposals` all 0 rows on cloud and every
  `profiles.title`/`organizations.owner_profile_id` NULL — so every drop
  below is a guarded assert-empty-then-drop (D-071's `projects.fdes`
  precedent), not a conversion. Dropped: `account_assignments` + its 2
  owner-derivation triggers + `compute_org_owner()`; `teams`/`team_members`;
  `organizations.owner_profile_id`; `profiles.title` (+ its CHECK). Added:
  `account_roles` (profile, org, role, started_at, ended_at — one active
  per pair via a partial unique index, no DELETE policy at all — history is
  permanent); `profiles.reports_to` (self-FK, CHECK + a cycle-detection
  trigger). Scope helpers rewritten against both: `my_account_ids()`,
  `my_team_account_ids()` (own + direct reports' active accounts),
  `person_account_ids()`; `team_account_ids`/`team_project_ids`/
  `my_team_project_ids` dropped (confirmed zero call sites first).
- **Edge Function:** `set_title` removed, `set_reports_to` added (same
  D-043 column-grant-lockdown slot, audited); redeployed.
- **Frontend:** `usePeople.ts` + `useSavedViews.ts` replace
  `useTeamStructure.ts`; `TeamStructurePage.tsx` → `PeoplePage.tsx`
  (`/people` — directory, reports_to picker, active roles editable inline,
  role history); `ScopeSwitcher` drops the "specific team" picker and
  relabels "Mine" → "My accounts", "My team" shown only via `useHasReports`;
  `SavedViewsMenu` drops pinning; Portfolio + Account 360 get "Add to my
  accounts"/"Leave account" and an EDL column/header reading live from
  `account_roles` (no more `ownerProfileId`); nav reordered (Home first,
  `homeRoute()` follows) with a new collapsed-by-default "Admin" disclosure
  in `Sidebar.tsx` (Audit Log, Users & Roles, Feature Flags, Deployments).
- **Home** (`/home`, new `useHome.ts`): My accounts at a glance (health, my
  role, "activity in last 24h" from `audit_log` — an honest proxy, not a
  true health diff); Needs attention (pending approvals, milestones due/
  overdue, open escalations, open P1/P2 tickets, 14+ day no-engagement,
  30+ day stale coverage — each scoped by the page's own `ScopeSwitcher`);
  My reports (only if `useHasReports`); Recent activity (last 24h,
  scoped).
- **Fixtures** (local, fictional): Prism gets two FDEs on one account
  (overlap case) and an ended role for Owen (history case); Tomás
  `reports_to` Reza. `rls_test.sql`'s now-obsolete 7.2a block (title/teams/
  old scope helpers) removed outright rather than patched.
**Verified:** fresh `db reset`; `rls_test.sql`'s new "equal admins" block
PASS (one active role per pair enforced; changing role preserves history;
delete is a no-op — no policy grants it; any super admin can manage anyone's
roles; customer roles see 0 `account_roles`; the generic audit trigger
fires; self-reference and a 2-cycle both rejected; `my_account_ids`/
`my_team_account_ids`/`person_account_ids` return the right sets including
the no-roles/no-reports empty case) alongside all 4 pre-existing blocks,
still green; `smoke-login.ts` all 3 roles; typecheck/lint (0 errors)/build
green. A throwaway script exercised `set_reports_to` (happy path, self-ref
rejected, cycle rejected) through the real Edge Function, plus add/end/
change-role and the Home page's underlying queries, against the real API.
Cloud: `db push --dry-run` matched exactly 1 migration; applied cleanly
(proving the 0-row guards held); `migration list` 28/28 local=remote;
`provisioning` redeployed (its action set changed).
**Deviations:** none from the approved plan. Docs addendum done in full
(both files) regardless of the Part 3/4 deferral, per the prompt's explicit
"required, not optional."
**Decisions:** D-081–D-086
**Next:** Part 3 (Standups) and Part 4 (People activity + deferred
performance indexes/KPIs) — both designed in docs this session, not built.
**Issues:** same no-browser-automation-tool gap as the last two sessions —
UI not click-tested interactively. product-overview.md's journeys (§6,
J1/J3/J9/J10) still narrate "Head of CS"/"FDE"/"Team" scenarios — out of
the addendum's explicitly listed sections, left as illustrative prose
rather than silently rewritten; flagged for a future pass if it reads as a
contradiction.

---

## Session 30 — 2026-10-09 — 7.3: Approvals inbox + audit log screen
**Built:** closes the write-pipeline loop (build-spec-v3 § 3). The real
design question was what "approve" does — the spec says it applies the
change, and the audit trail needs literal `action='approve'`/`'reject'`,
which the generic trigger can't produce on its own. Built two SECURITY
DEFINER functions instead of a client-side status flip:
`apply_proposal(proposal_id, decided_by, payload_override)` and
`reject_proposal(proposal_id, decided_by, reason)` (migration
`20261009000001_apply_proposal.sql`). `target_table` is checked against a
fixed allow-list matching § 3.1's pending kinds exactly — milestones,
accomplishments, risks, escalations, tickets, metric_values (create/update/
delete), organizations (update only, health changes) — one explicit branch
per table rather than dynamic SQL, so there's no identifier-injection
surface and a disallowed table raises instead of silently doing nothing.
Each function applies the change, marks the proposal decided, and writes
one explicit `audit_log` row with the real action, all as one transaction.
- **`/approvals`:** filter bar (type/source) + ScopeSwitcher/SavedViewsMenu,
  a card per pending proposal (proposer, source, evidence, before→after
  diff fetched live from the target table), Approve / Edit then approve
  (pre-filled form, calls apply with the edited payload) / Reject (reason
  required), checkbox + bulk-approve.
- **`/audit-log`:** filter bar (table/action/date range) + ScopeSwitcher,
  paginated `DataTable` of who/action/record/account/changed-fields, CSV
  export (a small client-side builder — nothing like it existed yet).
- **Nav:** `usePendingProposalCount` renders a live badge on the Approvals
  item (hidden at 0, per spec).
- **Fixtures:** 7.1's `phase7_demo_data.sql` already seeded 2 pending
  proposals (both 'create' — I'd missed this on first pass). Added 3 more,
  local-only (`seed_proposals.sql`), covering 'update' and 'delete' so
  edit-then-approve and reject are actually exercisable, not just creates.
**Verified:** fresh `db reset`; `rls_test.sql` all 5 blocks PASS (new block:
AAL1 and non-super-admin rejected; approving the milestones proposal
actually updates the row *and* writes exactly one `action='approve'` audit
row; rejecting leaves the target table untouched and writes
`action='reject'`; an `insert`ed disallowed-table proposal (`profiles`)
raises rather than no-op-ing; customer roles see 0 proposals);
`smoke-login.ts` all 3 roles PASS; typecheck/lint (0 errors)/build green.
A throwaway script ran the full approve/edit-then-approve/reject/bulk flow
against the real API — confirmed the edited payload wins over the original
on edit-then-approve, the rejected ticket survives, the pending count drops
from 5 to 0, and `audit_log` shows exactly 4 approves + 1 reject.
Cloud: `db push --dry-run` matched exactly 1 migration; `migration list`
27/27 local=remote; no Edge Function changes this block.
**Deviations:** none from the approved plan, beyond the fixture-overlap
correction above (planned 5 new proposals, shipped 3, since 2 already
existed).
**Decisions:** D-080
**Next:** Home + per-team Standups + Team (FDE performance) — pulled ahead
of Phase 8.
**Issues:** same no-browser-automation-tool gap as 7.2b (see CLAUDE.md) —
verified at the API/RLS/schema layer, not click-tested. The Approvals inbox
will stay thin on real data until 7.5/7.6/7.8 ship actual proposal
producers (chat agent, agentic sync, file import).

---

## Session 29 — 2026-10-08 — 7.2b: Portfolio + Account 360
**Built:** the two screens a CS person actually works in day to day
(build-spec-v3 § 6; product-overview § 5.2–5.3), on top of 7.1's schema and
7.2a's scope/saved-views plumbing.
- **Portfolio** (`/portfolio`): Board tab is the account list — grouped by
  segment, filterable (segment/health/lifecycle), `ScopeSwitcher` +
  `SavedViewsMenu` wired in, each row showing health/lifecycle/deployment/
  owner/open-escalations/next-milestone/last-engagement/coverage%. "Add
  account" (no invite, direct `organizations` insert). Key milestones +
  Recommendations+impact sections (`portfolio_notes`). Coverage tab: a
  7-section (projects/milestones/risks/escalations/tickets/engagements/
  metrics) current/stale/missing matrix per account.
- **Account 360** (`/accounts/:orgId`): header + 6 tabs — Overview (health
  with reason, mark verified, open escalations, next milestones, recent
  activity from `audit_log`), Projects (project cards with nested
  milestones/accomplishments/risks/asks, inline add/remove, an EDL/FDE/TA
  assignment slide-over fulfilling 7.2a's deferred `project_members` UI —
  D-077), Escalations (add/resolve), Tickets (manual add — sync is 7.5),
  Engagements (log/timeline), Metrics (enter value per period, grouped by
  category). Every row carries a `SourceBadge` (source + "verified Nd ago").
- **Schema:** one migration — `organizations` gained `health_reason`,
  `verified_at`, `updated_by` (the one real gap found planning this block;
  every other table this screen touches already shipped in 7.1). New hook
  file `usePortfolio.ts` (~40 functions: reads + direct-write CRUD across
  accounts/projects/milestones/accomplishments/risks/asks/escalations/
  tickets/engagements/metric_values/portfolio_notes/project_members), new
  `SourceBadge` component, nav + router entries.
**Verified:** fresh `db reset`; `rls_test.sql` all 4 blocks PASS (new block
covers the `organizations` AAL2 gate on the 3 new columns + customer-role
zero-rows on account-record tables not yet individually asserted —
engagements/metric_values/portfolio_notes/milestones/accomplishments/asks);
`smoke-login.ts` all 3 roles PASS; typecheck/lint (0 errors)/build green. A
throwaway script exercised every write path in `usePortfolio.ts` against the
real AAL2-protected API end to end (account → project → project_member →
milestone → accomplishment → risk → ask → escalation + resolve → ticket →
engagement → metric value → portfolio note), confirmed the generic audit
trigger fires on the new writes, and confirmed the `organizations` columns
round-trip correctly. **No browser-automation tool is available in this
environment, so the UI itself was not click-tested end to end** — flagged
explicitly rather than claimed; everything above the rendering layer (RLS,
schema, the exact queries/mutations the components call) is verified
directly against the real API.
Cloud: `db push --dry-run` matched exactly 1 migration; `migration list`
26/26 local=remote; no Edge Function changes this block, no redeploy needed.
**Deviations:** two scope calls not spelled out in the spec, both logged as
decisions rather than silently assumed — Portfolio's board *is* the account
list (no separate "Accounts" screen this block), and the cross-account
"Projects" nav item (product-overview § 5.6) is deferred, since it's not in
build-spec-v3's 7.2b bullet list and Account 360's Projects tab covers
per-account work already.
**Decisions:** D-079
**Next:** 7.3 — Approvals inbox + audit log screen.
**Issues:** no browser-based manual QA this block (tooling gap — see
Verified, above). "Pending approval" never shows in the coverage matrix yet
(needs 7.3's proposals/approvals data). Standalone Projects screen and a
distinct "Accounts" nav item remain deferred (D-079).

---

## Session 28 — 2026-10-08 — 7.2a: people, teams, assignments, scoped views
**Built:** the people-and-permissions foundation 7.2b builds on (build-spec-v3
§ 5 "People, teams and views"; docs/product-overview.md). Supersedes the
previous session's single-7.2 plan — now split 7.2a (this)/7.2b (D-076).
- **8 append-only migrations:** enums (profile_title/assignment_role/
  saved_view_scope); `profiles.title` (super_admin only, CHECK-constrained);
  `teams`/`team_members` (surrogate id on team_members so the generic audit
  trigger populates a real record_id, D-072); `account_assignments` +
  `organizations.owner_profile_id` turned into a DERIVED column (primary EDL →
  else primary TA → else NULL) enforced by a force-overwrite trigger, not
  convention (D-070); `project_members` replacing `projects.fdes`/
  `edl_profile_id` via a GUARDED DROP (fails loudly if any data exists, rather
  than fuzzy name-matching — D-071); `saved_views` (owner-only RLS, no audit
  trigger — personal preferences, D-072); 8 scope-helper SECURITY DEFINER
  functions (my/team/person/my_team × account/project) — focus only, never
  access control (D-073); an 8th migration hotfixing an `audit_log` grant
  regression found during this session's own verification (D-078).
- **Edge Function:** new `set_title` super_admin+AAL2 action (D-069), same
  shape as `assign_sub_role`/`set_user_status`; `writeAudit()` fixed to write
  `record_table`/`record_id` (was still writing the pre-7.1 column names,
  D-078); redeployed.
- **UI:** `/team-structure` (super_admin nav item) — People (set title),
  Teams (create/edit/members), Accounts (assign EDL/TA/FDE + primary). New
  `ScopeSwitcher` + `SavedViewsMenu` components + `useScope(page)` hook
  (localStorage-persisted, default-resolution chain D-074) wired into the
  Accounts list as the proof surface. Project-members UI deferred to 7.2b's
  Account 360 (D-077).
- **Types:** `Profile`/`ManagedUser` gained `title`; new `Team`/`TeamMember`/
  `AccountAssignment`/`ProjectMember`/`SavedView` + composed `TeamSummary`/
  `AccountAssignmentRow`. `Project.fdes`/`edlProfileId` removed.
- **Fixtures:** 6 fictional CS people (local only, full login-capable — D-069),
  2 teams (one FDE in both, exercising the multi-team union), assignments
  across both fictional accounts. Cloud demo-data script updated to write
  `project_members` instead of the dropped columns.
**Verified (honest):** read-only `supabase db dump --data-only` against cloud
BEFORE pushing confirmed `projects` had 0 rows (no `INSERT` in its data
section) — the guarded drop was safe. A throwaway `set_title` script
(not committed) first caught the audit row silently missing — traced to
`service_role` having lost `insert` on `audit_log` (D-064, last session) and,
once that was fixed, to `writeAudit()` still writing dead pre-7.1 column
names — both fixed this session (D-078) and re-verified clean. Final
verification, all against a fresh `db reset`: `rls_test.sql` all 3 blocks
PASS (title not self-editable; owner_profile_id force-override proven
directly; team_members' surrogate-id audit trail proven; saved_views private
per owner including a blocked cross-owner insert; all 8 scope helpers return
the exact expected sets — Reza/Tomás/Owen/Grace/Dana, including the
multi-team union and the empty-set case; customer roles see zero rows across
all 5 new tables); the `set_title` script's full 6 checks PASS (AAL1/
non-super-admin/invalid-title/non-super_admin-target rejections, happy path,
and the audit row — now present); `scripts/smoke-login.ts` all 3 roles PASS.
`db push --dry-run` matched exactly the 8 migrations (7 planned + the
hotfix); real push applied cleanly; `migration list` confirmed 25/25
local=remote; `functions deploy provisioning` succeeded.
**Deviations:** found and fixed a real regression from last session (D-064)
during this session's own verification — see D-078. No deviation from the
approved (amended) 7.2a plan itself.
**Decisions:** D-069–D-078
**Next:** 7.2b — Portfolio + Account 360.
**Issues:** —

## Session 27 — 2026-10-07 — HOTFIX: production login broken (PGRST201)
**Symptom:** live site sign-in succeeded (token returned) but the app stayed
on `/login` for everyone — the profile-load query failed with `300 PGRST201`
("more than one relationship was found for 'profiles' and 'organizations'").
**Cause:** 7.1 added `organizations.owner_profile_id → profiles`, giving
`profiles`/`organizations` a second relationship alongside the original
`profiles.org_id → organizations`. `AuthProvider.loadProfile()`'s unqualified
`organizations(...)` embed became ambiguous.
**Built:**
- Fixed the one affected call site: `AuthProvider.tsx` →
  `organizations!profiles_org_id_fkey(...)`. Response key is unchanged
  (`organizations`), so no other code touched.
- Audited every other `.select()` embed in `src/` (2× `profiles→sub_roles`,
  1× `invitations→organizations`) against the full FK graph across every
  migration — all three confirmed single-relationship, left unchanged.
  `supabase/functions/provisioning` has zero embeds — no redeploy needed.
- New `scripts/smoke-login.ts` (committed, env-var credentials, no passwords
  in the repo): signs in as each demo role and runs the exact AuthProvider
  profile query. Added to the session protocol — run it against a fresh
  `db reset` before pushing any session with new migrations.
- CLAUDE.md: new "Supabase / PostgREST queries" coding rule (check for a
  second FK before/after adding one near an existing embed) + the smoke-check
  step in the end-of-session protocol.
**Verified (honest):** fresh local `db reset` (all 17 migrations); smoke check
— all three roles (super_admin, Prism owner, Meridian owner) sign in and load
profile + org cleanly. typecheck/lint/build green.
**Deviations:** none.
**Decisions:** D-068
**Next:** 7.2 — God-mode workspace.
**Issues:** —

## Session 26 — 2026-10-07 — Single environment + push Phase 7.1 to cloud
**Built:** operational session, no new features.
- **D-066 single environment:** Netlify's production branch is now `dev` (user
  switched it) — every push to `dev` deploys. Cloud Supabase
  (`xwtxrdxktbogswxuuetp`) is the only DB until the first customer goes live;
  `main` left alone for go-live. Added to the session protocol: push migrations
  to cloud before pushing code to `dev`, since code now reaches prod the moment
  it's pushed.
- **Pushed the 8 Phase 7.1 migrations to cloud:** `db push --dry-run` first
  (confirmed the pending list was exactly those 8, nothing else), then the real
  push. `migration list` shows all 17 local=remote.
- **D-067 demo data extracted:** `supabase/demo/phase7_demo_data.sql` — the
  Phase 7.1 fictional fixtures, pulled out of `seed.sql`, idempotent, creates
  no auth users. Tried loading it from `seed.sql` via `psql \i`/`\ir` first —
  the Supabase CLI's seed runner doesn't support meta-commands at all (`db
  reset` failed: `syntax error at or near "\\"`); fixed by adding it as a
  second entry in config.toml's `[db.seed].sql_paths` instead. Also redesigned
  attribution to resolve dynamically (`select … from profiles where
  account_type='super_admin' order by created_at limit 1`) instead of a fixed
  demo profile id, and to create its own two fictional org rows if missing —
  both needed because the cloud project has the migrated schema but none of
  the local demo seed's profiles/orgs.
- **Read-only cloud verification** via `supabase db dump --linked`: all 16
  Phase-7 tables, all 14 `*_audit` triggers, and the tightened
  `audit_log_select` policy confirmed present on cloud, matching the design
  exactly. No mutations performed.
- **rls_test.sql checked, not run on cloud:** it is NOT wrapped in a
  rolling-back transaction — a `full_name` change, a 'Prism QA' sub-role row,
  and two "Dedupe test risk" rows all persist. Confirmed unsafe for cloud;
  did not suggest running it there.
- CLAUDE.md: Deployment section rewritten for single-env mode; session
  protocol gained the migrate-before-code-push rule.
**Verified (honest):** db push dry-run matched exactly 8 files; migration list
17/17 in sync; local db reset seeds both files in the new order without error;
full rls_test.sql still green afterward; cloud schema dump confirms every new
table/trigger/policy present.
**Deviations:** demo-data attribution + org-creation design differs from the
original seed.sql fixture (fixed ids) — necessary for cloud-standalone use,
noted in D-067.
**Decisions:** D-066, D-067
**Next:** 7.2 — God-mode workspace. (Optionally: run phase7_demo_data.sql
against cloud via the SQL Editor if demo data on the live site is wanted.)
**Issues:** —

## Session 25 — 2026-10-07 — Phase 7 kickoff: 7.1 Data model v3
**Built:** backend-only CS Hub data model (build-spec-v3 § 5), no UI wiring.
- **Housekeeping:** committed `docs/build-spec-v3.md`; confidentiality grep
  clean; retroactively closed out 6.7 (Netlify + cloud Supabase were already
  live but never logged — D-054); removed the dead `vercel.json`; CLAUDE.md
  reframed as the Refold CS Hub, Deployment target → Netlify, new
  Confidentiality rule (spec § 0).
- **8 append-only migrations:** new enums (org_health, lifecycle_stage,
  deployment_model, project_health, risk_severity, etc. — several status enums
  aren't explicit in the spec, chosen as sensible defaults, flagged inline);
  `segments`/`metric_definitions` lookups (seeded, incl. the § 2.2 EBR catalog);
  `organizations` extended (segment/deployment_model/health/lifecycle_stage/
  owner/data_access_mode/aliases, backfilled — health auto-fills 'active',
  lifecycle defaults 'prospect' for new rows but existing rows explicitly
  backfilled 'live'); `proposals`/`sync_state`/`sync_runs`; `projects` +
  milestones/accomplishments/risks/asks; `escalations`/`tickets`/`engagements`/
  `metric_values`/`portfolio_notes`. Every CS record table carries provenance
  (source/source_ref/created_by/updated_by/verified_at/proposal_id) and a
  per-org `(org_id, source_ref)` dedupe unique index (portfolio_notes has no
  org_id — dedupes on source_ref alone).
- **Generic audit trigger:** one SECURITY DEFINER function
  (`write_audit_log()`), attached to organizations + 13 new tables, reads
  OLD/NEW generically via `to_jsonb` with ONE special case (org_id := id only
  for organizations — a blind id-fallback for every table would have broken
  portfolio_notes/sync_runs, which have no org_id; caught during design, not in
  testing). NOT attached to profiles/sub_roles/invitations/saved_report_configs
  (already manually audited — would double-log) or segments/metric_definitions
  (pure lookups).
- **audit_log hardened:** revoked direct insert/update/delete from
  authenticated + service_role (trigger-only writes now); fixed a real leak —
  tightened `audit_log_select` so an owner can't see Phase-7 CS data via the
  audit trail just because org_id matches (with a backfill so D-046's existing
  owner-visible rows weren't silently dropped).
- **RLS:** every new table is super_admin-only, AAL2 for writes, zero
  customer-role access regardless of org match (D-039 grants to
  authenticated+service_role).
- **Types:** `Account`, `Segment`, `Provenance`, `Project`, `Milestone`,
  `Accomplishment`, `Risk`, `Ask`, `Escalation`, `Ticket`, `Engagement`,
  `MetricDefinition`, `MetricValue`, `PortfolioNote`, `Proposal`, `SyncState`,
  `SyncRun` + all new enums in `src/types/index.ts`.
- **Fixtures:** local-only `seed.sql` additions reusing the two existing
  fictional demo accounts (Prism Analytics, Meridian Laboratories) — projects,
  milestones, accomplishments, risks, an ask, an escalation, tickets,
  engagements, metric values, 2 pending proposals.
**Verified (honest):** `supabase db reset` applies all 17 migrations cleanly;
extended `rls_test.sql` proves AAL1-write rejection, zero customer-role access
across `projects`/`risks`/`tickets`/`escalations` for owner+owner+member, a
complete audit trail (create/update/delete, correct before/after/org_id) for a
super-admin AAL2 CRUD cycle, per-org dedupe rejecting a duplicate source_ref
while the same source_ref in a different org succeeds, and the audit_log
leak-fix (owner sees 0 rows for record_table IN projects/risks). typecheck/
lint/build green (build was unusually slow this session — background/Docker
resource contention, not a code issue; reran clean). Did NOT push to the cloud
project (old CLI token revoked) — 8 migrations ready whenever a fresh token is
available.
**Deviations:** several enum value sets are inferred, not spec-explicit (flagged
inline in the enums migration and in D-062); a few extra integrity constraints
added beyond the literal spec text (tickets/metric_values natural keys,
metric_definitions.sort).
**Decisions:** D-054–D-065
**Next:** 7.2 — God-mode workspace (Portfolio board, Account 360, coverage view).
**Issues:** 8 Phase 7.1 migrations pending a cloud push (need a fresh Supabase
CLI access token — the one used for 6.7 is revoked).

## Session 24 — 2026-07-31 — R2b: feature-flag cluster scope
**Built:** feature flags now work at four scopes — global | cluster | namespace |
org (added `cluster`). Mock/UI only (D-027).
- **Types:** `FlagScope += cluster` (order global, cluster, namespace, org).
- **Panel (no fork):** `FeatureFlagsPanel` props `orgId/orgName` → `scope +
  entityId + entityName`; `useFeatureFlags(scope, entityId)` →
  `fetchFeatureFlags(scope, entityId)`. Scope badge gained a Cluster pill.
- **Mock:** +3 cluster-scoped flags; `fetchFeatureFlags` returns the whole pool
  for `global`, else global + that scope's flags.
- **Affordances (super_admin, D-006):** flag-icon button on each cluster group
  header (NamespaceClusters) + "Edit feature flags" on the namespace detail
  header, each opening the shared panel scoped to that cluster/namespace.
- **Existing triggers** (org-detail button, customer-list flag icon,
  /feature-flags page) updated to pass `scope="org"`/global — behavior unchanged.
**Verified (honest):** tsx unit-check of all four scope fetches (global=10 incl.
3 cluster; cluster/namespace/org = global + own, org no longer leaks namespace/
cluster flags). typecheck/lint/build green. D-017 Save (console diff, no persist)
unchanged. Panel open-per-scope + badges are code-complete + build-verified;
interactive click-through available on the dev server, not headlessly asserted.
**Deviations:** org panel no longer lists namespace flags (moved to the namespace
panel) — intentional under the clean scope model; noted in D-053.
**Decisions:** D-053
**Next:** 6.5 live data layer, or 6.7 one-site Netlify deploy (per user).
**Issues:** —

## Session 23 — 2026-07-31 — R2a: cluster→namespace→org→tenant hierarchy
**Built:** corrected the on-prem model so tenants/metrics belong to the org WITHIN
a namespace, not the namespace (build-spec §4 amend). Mock-only (D-027).
- **Types:** `Cluster` (first-class, decommissionable), `NamespaceOrg` +
  `NamespaceOrgDetail`, `ClusterStatus`, `NamespaceStatus += decommissioned`;
  `OnPremOrgDetail` now returns `clusters:[{cluster,namespaces}]`; `NamespaceDetail`
  slimmed to header + env vars.
- **Mock:** ONPREM_CLUSTERS (5) + NAMESPACE_ORGS (10, ≥1 degraded + ≥1 down);
  new fetchers `fetchNamespaceOrgs/fetchNamespaceOrg/fetchNamespaceOrgMetrics`
  (re-scoped from the old namespace metrics, reusing buildDetailMetrics);
  `fetchOnPremOrgDetail` groups namespaces under clusters.
- **Hooks:** useNamespaceOrgs/useNamespaceOrg/useNamespaceOrgMetrics/…Charts
  (replaced useNamespaceMetrics/Charts); useAiCredits now nsOrg-scoped.
- **UI:** `NamespaceClusters` reworked (per-cluster groups; cluster + namespace
  decommission via confirm Modal → ephemeral status; namespace name links to
  detail). `NamespaceDetailPage` = header + Upgrade/Decommission + Organizations
  list (shared DataTable, Cloud-Customers style) + Env Vars; metric tabs removed.
  NEW `NamespaceOrgDetailPage` = the 5 DetailTabs scoped to `:nsOrgId` (new nested
  route). StatusBadge gained a gray `decommissioned` style. Owner /namespaces
  mirrors the nest (same NamespaceClusters).
**Verified (honest):** nest verified end-to-end via a `tsx` script (customer→2
clusters→namespaces w/ statuses→orgs→org metrics tenants=148/workflows/connectors;
health = 2 degraded/down namespaces + 2 degraded/churned orgs; NamespaceDetail
slimmed, envVars present). typecheck/lint/build green; dev server serves 200. The
interactive drill-down + decommission modals + org metric tabs are code-complete
and HMR-loaded on the dev server for manual click-test — not headlessly asserted.
God View is org-level (totals consistent with the nest) — no change needed.
**Deviations:** none. R2b (feature-flag cluster scope) is the follow-up.
**Decisions:** D-049, D-050, D-051, D-052
**Next:** R2b — feature-flag cluster scope (4-scope panel + affordances).
**Issues:** —

## Session 22 — 2026-07-31 — R1: unify portals into one app + single login
**Built:** reversed the three-portal split (D-026/D-035). One app, one `/login`.
- `src/router.tsx` rewritten as a single merged route tree; deleted
  `src/portals/{admin,cloud,onprem}/routes.tsx`, `src/config/portal.ts`,
  `src/lib/auth/WrongPortal.tsx`; retired `VITE_PORTAL` (vite-env/.env/.env.example).
- Per-route role protection back via restored `RouteGuard` → shared AccessDenied
  (no silent redirect); `OrgScopeGuard` stays on :orgId routes.
- `RequireAuth` simplified to session → (super_admin/owner AAL2) → render (portal
  match removed). New `IndexRedirect` sends `/` to `homeRoute(role)`; LoginPage
  already redirected post-auth; catch-all → `/`.
- onprem nav reordered (Namespaces first) so `homeRoute(onprem)` → /namespaces,
  keeping the "home = first nav item" invariant (D-016). Sidebar drops PORTAL_NAME.
- README rewritten (single app / one login / role redirect; removed VITE_PORTAL).
**Verified (honest, local):** signed in all three demo users via the SAME /login
(real Supabase auth + profile) → each resolves to the correct role and landing
route (super→/overview, cloud→/dashboard, onprem→/namespaces). AccessDenied for a
role hitting a route it can't access is enforced by RouteGuard's explicit
allowedRoles (verified by inspection — deterministic). ONE build (no VITE_PORTAL);
typecheck/lint/build green; no portal/WrongPortal imports remain in src.
**Deviations:** onprem nav reorder (Namespaces first) — needed so onprem lands on
/namespaces per the requirement without breaking homeRoute; approved in plan.
**Decisions:** D-048 (supersedes D-026/D-035)
**Next:** 6.5 — live data layer (provider switch; metrics-proxy). Netlify single-
site deploy is a later change.
**Issues:** —

## Session 21 — 2026-07-31 — Hotfix: MFA enrollment stuck (422)
**Fixed** a stuck "Preparing MFA…" screen (422 on `POST /auth/v1/factors`) hit
while manually testing 6.4b. React StrictMode double-invoked MfaStepUp's prepare
effect in dev → two `mfa.enroll` calls; the second 422'd and orphaned an
unverified factor, which `hasVerifiedTotp()` then ignored, so every reload
re-enrolled and re-422'd. `enrollTotp()` now unenrolls stale `totp/unverified`
factors before enrolling; MfaStepUp guards its prepare with a `useRef` (runs once
per mount, StrictMode-safe). Verified: cleanup + enroll returns a QR/secret.
**Decisions:** D-047
**Next:** 6.5 — live data layer.
**Issues:** —

## Session 20 — 2026-07-31 — 6.4b Owner user-mgmt + owner sub-roles + Phase-0 sec fix
**Built:**
- **Phase 0 (security, D-043)** — migration `20260731000002` locks down profiles
  self-edit via column-level UPDATE grant (`revoke update … ; grant update
  (full_name)`), killing the self-escalation path (member → owner/super_admin or
  org jump). rls_test extended to prove it.
- **Edge Function owner lane (no fork, D-044)** — `authorize()`→`loadCaller()` +
  `requireSuperAdminAal2`/`requireOwnerAal2`; new owner actions
  `owner_invite_user` / `owner_assign_sub_role` / `owner_set_user_status`, all
  own-org + own-type + AAL2, audit w/ org_id.
- **Owner sub-roles (D-045)** — migration `20260731000003`: `current_account_type()`
  helper + `sub_roles_owner_insert/update` policies (org-scoped, non-system,
  AAL2). Owners write these via the direct RLS-gated client.
- **Owner AAL2 (D-046)** — `needsMfa` now covers `profile.role==='owner'`.
- **Owner UI** — `OrgUsersPage` (`/users`, owner-gated) in cloud + onprem portals:
  user list, invite, assign sub-role (SlideOver), disable/enable, + custom
  sub-role editor (Toggle-based perms). Nav item `ownerOnly`, filtered in Sidebar
  by profile.role. Client helpers in `provisioning.ts`; hooks `useOrgUsers`,
  `createOrgSubRole`/`updateOrgSubRole` in `useProvisioning.ts`.
**Verified (honest, local `functions serve --no-verify-jwt`):** rls_test ALL
PASSED (self-escalation denied per column; owner sub-role own-org ok / cross-org
+ system + is_system denied; cross-org profile update 0 rows; existing isolation).
Owner-lane suite 14/14: AAL1 owner→403, member→403, owner→invite_super_admin 403,
own-org invite/assign/disable/enable→200, cross-org→403, wrong-type sub-role→400,
self-disable→400, direct sub-role RLS (own ok / cross+system 42501), owner-invited
member accept→active. typecheck/lint/build green ×3; no service-role key in
bundles; OrgUsersPage DCE'd from the admin bundle, present in cloud/onprem.
**Deviations:** none. (Owner sub-role DELETE deferred — edit only this phase.)
**Decisions:** D-043–D-046
**Next:** 6.5 — live data layer (provider switch; metrics-proxy Edge Function;
rebuild global search + ErrorBoundary).
**Issues:** — (cloud Supabase project URL/keys still user-provided; provisioned
orgs shown via pending-invites until 6.5; metrics still mock via external_ref)

## Session 19 — 2026-07-31 — 6.4a Provisioning engine + super-admin user mgmt
**Built:** the super-admin half of RBAC/provisioning.
- **Edge Function** `supabase/functions/provisioning` (Deno, action router) — the
  sole service-role holder; self-authorizes (super_admin + AAL2 from the JWT)
  before every action: `provision_org`, `invite_super_admin`, `assign_sub_role`,
  `set_user_status`, `accept_invite`. Every action writes audit_log w/ org_id.
- **Migration** `20260731000001_service_role_grants.sql` — grants DML to
  `service_role` (6.1 granted only `authenticated`; service-role writes were
  permission-denied).
- **Invite-accept**: `/accept-invite` top-level route + `AcceptInvitePage`
  (outside RequireAuth); set password → `accept_invite` flips invited→active.
- **Admin UI**: `SuperAdminsPage` (`/admin-users`, nav item) — list/invite/change
  sub-role (SlideOver)/disable-enable, reusing DataTable/Modal/SlideOver/
  StatusBadge/Tooltip. `AddCustomerButton` + `PendingInvitesPanel` on both
  customer-list pages. Client wrapper `src/lib/provisioning.ts`; Postgres reads
  in `src/hooks/useProvisioning.ts`.
- config.toml: added `/accept-invite` redirect URLs.
**Verified (honest, local `functions serve --no-verify-jwt`):** no-token→401,
non-super→403, AAL1 super→403, AAL2 super→200 for provision_org +
invite_super_admin; invite email lands in Mailpit; full accept flow (verifyOtp →
set password → accept_invite → status=active → sign-in with new pw); disable/
enable/assign_sub_role green; audit rows present with org_id. typecheck/lint/
build green ×3 portals; admin-only pages DCE'd from cloud/onprem bundles; grep
dist → no service-role key value (only supabase-js's `startsWith("sb_secret_")`
format check). rls_test assertions pass after `db reset` (Wstat 0).
**Deviations:** added D-039 grants migration (unplanned but required). Provisioned
orgs don't show in the mock-backed customer table yet (6.5) — surfaced via the
pending-invites panel instead.
**Decisions:** D-038–D-042
**Next:** 6.4b — customer-owner-facing user mgmt + owner-defined sub-roles (+RLS)
+ customer-owner AAL2 step-up.
**Issues:** — (cloud Supabase project URL/keys still user-provided; metrics still
mock via external_ref bridge until 6.5)

## Session 18 — 2026-07-30 — Fix: demo login / seed robustness
**Diagnosed** the admin-portal "Incorrect email or password". Step-1 query
showed all 4 demo users present, `email_confirmed_at` set, `has_pw` true,
`aud`/`role`=authenticated — but `auth.identities` had 0 rows. A live GoTrue
password request for super@refold.internal (and owner@prismanalytics.io)
nonetheless **returned tokens**, so the seed is functionally correct and the
missing identities are not the blocker in GoTrue v2.193.
**Root cause:** `supabase start` re-runs `seed.sql` only on a fresh db init; on a
persisted/older volume it does not reseed, so a stale local db lacks the current
demo users → GoTrue rejects the login. Fix is `supabase db reset`.
**Fix:** documented `db reset` prominently in the README Supabase section (the
actual remedy for the user); and hardened the seed with a matching
`auth.identities` row per demo user (robustness / GoTrue-version future-proofing).
**Verified (honest):** after `db reset`, 4 email identities seeded; a throwaway
anon-client script signed in super + cloud (both AAL1 sessions); rls_test green.
Login now works after a reset; a plain `start` on a stale volume still needs a
reset (documented).
**Decisions:** D-037
**Next:** 6.4 — RBAC + provisioning UI.
**Issues:** —

## Session 17 — 2026-07-30 — 6.3 Portal split (VITE_PORTAL)
**Built:** one repo → three portals. `src/config/portal.ts` resolves/validates
`VITE_PORTAL` (default admin, throw on invalid) and maps portal↔account_type↔role
+ display names. Per-portal route modules `src/portals/{admin,cloud,onprem}/
routes.tsx` import only their own pages; `router.tsx` selects children off the
inlined env literal so Rollup DCEs the other portals. Portal↔account_type guard
layered into `RequireAuth` (order: session → profile → portal match → AAL2):
wrong-type users get a `WrongPortal` screen naming the correct portal + Sign out.
Removed the now-superseded `RouteGuard` (only the portal guard gates role now;
`OrgScopeGuard` stays on :orgId routes). Sidebar logo shows the portal name.
README rewritten (portals + demo creds + per-portal run), replacing the stale
password-gate/role-switcher text.
**Verified (honest):** typecheck + lint green; all three `VITE_PORTAL` builds
green; per-bundle grep confirms no cross-portal leakage — Overview page only in
the admin bundle, Namespaces page only in onprem. (Wrong-portal guard verified by
code/build; not browser-automated.)
**Deviations:** onprem portal includes the org/namespace detail routes (D-036);
metrics still mock via the external_ref bridge (unchanged).
**Decisions:** D-035, D-036
**Next:** 6.4 — RBAC + provisioning UI.
**Issues:** cloud Supabase project (URL/keys) still to be created by the user.

## Session 16 — 2026-07-30 — Phase-0 org_id amendment + 6.2 Auth + MFA
**Built:**
- **Phase 0 (D-032):** new append-only migration adds nullable `org_id` to
  `sub_roles` + `audit_log`; drops/recreates the affected SELECT policies
  (sub_roles: system rows global + org rows scoped; audit_log: super_admin OR own
  org). Extended `rls_test.sql` (owner sees system + own-org sub-roles, not
  another org's). Confirmed the columns were absent first.
- **6.2 Auth + MFA:** `@supabase/supabase-js` + `src/lib/supabase.ts` browser
  client; `SupabaseAuthProvider` loads session + profile(+org) + AAL and
  re-implements `useAuth()` as a compat shim (`account_type→UserRole`,
  `user.orgId = org.external_ref` mock bridge — D-033), so all 12 useAuth
  consumers work unchanged. `/login` is now real email+password. TOTP MFA:
  `MfaStepUp` (enroll with QR/secret, else challenge); `RequireAuth` requires a
  Supabase session and forces AAL2 for super_admin (D-034). Removed the dev
  role-switcher (D-026/D-002) and placeholder password gate (D-031/D-023);
  deleted AuthContext, AuthGateContext, useAuthGate; sign-out now calls Supabase.
  Enabled TOTP in config.toml; added `src/vite-env.d.ts`; eslint ignores
  `supabase/`.
**Verified (local stack, honest):** rls_test green; a node script driving the
anon client proved cloud-owner sign-in + profile/org load + external_ref bridge
+ aal1 + RLS cross-org isolation, and super_admin aal1 → TOTP enroll → verify →
**aal2** → sees all orgs. typecheck/lint/build green.
**Deviations:** metrics still served by the mock provider via the external_ref
bridge (by design until 6.5).
**Decisions:** D-032, D-033, D-034
**Next:** 6.3 — Portal split (VITE_PORTAL).
**Issues:** cloud Supabase project (URL/keys) still to be created by the user.

## Session 15 — 2026-07-29 — 6.1 Supabase project + schema + RLS
**Built:** kicked off Phase 6 (re-architecture per docs/build-spec-v2.md, which
was missing from the repo and is now committed). Backend only, no UI.
`supabase init` + local dev stack. Migrations: § 4 enums; the 6 tables
(organizations, sub_roles, profiles [1:1 auth.users], invitations, audit_log,
saved_report_configs) with FKs/indexes + authenticated grants; helper functions
`is_super_admin` / `current_org_id` / `is_owner` / `is_aal2` (SECURITY DEFINER,
fixed search_path — no RLS recursion); RLS enabled on every table with § 5
policies (super_admin full; customers scoped by org_id; owners provision within
org, AAL2-gated; members read-only + own-profile self-edit; audit append-only);
system seed (internal Refold org + is_system sub-role sets). Local demo fixtures
in seed.sql (2 orgs + 4 users). `.env.example` gains Supabase key names +
VITE_PORTAL/VITE_DATA_SOURCE; README gains a Supabase/RLS-test section;
.gitignore covers supabase local state.
**Verified (fresh local db, Docker):** all 5 migrations apply cleanly + seed
runs; `supabase/tests/rls_test.sql` → "ALL RLS TESTS PASSED" (Prism owner sees
only their org, Meridian owner sees 0 Prism rows, super_admin sees all); AAL2
write gate confirmed (aal1 super-admin insert blocked, aal2 allowed).
**Decisions:** D-025–D-031 (numbering shifted from the brief's D-024–D-030 since
D-024 = ErrorBoundary was already taken).
**Next:** 6.2 — Auth + MFA.
**Issues:** cloud Supabase project (URL/keys) still to be created by the user;
Refold/Facets API docs needed for 6.5.

## Session 14 — 2026-07-23 — Hotfix: global search crash + route ErrorBoundary
**Built:** fixed a full-page crash regression from 5.11/5.12. `GlobalSearch`
rendered the dropdown body with `data!.organizations` (non-null assertion), but
on the first keystroke the debounced query is still empty so `useSearch` returns
`data: undefined` → "Cannot read properties of undefined (reading
'organizations')". Reworked the body to key on `!data` ("Searching…") → empty
("No results") → groups, dropping the fragile `noResults`/`isFetching` logic and
every `data!` deref. FilterInput mode (customer-list pages) was already a
separate component that never touches `data` — confirmed both modes. Added a
route-level `errorElement` (`RouteError`) on the app + login routes so a render
throw shows a friendly page with Back/Reload instead of a dev stack trace
(closes the Phase-1 gap: 5.12 item 3 covered data-fetch errors, not render
throws). typecheck/lint/build green.
**Deviations:** —
**Decisions:** D-024
**Next:** deploy to Vercel (user's manual step) — build blocks 5.1–5.12 complete.
**Issues:** —

## Session 13 — 2026-07-23 — 5.12 Polish pass (all 3 phases landed)
**Built:**
- **P1 Polish:** `useMediaQuery` hook; sidebar collapses to icon-only at ≤1200px
  with Tooltip labels, AppLayout margin follows suit (works to 1024px). Topbar
  now syncs `document.title` per route. Added EmptyState fallbacks to the God
  View cloud/on-prem tables. Audited empty/skeleton/error/tooltip/date coverage —
  already conformant from prior blocks (search intentionally has no error sim).
- **P2 (5.3 gap):** `FeatureFlagOverviewCard` on the God View — global flags with
  Toggles, reusing `useFeatureFlags()` + Toggle and D-017 Save semantics
  (console-log, no persistence).
- **P3 Deploy prep:** placeholder password gate (§11.4) — `AuthGateContext` +
  `useAuthGate` + `RequireAuth` wrapping AppLayout; `/login` rewritten from the
  role-picker into a password gate (demo `refold-demo-2025`); sidebar "Sign out".
  Orthogonal to the mock role system (AuthContext). Added `.env.example` and a
  README with the §11.2 deploy steps. Verified vercel.json rewrite + vite outDir.
  typecheck/lint/build all green.
**Deviations:** `/login` repurposed from role-picker → password gate (D-023);
role-switching stays in the sidebar. Vercel deploy left to the user (manual).
**Decisions:** D-022, D-023
**Next:** deploy to Vercel (user's manual step) — build blocks 5.1–5.12 complete.
**Issues:** —

## Session 12 — 2026-07-23 — 5.11 Global search
**Built:** fleshed out `SearchDropdown` into the real global search (rendered in
the super_admin topbar per D-016). Debounced query → `useSearch` → grouped
dropdown: Organizations / Namespaces / Connectors, ≤3 each, with type icon
(Building2/Layers/Plug), name + breadcrumb. Full keyboard nav (↑/↓ wrap across
groups, Enter navigates, Escape closes + refocuses), outside-click close,
"No results"/"Searching…" states. Reshaped `searchAll` to return grouped
`SearchResults` incl. connectors (new `CONNECTOR_DEFS` constant, indexed across
cloud orgs + namespaces); connector rows deep-link to the Connectors tab via
`?tab=connectors`, which the two tabbed detail pages now read as their initial
tab. Kept the `onSearch` filter-input mode so the customer-list pages still work.
typecheck/lint/build all green.
**Deviations:** connectors indexed from cloud orgs + namespaces (on-prem org
detail has no Connectors tab) — see D-020.
**Decisions:** D-020, D-021
**Next:** 5.12 — Polish pass
**Issues:** —

## Session 11 — 2026-07-23 — 5.10 AI Credits card
**Built:** an `AiCreditsCard` added once to the shared DetailTabs Overview, so it
renders for both the cloud org detail and the on-prem namespace detail, scoped by
whichever id the container passed to `useAiCredits`. Card: "AI Credits", large
`used / limit credits used` fraction, reused ProgressBar (amber ≥70 / red ≥90)
that fills 0→value over 600ms on mount, "Resets on {date}", and a top-5 consumers
DataTable (workflow + credits + % of total). super_admin-only inline "Edit limit"
updates ephemeral local state (D-009). Removed the old mini "AI Credits Used" stat
card (stat row now 3 cards). Extended `fetchAiCredits` to scope namespace ids and
added `topConsumers` to AiCredits; ProgressBar gained an optional `durationMs`.
typecheck/lint/build all green.
**Deviations:** replaced the mini credits stat card rather than keeping both
(D-018).
**Decisions:** D-018, D-019
**Next:** 5.11 — Global search
**Issues:** —

## Session 10 — 2026-07-23 — 5.9 Feature flags slide-over panel
**Built:** one reusable `components/FeatureFlagsPanel.tsx` (wraps SlideOver,
400px, Escape/outside-click close). Header "Feature Flags — {Org}" or "Global
Feature Flags". Rows: label + description + Toggle + scope badge (Global/Org/
Namespace); changed rows get a yellow background; Save disabled until a change,
pinned at the bottom. Wired all three triggers: the org-detail Edit-flags button,
the cloud + on-prem customer-list flag icons, and the /feature-flags page (now a
real global view). `fetchFeatureFlags(orgId?)` / `useFeatureFlags(orgId?)`:
global pool with no orgId, cloud orgs hide namespace-scoped flags. Independent
skeleton + error/Retry. typecheck/lint/build all green.
**Deviations:** Save console-logs the diff only, no persistence (see D-017).
**Decisions:** D-017
**Next:** 5.10 — AI Credits card
**Issues:** —

## Session 9 — 2026-07-23 — 5.8 On-prem customer admin view
**Built:** onprem_customer_admin experience scoped to their org. Extracted nav
into `config/navigation.tsx` (+ `homeRoute`); sidebar gains Dashboard/Namespaces.
Topbar shows the org name for customer roles and hides global search for
non-super_admin. New reusable `AccessDenied` + route-level `OrgScopeGuard`
(:orgId vs user.orgId) wrapping the cloud/onprem detail + namespace routes;
removed the D-012 inline check from NamespaceDetailPage. Extracted
`components/onprem/NamespaceClusters.tsx` (cluster tables + upgrade/env/add
interactions) shared by the 5.6 org page (now a thin header) and the new
customer `NamespacesPage`. On-prem `DashboardPage` renders a namespace summary
card grid. Settings gains a read-only org-profile card for customer roles.
typecheck/lint/build all green.
**Deviations:** 5.6 header summary now uses server namespace count, not the live
post-add local count (state moved into NamespaceClusters) — see D-015.
**Decisions:** D-014, D-015, D-016
**Next:** 5.9 — Feature flags slide-over panel
**Issues:** —

## Session 8 — 2026-07-22 — 5.7 Namespace detail (6 tabs inc. env vars)
**Built:** `/onprem-customers/:orgId/namespaces/:namespaceId`. Extracted the 5.5
tab sections into shared, presentational `components/detail/DetailTabs.tsx` —
each takes `QueryLike` props; renamed `CloudOrgMetrics → DetailMetrics`, added
`DetailCharts`. Cloud page rewired as a thin container (behaviour-identical);
namespace page reuses the same 5 sections via namespace-scoped fetchers
(`fetchNamespaceMetrics`, `apiCallsTrend`/`latestVersion` added to
NamespaceDetail; normalized chart selector hooks). New Environment Variables tab:
bespoke table with inline add/edit form rows + delete-confirm Modal, all local
state (D-009); secrets masked ●●●●●● on mount, reveal only on explicit click.
Header shows version badge + Upgrade-available modal. Cross-org access guard for
onprem_customer_admin. typecheck/lint/build all green.
**Deviations:** env-var table is bespoke, not DataTable (D-013) — DataTable can't
host inline form rows.
**Decisions:** D-010, D-011, D-012, D-013
**Next:** 5.8 — On-prem customer admin view
**Issues:** —

## Session 7 — 2026-07-22 — 5.6 On-prem org detail + namespace list
**Built:** `/onprem-customers/:orgId` full page. Header (name/plan/status +
derived "N namespaces across M clusters" + Add-namespace button). Namespaces
grouped by cluster into per-cluster DataTables with Upgrade-available (semver
check → "→ 3.12.4" or green check), Created, and an Actions column (View
metrics link, Edit-env-vars slide-over stub, Upgrade — disabled when current).
Upgrade confirmation Modal and Add-namespace SlideOver both mutate component-
local state. New `OnPremOrgDetail` type + `fetchOnPremOrgDetail` mock and a
`compareSemver`/`isUpgradeAvailable` util. typecheck/lint/build all green.
**Deviations:** none — data gap filled per D-005 (createdAt + latestVersion).
**Decisions:** D-008, D-009
**Next:** 5.7 — Namespace detail (6 tabs inc. env vars)
**Issues:** —

## Session 6 — 2026-07-22 — 5.5 Cloud org detail (5 tabs)
**Built:** `/cloud-customers/:orgId` full page + `CloudOrgDetailView` reused at
`/dashboard` for cloud_customer_admin. Header (name/plan/status + Edit-flags
stub), 5 tabs (Overview, Tenants, Usage, Workflows, Connectors) each with
independent skeleton + ErrorState/Retry. New `CloudOrgMetrics` type +
`fetchCloudOrgMetrics` in the mock layer; new reusable `Tabs` component;
`BarChart` gained a `horizontal` prop; `StatusBadge` gained `paused`. Doc fix:
build-spec §10.1 tree root renamed to refold-control-plane. typecheck/lint/build
all green.
**Deviations:** none — data gap filled per plan (see D-005).
**Decisions:** D-005, D-006, D-007
**Next:** 5.6 — On-prem org detail + namespace list
**Issues:** —

## Session 5 — 2026-07-17 — housekeeping (no prompt block)
**Built:** nothing new. Sessions 2–4 (5.2–5.4) had never been committed — all
814 lines lived only in the working tree, so dev was still at the scaffold.
Split them into four commits and pushed. Renamed docs/decision.md →
decisions.md (every reference already said plural) and fixed the clone URL in
CLAUDE.md, which pointed at refold-admin-panel instead of refold-control-plane.
**Deviations:** —
**Decisions:** none
**Next:** 5.5 — Cloud org detail (5 tabs)
**Issues:** the end-of-session protocol was added in the same uncommitted batch
it was meant to govern, so it had never actually run. Worth watching whether
step 5 (push) sticks from here.

## Session 4 — 2026-06-09 — 5.4 Customer list pages
**Built:** /cloud-customers and /onprem-customers list pages; search, status
filter, sortable DataTable; feature-flag slide-over trigger stubbed; row-click
navigation to org detail placeholders.
**Deviations:** none
**Decisions:** none
**Next:** 5.5 — Cloud org detail (5 tabs)
**Issues:** —

## Session 3 — 2026-06-09 — 5.3 God View dashboard
**Built:** God View at /overview; 6 StatCards, 2 trend LineCharts, cloud +
on-prem health tables with links, license expiry highlighting.
**Deviations:** spec asked for 4 stat cards; shipped 6 (added license metrics).
**Decisions:** D-003, D-004
**Next:** 5.4 — Customer list pages
**Issues:** —

## Session 2 — (date) — 5.2 Mock data layer
**Built:** src/data/mockData.ts with all getters per build spec Section 4;
200ms artificial delay; 12 orgs (7 cloud, 5 on-prem).
**Deviations:** none
**Decisions:** none
**Next:** 5.3
**Issues:** —

## Session 1 — (date) — 5.1 Scaffold
**Built:** Vite + React 18 + TS scaffold; sidebar/topbar shell; role-switching
mock auth context; routing placeholders; color scheme applied.
**Deviations:** none
**Decisions:** D-001, D-002
**Next:** 5.2
**Issues:** —