# Refold CS Hub — Product Overview

> Planning-room understanding of what we're building, for the Head of CS to
> confirm before the 7.2 prompt. No real customer data (the repo is public);
> examples use fictional accounts.

---

## 1. What it is

**One place where Refold runs customer success.** It combines:

- **the account system of record:** health, lifecycle, POCs, onboarding,
  projects, engagements, risks, escalations, tickets, and metrics for every
  customer, whether data comes from APIs, people, or the sync agent;
- **the team's operating tool:** daily standups, FDE workload and performance,
  approvals, and reporting;
- **the knowledge layer:** a document base (built on Google Drive) and a
  knowledge base readable by everyone at Refold;
- **the admin portal it already is:** users, roles, provisioning, feature flags,
  and customer deployments (clusters → namespaces → orgs → tenants).

It answers three questions at any moment:

1. **How is every customer doing right now, and why?**
2. **What is each FDE working on, and how is it going?**
3. **What does Refold know** about this customer, product, or problem?

---

## 2. Who uses it

**Every CS admin is a peer — there is no internal hierarchy on the
platform.** Everyone has the same `super_admin` access and uses the hub the
same way; no title-based behavior, no RBAC by role.

| Persona | Role in the system | What they mainly do |
|---|---|---|
| **CS admin** | super_admin | Works the accounts they hold a role on (EDL / TA / FDE, per account — see below); approves sync proposals; logs engagements; prepares EBR/QBR inputs; writes knowledge articles. Anyone can also just look at the whole portfolio — scope is focus, not a permission tier. |
| **Refold member** (sales, product, engineering, leadership) | **new read-only internal role** | Search and read the knowledge base and team docs; view account summaries (scope to confirm, §11) |
| Customer admins (cloud / on-prem owners) | existing, frozen | Unchanged; no new work |

Notes:

- **Account roles, not job titles.** EDL / TA / FDE is a role on a specific
  account (an account can have an EDL, a TA, and several FDEs, each a
  **linked person**, not a text name) — it's record-keeping, feeding future
  performance indexes (§13), and grants no permissions. A person can hold
  different roles on different accounts.
- **`reports_to` is optional and permission-free.** It's a UX convenience
  only — pre-fills standup participants and powers the "My team" scope
  option (§12) — never a factor in what someone can see or do.

---

## 3. What the hub holds

```
Account  (segment, deployment model, health, lifecycle stage, active EDL/TA/FDE roles)
 ├─ Contacts            customer people, roles, champion / decision maker
 ├─ POCs                success criteria, dates, stakeholders, outcome
 ├─ Onboarding plan     from a template: tasks, owners, due dates, progress
 ├─ Projects            delivery workstreams; members (EDL + FDEs as people)
 │    ├─ Milestones · Accomplishments · Risks · Asks
 │    └─ Tenant counts, go-live, health
 ├─ Escalations         severity, raised, owner, resolution
 ├─ Tickets             mirrored from the ticketing tool (via sync)
 ├─ Engagements         calls, check-ins, QBR/EBR meetings, notes, follow-ups
 ├─ Metrics             EBR catalog per period, with baselines
 ├─ Documents           SOWs, architecture, decks (Drive-backed)
 ├─ Reports             generated EBR / QBR / status slides (history)
 └─ Deployment          clusters → namespaces → orgs → tenants (existing)

People
 ├─ Directory           reports_to (optional), active account roles, recent activity
 └─ Standups            daily entries, blockers, action items — anyone can host

Knowledge
 ├─ Knowledge base      articles: product, deployment, connectors, playbooks, lessons
 └─ Team documents      generic Drive folders (templates, guides)

System
 ├─ Proposals           everything the sync / chat agent suggests, awaiting approval
 └─ Audit log           every change: who, what, before → after, when
```

Every record shows **where it came from** (manual / agent / chat / API / file)
and **when it was last verified**.

---

## 4. Navigation

Primary items — every CS admin sees the same nav, no admin-tier
distinctions:

| Sidebar item | What it is |
|---|---|
| **Home** | Personal "my day" (§5.1) |
| **Portfolio** | All accounts by segment and health; coverage tab |
| **Approvals** | One inbox for every pending proposal (badge) |
| **Standups** | Daily standup board + history |
| **People** | Directory: who reports to whom (optional), active account roles, link to recent activity |
| **Reports** | Monthly status, EBR, QBR builder + history |
| **Documents** | Drive-backed document base |
| **Knowledge base** | Articles + search |
| **Ask the Hub** | Chat panel, available from any screen |

Plus, not yet built this round: **Accounts** (list → Account 360, folded
into Portfolio's board for now), **POCs**/**Onboarding**/**Projects**
(Phase 8), **People activity** (§5.8, per-person detail reached from
People).

**Admin** — a collapsed-by-default group, same screens as the existing
admin portal: Audit log, Users & roles, Feature flags, Deployments
(existing god view, clusters), Settings. No visibility tiers — every CS
admin can open it.

---

## 5. Screens and what they show

### 5.1 Home ("my day")

One Home for every CS admin — no per-title variants:

- My accounts at a glance, with my role on each and what changed since
  yesterday; my pending approvals; my milestones due or overdue this week;
  my open escalations and P1/P2 tickets; accounts with no engagement in N
  days; stale records on my accounts; today's standup entry (pre-drafted).
- A compact row per direct report, if anyone reports to me (optional,
  `reports_to`): their overdue items and open escalations.
- A scope switcher (§12) lets anyone widen Home to their team or the whole
  portfolio — it's the same screen, not a different one for a different
  tier.
- **For a Refold member:** knowledge base search, recently updated articles, team
  docs.

### 5.2 Portfolio

- **Board tab:** accounts grouped by segment (Enterprise / SMB / …), each showing
  health, lifecycle stage, deployment model, active EDL(s), open escalations, next
  milestone, last engagement, and coverage %. Filters: segment, health, lifecycle,
  deployment model. Sections for **monthly key milestones** and
  **recommendations + impact** (editable; they feed the status report). **Add
  account** creates a record directly, with no invite (prospects, POCs,
  air-gapped customers).
- **Coverage tab:** account × section grid (projects, milestones, risks,
  escalations, tickets, engagements, metrics, contacts …) marked current / stale
  (> 30 days) / missing / pending approval. This is how "complete coverage" is
  measured.

### 5.3 Account 360

Header: name, segment, health, lifecycle stage, deployment model, active
EDL(s), last engagement, coverage %, **Refresh** (sync this account), **Ask
about this account**, and "View deployment →" when one exists.

| Tab | Shows | Actions |
|---|---|---|
| **Overview** | Health + reason, current lifecycle stage, key contacts, open escalations, next milestones, latest accomplishments, key metrics, recent activity | Change health (with reason), mark verified |
| **Projects** | Each project card: health, dates, EDL + FDEs, tenants, goals; nested milestones / accomplishments / risks / asks; plus an **account-level** group for risks/asks without a project | Add / edit / delete inline, mark verified, Refresh per type |
| **POC** *(Phase 8)* | Success criteria with pass/fail, timeline, stakeholders, outcome | Track, close as won/lost |
| **Onboarding** *(Phase 8)* | Plan tasks, owners, due dates, % complete, blockers | Check off, reassign |
| **Escalations** | Severity, raised by/when, owner, status, resolution | Add, resolve, Refresh |
| **Tickets** | Key, title, priority, status, age, SLA status, link | Refresh (from ticketing tool via sync) |
| **Engagements** | Timeline of calls, check-ins, QBR/EBR meetings with notes and follow-ups | Log engagement, attach doc |
| **Metrics** | EBR catalog: latest value, baseline, trend, source | Enter value for a period, Refresh |
| **Documents** | This account's Drive folder: files, tags, linked project | Upload, view inline, link |
| **Reports** | Past EBR/QBR/status outputs for this account | Generate new |

Every row shows a source badge and "verified x days ago". All edits are
audited.

### 5.4 POCs *(Phase 8)*

Board by stage (planned → running → evaluating → won / lost). Each POC: account,
success criteria met / total, days remaining, owner FDE, risks. Converting a won
POC starts the onboarding plan.

### 5.5 Onboarding *(Phase 8)*

Templates (cloud / on-prem managed / air-gapped self-deploy) with standard tasks.
Each account's plan shows progress, overdue tasks and blockers. Completing
onboarding moves the account to **live**.

### 5.6 Projects

Cross-account list and timeline: health, go-live, EDL/FDEs, next milestone,
slippage. Filters by FDE, health, and go-live month.

### 5.7 Standups

- **Anyone can start a standup** — there's no fixed team roster. The host
  picks participants, pre-filled from their direct reports (`reports_to`,
  if any) and defaulting to whoever they picked last time, so daily use is
  one click. Several standups a day, run by different hosts, is normal —
  not one team's board.
- **Board for a host and date:** one card per participant, covering their
  active accounts and their own actions.
- **Auto-drafted "since last standup":** records they changed, approvals
  done, new escalations and tickets on their accounts, milestones hit or
  slipped, metrics updated.
- Each participant edits **Yesterday / Today / Blockers** before or during
  the call; the host can edit any entry.
- **Live mode:** steps through participants one by one with a timer.
- Blockers can be turned into **asks** on an account and **action items** with an
  owner and due date; open action items carry over until done.
- History is searchable by date.

### 5.8 People activity

Per person, from data the hub already holds — **a profile, not a
performance tier**:

| Signal | From |
|---|---|
| Active account roles, with since-dates, and role history | `account_roles` |
| Health of accounts they hold a role on (now + trend) | account health history |
| Milestones delivered on time vs. slipped | milestones |
| Escalations: count, time to resolve | escalations |
| Ticket SLA adherence (P1/P2) | tickets |
| Engagement cadence (days since last touch per account) | engagements |
| Data freshness on their accounts (coverage %) | provenance |
| Approval turnaround | proposals |
| Standup commitments completed | standups |

These are **signals for coaching conversations, not automatic verdicts**,
visible to every CS admin (no visibility tiers — everyone's a peer). Each
metric links to the records behind it. **Performance indexes / KPIs
computed from these signals are deferred to a later block**, alongside
gamification (§13) — this screen just surfaces the raw signals for now.

### 5.9 Reports

| Report | Scope | Content |
|---|---|---|
| **Monthly status report** | Portfolio, per month | Segment health roll-up, key milestones, recommendations; one slide per project (release, dates, EDL/FDE, health, tenants, goals, milestones, accomplishments, risks, asks) |
| **EBR** | One account, executive | Value delivered (velocity, ops, ROI, adoption metrics), roadmap alignment, governance/support, 30-60-90 plan, appendix |
| **QBR** | One account, quarterly operational | Quarter's milestones, usage/execution trends, tickets and escalations, risks, next-quarter plan |

Flow: pick account(s) + period → the hub assembles data (manual + API + approved
sync) → **gap list** (missing/stale inputs, with one click to fill or Refresh) →
AI-drafted narrative (exec summary, highlights) → edit → export → stored in
Reports history and logged as an engagement.

### 5.10 Documents (Drive extension)

- Each account has a linked Google Drive folder; there are also team-wide folders
  (templates, guides, playbooks).
- Upload, preview inline, tag (SOW, architecture, deck, contract, runbook), and
  link to a project or engagement.
- Files stay in Drive, so the team's current habits keep working. The hub adds
  structure, tags, search, and links to records. The chat agent can read and cite
  them.

### 5.11 Knowledge base

- Articles in categories (product, deployment incl. air-gapped, connectors,
  playbooks, customer lessons), with tags, owner, last reviewed, and linked
  accounts/docs.
- Read by every Refold member; written and edited by FDEs; review reminders when
  stale.
- **Promote to KB:** turn a resolved escalation or a project lesson into an
  article.
- Search + "Ask the Hub" answers over KB, docs, and account records (scoped by
  role).

### 5.12 Approvals and Audit

- **Approvals:** one inbox for every proposal kind (metrics, updates, risks,
  escalations, tickets, health changes, deletes): diff, evidence, edit-then-approve,
  reject with reason, bulk. Any logged-in super admin approves.
- **Audit log:** who / on behalf of what / action / record / before → after /
  when, with filters and CSV export — visible to every CS admin, read-only.

### 5.13 Ask the Hub (chat agent)

Available everywhere and aware of the current screen. It can:

- **ask:** "what's at risk this month?", "summarize this account since August";
- **act:** "log this call" → inline proposal;
- **draft:** "prep QBR inputs for account X";
- **standup:** "what changed on my accounts since yesterday?".

It never writes directly. It uses the Refold MCP server (CS service user) for
Slack, email, tickets and Refold metrics, plus platform read tools.

---

## 6. End-to-end journeys

Every journey below is something **any CS admin** can run — there's no
title that gates which one applies to whom. Several widen their scope to
"My team" or "Everyone" where that's the natural thing to do (reviewing
more than just your own accounts); none of that is a permission, just a
scope switcher choice.

### J1 — Monday morning

1. Home (scope: Everyone, or My team if anyone reports to you) shows: 2
   accounts moved to *Caution*, 1 new escalation, 3 slipped milestones, 14
   pending approvals.
2. Opens an account that turned *Caution*; Overview shows the reason and the Slack
   evidence from the overnight sync.
3. Asks the Hub, "what changed here since last week?"
4. Assigns a follow-up as an action item, owned by whoever's actually
   handling it.

### J2 — A CS admin's day

1. Home shows overnight sync proposals on their accounts.
2. Approves 5, edits 1, rejects 1.
3. After a customer call, logs an engagement, adds a milestone, and attaches the
   deck from Drive.
4. Marks the metrics section verified.

### J3 — A standup

1. The host starts one; participants default to their direct reports (if
   any) or last time's set — one click.
2. Each participant's card is pre-drafted from yesterday's activity; they
   tweak it.
3. The host runs live mode and walks through each participant.
4. Blockers become asks and action items with owners.
5. Standup is saved; open items roll forward.

### J4 — Customer lifecycle

1. New prospect added on the Portfolio board.
2. POC created with success criteria and tracked to **won**.
3. The onboarding plan (air-gapped template) starts automatically.
4. Project created with people in the EDL/FDE roles.
5. Go-live: lifecycle becomes **live**, and the EBR/QBR cadence is set.

### J5 — QBR / EBR prep

1. Reports → QBR → account → quarter.
2. The hub assembles metrics, milestones, tickets and risks, and lists gaps.
3. Whoever holds a role on the account clicks Refresh on tickets and enters
   two metric values.
4. AI drafts the narrative; the author edits it and another admin reviews.
5. Export; the meeting is logged as an engagement with the deck attached.

### J6 — Monthly status report

Reports → month → generated portfolio + per-project slides → review → export →
share.

### J7 — Escalation from Slack

1. The overnight sync spots an escalation in a customer channel and files a
   proposal.
2. An admin approves it, creating an escalation record.
3. It shows on Home, the Portfolio card, and the next standup.
4. When resolved, a lesson is promoted to the KB.

### J8 — Refold member

Searches the KB ("air-gapped install prerequisites"), reads an article, opens
the linked runbook in Documents. Asks the Hub a product question answered from
KB + docs.

### J9 — Coaching conversation

1. People → a person's activity view.
2. Reviews their active account roles, on-time milestones, escalation
   resolution, engagement cadence, and data freshness — raw signals, not a
   score (§5.8).
3. Drills into the records behind any number.
4. Discusses it in a 1:1.

### J10 — Onboarding a new CS admin

Admin → invite → they log in, enroll MFA, land on Home → add them to their
first few accounts (a role each: EDL/TA/FDE) from Portfolio or Account 360.

---

## 7. How data gets in (all channels)

| Channel | Examples | Lands as |
|---|---|---|
| Manual (UI) | health change, milestone, engagement note, metric value | Applied, audited |
| Sync agent (daily + Refresh) | Slack escalations, email updates, tickets, Refold execution metrics | Proposals → Approvals |
| Chat agent | "log this call…" | Inline proposal |
| API (cloud / managed accounts) | executions, success rate, MTTR, MCP usage | Applied with source = api |
| File import (air-gapped) | usage-export bundle | Proposals |
| Drive | documents | Linked files (no record changes) |

---

## 8. Permissions

Every CS admin is a peer — one column, not a tier per title:

| Capability | CS admin | Refold member | Customer admin |
|---|---|---|---|
| View all accounts | ✅ | summary only (TBC) | own org only (frozen) |
| Edit records, approve proposals | ✅ | — | — |
| People activity (§5.8) | ✅ (everyone's) | — | — |
| Audit log | ✅ | — | — |
| Standups | host + edit any | — | — |
| Reports | ✅ | view shared (TBC) | — |
| Documents | ✅ | team docs (account docs TBC) | — |
| Knowledge base | edit | read | — |
| Admin (users, flags, deployments) | ✅ | — | — |

---

## 9. Build sequence

| Phase | Blocks | Outcome |
|---|---|---|
| **7 — Account intelligence** | 7.1 ✅ data model · 7.2a *(superseded — see below)* · **7.2b Portfolio + Account 360** · 7.3 Approvals + Audit screen · then **Home + Standups + People activity** · 7.4 Ingest API · 7.5 CS Sync Skill + Refresh + daily · 7.6 Ask the Hub · 7.7 Reports (monthly, EBR, QBR) · 7.8 Air-gapped import | Every person works their own accounts; complete, current records + reports |
| **8 — Lifecycle** | Contacts · POCs · Onboarding templates/plans · Engagement cadence · Project timeline | Prospect → POC → onboarding → live, tracked |
| **9 — Knowledge** | Documents (Drive) · Knowledge base · Refold member role · global search | Company knowledge layer |
| **10 — Gamification** | Points, streaks, badges, leaderboards (§13) | Habits that keep the hub current |

Home, Standups and People activity move ahead of Phase 8 (default chosen,
since account roles and reporting lines are central to daily use).

---

## 10. Changes this implies for what's already planned

1. **People and account roles.** 7.1 stored FDEs as text names
   (`projects.fdes text[]`) and a single `owner_profile_id`. 7.2a first
   replaced these with titles + teams + account assignments — then the Head
   of CS reversed that direction: no internal hierarchy. The final shape is
   `account_roles` (per-account role tag, record-keeping, with history) +
   optional `reports_to` + unchanged `project_members`. This is a migration,
   so push it to cloud before the code.
2. **No titles.** `profiles.title` was built in 7.2a and then dropped. Add a
   new **Refold member** account type (read-only internal) in Phase 9.
3. **Health history:** keep a history of account and project health changes (the
   audit log already captures them; People activity trends read from it, or a
   light history table).
4. **QBR** joins EBR in 7.7 (old plan only had EBR).
5. **Navigation** should match §4 (Home/Portfolio/Approvals/Standups/People,
   Admin collapsed), so later items slot in without reshuffling.

---

## 11. Questions for the Head of CS

Defaults assumed until answered: documents stay in Google Drive; Refold members
get KB + team docs only; Home + Standups + People activity follow 7.3.

1. **Refold member access:** knowledge base + team docs only, or also read-only
   account summaries (health, projects)? Any accounts or fields that should stay
   CS-only?
2. **Documents:** Drive-backed as described (files stay in Google Drive), or files
   stored in the hub itself?
3. **People activity signals:** is the list in §5.8 right, now that it's informational
   for everyone rather than a Head-of-CS-only view?
4. **Standups:** daily? Live call, async, or both? Roughly how many CS admins
   per typical standup?
5. **EBR vs. QBR:** is the split in §5.9 right? And the export format (Google
   Slides, PPTX, PDF)?
6. **Sequencing:** pull Home + Standups (+ People activity) ahead of Phase 8?
7. **Notifications:** Slack DM digests for pending approvals and overdue items, or
   in-app only?
8. The third segment group in the status deck — what is it called?
9. **Performance indexes / KPIs** (§5.8, §13): deferred for now — when should
   this come back on the roadmap?

---

## 12. Personal workspaces and views

Every person on the CS team logs into **their own book of business**, not a
generic list — built from per-account roles, not a job title or team roster.

- **My accounts = my active account roles.** Each account can have an EDL,
  a TA and one or more FDEs — each a role tag on that specific account, not
  a position. An account appears in someone's workspace because they hold
  an active role on it (added via "Add to my accounts" from Portfolio or
  Account 360, ended via "Leave account" — history is kept, never deleted).
  Each project has its own members the same way.
- **`reports_to` (optional):** a person can optionally mark who they report
  to — purely a UX convenience (pre-fills standup participants, powers "My
  team" below), never a permission.
- **Scope switcher** on every list screen (Home, Portfolio, Approvals,
  Standups):
  - **My accounts** — accounts/projects I hold an active role on;
  - **My team** — my own accounts **union** the active accounts of anyone
    who reports to me (shown only if someone does — most people won't see
    this option);
  - **Everyone** — the whole portfolio;
  - **A specific person** — e.g. "show me what this person holds roles on".
  All super admins *can* view everything; the switcher sets focus, it doesn't
  restrict access.
- **Default scope:** my saved default view, if I have one → else "My
  accounts" if I hold any active role → else "Everyone" (so someone with no
  roles yet never opens to an empty screen).
- **Saved views:** any combination of scope + filters (segment, health,
  lifecycle, deployment model) + sort + visible columns can be saved, named,
  and set as **my default landing view** (sidebar pinning dropped — kept
  simple).
- **Home** always opens in the person's default scope.
- **Standups** pick participants, not a team — pre-filled from `reports_to`
  and a remembered set.

## 13. Gamification (later)

Planned for Phase 10 and built on data the hub already records: the audit log
(who updated what, when), `account_roles` history, approvals turnaround, data
freshness, on-time milestones, engagement cadence, standup completion. No
internal hierarchy to build leaderboards around — mechanics would be
individual (points for keeping accounts verified and current, streaks for
standup and update habits, badges e.g. "zero stale accounts this month") and
ad hoc group leaderboards (e.g. by standup, by whoever opts into one),
rather than assuming a fixed team roster. **Performance indexes / KPIs**
(§5.8) are the more immediate deferred item — both are on hold for the same
reason: nothing new to track, just not built yet. The rule for now: record
every meaningful action with actor and timestamp (the audit log and
proposals already do), so both can be computed later without new tracking.
