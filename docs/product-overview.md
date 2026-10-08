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

| Persona | Role in the system | What they mainly do |
|---|---|---|
| **Head of CS** | super_admin, *Head of CS* title | Whole portfolio, every team, FDE performance, approvals, monthly status report, sign-off on EBR/QBRs |
| **EDL / TA (team lead)** | super_admin, *EDL* or *TA* title | Owns a set of accounts and leads a team of FDEs; runs **their team's** standup; reviews their team's accounts and performance |
| **FDE** | super_admin, *FDE* title | Works the accounts and projects assigned to them; keeps records current; approves sync proposals; logs engagements; prepares EBR/QBR inputs; writes knowledge articles |
| **Refold member** (sales, product, engineering, leadership) | **new read-only internal role** | Search and read the knowledge base and team docs; view account summaries (scope to confirm, §11) |
| Customer admins (cloud / on-prem owners) | existing, frozen | Unchanged; no new work |

Notes:

- **Team structure:** Head of CS → EDLs and TAs (team leads) → FDEs. Each lead has
  a set of accounts and a set of FDEs. An account can have an EDL, a TA and
  several FDEs assigned. All of them are **linked people (profiles)**, not text
  names, which is what makes "my accounts", per-team standups and performance
  trackable (see §10 and §12).
- "Super admin" stays the access level for everyone on the CS team. A **title**
  (Head of CS / EDL / TA / FDE) plus **reporting lines** decide default views and
  what performance data each person sees.

---

## 3. What the hub holds

```
Account  (segment, deployment model, health, lifecycle stage, owner)
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

Team
 ├─ People (FDEs/EDLs)  accounts owned, projects, workload, performance
 └─ Standups            daily entries, blockers, action items

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

| Sidebar item | Who sees it | What it is |
|---|---|---|
| **Home** | everyone | Personal "my day" (§5.1) |
| **Portfolio** | super admins | All accounts by segment and health; coverage tab |
| **Accounts** | super admins (members: read, scope TBC) | List → **Account 360** |
| **POCs** | super admins | POC pipeline board |
| **Onboarding** | super admins | Active onboarding plans across accounts |
| **Projects** | super admins | Cross-account project list and timeline |
| **Standups** | super admins | Daily standup board + history |
| **Team** | Head of CS (FDEs: own profile) | FDE workload and performance |
| **Reports** | super admins | Monthly status, EBR, QBR builder + history |
| **Approvals** | super admins | One inbox for every pending proposal (badge) |
| **Documents** | everyone (permissioned) | Drive-backed document base |
| **Knowledge base** | everyone | Articles + search |
| **Ask the Hub** | everyone (scoped) | Chat panel, available from any screen |
| **Admin** → Users & roles, Deployments (existing god view, clusters), Feature flags, Sync status, Audit log, Settings | super admins (audit: Head of CS) | Existing admin portal |

---

## 5. Screens and what they show

### 5.1 Home ("my day")

- **For an FDE:** my accounts with health changes since yesterday; my pending
  approvals; my milestones due or overdue this week; my open escalations and P1/P2
  tickets; accounts with no engagement in N days; stale records on my accounts;
  today's standup entry (pre-drafted).
- **For the Head of CS:** the same, plus portfolio deltas (accounts that changed
  health, new escalations, slipped milestones), team approvals backlog, and FDEs
  with overdue items.
- **For a Refold member:** knowledge base search, recently updated articles, team
  docs.

### 5.2 Portfolio

- **Board tab:** accounts grouped by segment (Enterprise / SMB / …), each showing
  health, lifecycle stage, deployment model, owner, open escalations, next
  milestone, last engagement, and coverage %. Filters: segment, health, lifecycle,
  owner, deployment model. Sections for **monthly key milestones** and
  **recommendations + impact** (editable; they feed the status report). **Add
  account** creates a record directly, with no invite (prospects, POCs,
  air-gapped customers).
- **Coverage tab:** account × section grid (projects, milestones, risks,
  escalations, tickets, engagements, metrics, contacts …) marked current / stale
  (> 30 days) / missing / pending approval. This is how "complete coverage" is
  measured.

### 5.3 Account 360

Header: name, segment, health, lifecycle stage, deployment model, owner, last
engagement, coverage %, **Refresh** (sync this account), **Ask about this
account**, and "View deployment →" when one exists.

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

### 5.7 Standups (one per team)

- **There is no single standup.** Each EDL/TA runs their own team's standup:
  their FDEs, over their accounts. The Head of CS can open any team's standup and
  sees a cross-team roll-up of blockers and action items.
- **Board for a team and date:** one card per team member.
- **Auto-drafted "since last standup":** records they changed, approvals done, new
  escalations and tickets on their accounts, milestones hit or slipped, metrics
  updated.
- Each FDE edits **Yesterday / Today / Blockers** before or during the call.
- **Live mode:** steps through FDEs one by one with a timer.
- Blockers can be turned into **asks** on an account and **action items** with an
  owner and due date.
- History is searchable; open action items carry over to the next day.

### 5.8 Team (FDE performance)

Per FDE profile, from data the hub already holds:

| Signal | From |
|---|---|
| Accounts and projects owned, workload | ownership, project members |
| Health of owned accounts (now + trend) | account health history |
| Milestones delivered on time vs. slipped | milestones |
| POC win rate *(Phase 8)* | POCs |
| Escalations: count, time to resolve | escalations |
| Ticket SLA adherence (P1/P2) | tickets |
| Engagement cadence (days since last touch per account) | engagements |
| Data freshness on their accounts (coverage %) | provenance |
| Approval turnaround | proposals |
| EBR/QBRs delivered on schedule | reports |
| Standup commitments completed | standups |

These are **signals for coaching conversations, not automatic verdicts**. Each
metric links to the records behind it. Visibility: the Head of CS sees everyone;
an EDL/TA sees their team; an FDE sees their own. These same signals later feed
**gamification** (§13).

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
  when, with filters and CSV export (Head of CS).

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

### J1 — Head of CS, Monday

1. Home shows: 2 accounts moved to *Caution*, 1 new escalation, 3 slipped
   milestones, 14 pending approvals.
2. Opens an account that turned *Caution*; Overview shows the reason and the Slack
   evidence from the overnight sync.
3. Asks the Hub, "what changed here since last week?"
4. Assigns a follow-up to the FDE as an action item.

### J2 — FDE, daily

1. Home shows overnight sync proposals on their accounts.
2. Approves 5, edits 1, rejects 1.
3. After a customer call, logs an engagement, adds a milestone, and attaches the
   deck from Drive.
4. Marks the metrics section verified.

### J3 — Daily standup

1. Each FDE's card is pre-drafted from yesterday's activity; the FDE tweaks it.
2. The Head of CS runs live mode and walks through each FDE.
3. Blockers become asks and action items with owners.
4. Standup is saved; open items roll forward.

### J4 — Customer lifecycle

1. New prospect added on the Portfolio board.
2. POC created with success criteria and tracked to **won**.
3. The onboarding plan (air-gapped template) starts automatically.
4. Project created with an EDL and FDEs.
5. Go-live: lifecycle becomes **live**, and the EBR/QBR cadence is set.

### J5 — QBR / EBR prep

1. Reports → QBR → account → quarter.
2. The hub assembles metrics, milestones, tickets and risks, and lists gaps.
3. The FDE clicks Refresh on tickets and enters two metric values.
4. AI drafts the narrative; the FDE edits it and the Head of CS reviews.
5. Export; the meeting is logged as an engagement with the deck attached.

### J6 — Monthly status report

Reports → month → generated portfolio + per-project slides → review → export →
share.

### J7 — Escalation from Slack

1. The overnight sync spots an escalation in a customer channel and files a
   proposal.
2. The owner approves it, creating an escalation record.
3. It shows on Home, the Portfolio card, and the next standup.
4. When resolved, a lesson is promoted to the KB.

### J8 — Refold member

Searches the KB ("air-gapped install prerequisites"), reads an article, opens
the linked runbook in Documents. Asks the Hub a product question answered from
KB + docs.

### J9 — FDE coaching (Head of CS)

1. Team → FDE profile.
2. Reviews workload, owned-account health trend, on-time milestones, escalation
   resolution, engagement cadence, and data freshness.
3. Drills into the records behind any number.
4. Discusses it in a 1:1.

### J10 — Onboarding a new FDE

Admin → invite → assign the *FDE* sub-role → assign accounts and projects → they
log in, enroll MFA, and land on Home.

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

| Capability | Head of CS | FDE | Refold member | Customer admin |
|---|---|---|---|---|
| View all accounts | ✅ | ✅ | summary only (TBC) | own org only (frozen) |
| Edit records, approve proposals | ✅ | ✅ | — | — |
| Team: all FDEs' performance | ✅ | own only | — | — |
| Audit log | ✅ | own changes (TBC) | — | — |
| Standups | run + edit all | edit own | — | — |
| Reports | ✅ | ✅ | view shared (TBC) | — |
| Documents | ✅ | ✅ | team docs (account docs TBC) | — |
| Knowledge base | edit | edit | read | — |
| Admin (users, flags, deployments) | ✅ | ✅ (TBC) | — | — |

---

## 9. Build sequence

| Phase | Blocks | Outcome |
|---|---|---|
| **7 — Account intelligence** | 7.1 ✅ data model · **7.2a People, teams, assignments, scoped views** · **7.2b Portfolio + Account 360** · 7.3 Approvals + Audit screen · then **Home + per-team Standups + Team** · 7.4 Ingest API · 7.5 CS Sync Skill + Refresh + daily · 7.6 Ask the Hub · 7.7 Reports (monthly, EBR, QBR) · 7.8 Air-gapped import | Every person works their own accounts; complete, current records + reports |
| **8 — Lifecycle** | Contacts · POCs · Onboarding templates/plans · Engagement cadence · Project timeline | Prospect → POC → onboarding → live, tracked |
| **9 — Knowledge** | Documents (Drive) · Knowledge base · Refold member role · global search | Company knowledge layer |
| **10 — Gamification** | Points, streaks, badges, leaderboards (§13) | Habits that keep the hub current |

Home, standups and the Team view move ahead of Phase 8 (default chosen, since the
team structure is central to daily use).

---

## 10. Changes this implies for what's already planned

1. **People, teams and assignments (7.2a).** 7.1 stored FDEs as text names
   (`projects.fdes text[]`) and a single `owner_profile_id`. Replace with linked
   people: titles, teams (lead + members), account assignments (EDL / TA / FDE)
   and project members. This is a migration, so push it to cloud before the code.
2. **Titles:** Head of CS / EDL / TA / FDE on each profile; add a new **Refold
   member** account type (read-only internal) in Phase 9.
3. **Health history:** keep a history of account and project health changes (the
   audit log already captures them; Team trends read from it, or a light history
   table).
4. **QBR** joins EBR in 7.7 (old plan only had EBR).
5. **Navigation** in 7.2 should match §4 (Portfolio + Accounts), so later items
   slot in without reshuffling.

---

## 11. Questions for the Head of CS

Defaults assumed until answered: documents stay in Google Drive; Refold members
get KB + team docs only; performance visibility is Head of CS → all, lead → team,
FDE → own; Home + Standups + Team follow 7.3.

1. **Refold member access:** knowledge base + team docs only, or also read-only
   account summaries (health, projects)? Any accounts or fields that should stay
   CS-only?
2. **Documents:** Drive-backed as described (files stay in Google Drive), or files
   stored in the hub itself?
3. **FDE performance visibility:** Head of CS sees all, FDE sees own — right? Is the
   signal list in §5.8 right?
4. **Standups:** daily? Live call, async, or both? Roughly how many FDEs?
5. **EBR vs. QBR:** is the split in §5.9 right? And the export format (Google
   Slides, PPTX, PDF)?
6. **Sequencing:** pull Home + Standups (+ Team) ahead of Phase 8?
7. **Notifications:** Slack DM digests for pending approvals and overdue items, or
   in-app only?
8. The third segment group in the status deck — what is it called?

---

## 12. Personal workspaces and views

Every person on the CS team logs into **their own book of business**, not a
generic list.

- **Assignments:** each account can have an EDL, a TA and one or more FDEs
  assigned; each project has its own members. An account appears in someone's
  workspace through these assignments.
- **Teams:** each EDL/TA leads a team of FDEs. A person can belong to more than
  one team if needed.
- **Scope switcher** on every list screen (Portfolio, Accounts, Projects,
  Approvals, Standups, Team):
  - **Mine** — accounts and projects I'm assigned to (default for FDEs);
  - **My team** — everything my team members are assigned to (default for
    EDL/TA);
  - **Everyone** — the whole portfolio (default for Head of CS);
  - **A specific person or team** — e.g. "show me what this FDE owns".
  All super admins *can* view everything; the switcher sets focus, it doesn't
  restrict access.
- **Saved views:** any combination of scope + filters (segment, health,
  lifecycle, deployment model) + sort + visible columns can be saved, named,
  pinned to the sidebar, and set as **my default landing view**.
- **Home** always opens in the person's default scope.
- **Standups** pick a team; each lead's standup covers their members and their
  accounts.

## 13. Gamification (later)

Planned for Phase 10 and built on data the hub already records: the audit log
(who updated what, when), approvals turnaround, data freshness, on-time
milestones, engagement cadence, standup completion. Likely mechanics: points for
keeping accounts verified and current, streaks for standup and update habits,
badges (e.g. "zero stale accounts this month"), and team (not just individual)
leaderboards. The rule for now: record every meaningful action with actor and
timestamp (the audit log and proposals already do), so gamification can be
computed later without new tracking.
