# Refold CS Hub — Build Spec v3 (Phase 7 onward)

> Supersedes the remaining Phase 6 blocks (6.5 live data, 6.6 QBR export, 6.7b
> polish), which fold into Phase 7. Phases 5–6 stay as the base: React UI,
> Supabase auth + MFA + RLS, provisioning, single login, cluster → namespace →
> org → tenant, 4-scope feature flags, Netlify + cloud Supabase deploy.

---

## 0. Confidentiality rule (read first)

This repository is **public**. Never commit real customer names, health
ratings, risks, contacts, metrics, Slack/email content, or any secret.
Real data enters **only through the running app** (manual entry, approved
proposals, imports executed against the database, not files in git). Seeds,
fixtures and examples use fictional companies. This rule goes into CLAUDE.md.

---

## 1. Direction

- Refold is moving away from Refold-assisted on-prem deployments. Most on-prem
  installs will be air-gapped and run by the customer, so Refold often has no
  API access to them.
- The product becomes the **Refold CS Hub**: the customer success team's single
  system of record for every account, across the whole lifecycle.
- **Phase 7 (now): account intelligence.** Super-admin (god mode) only. Every
  account has current health, projects, milestones, risks, escalations,
  tickets, metrics and touchpoints, fed by manual entry and by an agentic sync
  through Refold's MCP server. The monthly status report and EBR packs come out
  of the platform.
- **Phase 8 (next): lifecycle modules** on the same foundation — customer
  onboarding, user onboarding, POC tracking, engagement tracking, project
  tracking (§9).
- Customer-facing views (cloud / on-prem owner logins) are **frozen**: kept
  working, no new work.

---

## 2. Domain model

```
Account ── lifecycle stage: prospect → poc → onboarding → live → expansion/renewal → churned
  ├─ Contacts (customer people)                         [Phase 8: user onboarding]
  ├─ POCs (success criteria, dates, outcome)            [Phase 8]
  ├─ Onboarding plan (template tasks, owners, dates)    [Phase 8]
  ├─ Projects (delivery workstreams; an account can have several)
  │    ├─ Milestones · Accomplishments · Risks · Asks (assistance required)
  │    └─ Tenant counts (live / dev-UAT), FDEs, dates, health
  ├─ Escalations
  ├─ Tickets (mirrored from the ticketing tool via MCP)
  ├─ Engagements (touchpoints: calls, check-ins, QBR/EBR meetings, notes)
  ├─ Metrics (EBR catalog, per period, with baselines)
  └─ Deployment (existing): clusters → namespaces → orgs → tenants
Portfolio ── monthly notes: key milestones, recommendations + impact
```

Naming: **project** = a delivery workstream (what the status deck calls a
project). **Engagement** = a customer touchpoint. (Phase 6 used "engagement"
loosely; v3 uses these meanings.)

### 2.1 What the monthly status report needs

- Portfolio: accounts grouped by segment with health (Active / Caution / Risk),
  overall health per segment, key milestones by month, recommendations +
  impact.
- Per project: release #, go-live, start, expected end, EDL, FDE(s), project
  health (Completed / On schedule / Caution / Not going to be met), live and
  dev/UAT tenants, goals, upcoming milestones with status, accomplishments,
  risks (risk, impact, mitigation), challenges / assistance required, usage
  notes, issue-tracker link.

### 2.2 What an EBR pack needs (metric catalog, per account per period)

| Category | Metrics |
|---|---|
| Velocity | Avg integration build time (before / current), engineering hours saved, active production connectors |
| Operations | Workflow success rate (target ≥ 99.9%), self-healing rate, MTTR, execution volume |
| Financial ROI | SI/outsourcing savings, pipeline/deal acceleration, maintenance cost offset |
| Adoption | Integration catalog coverage %, agent & MCP usage |
| Governance & support | P1/P2 response SLA (from tickets), SOC2 / security / retention check, docs feedback |
| Forward-looking | Feature requests + status, 30-60-90 action plan, expansion targets / license tier |

Segments are a **lookup table** (seeded Enterprise, SMB; more can be added in the
UI) so new groupings need no migration.

---

## 3. One write pipeline

Every input — manual edit, chat agent, agentic sync, file import — becomes
either a direct audited change (manual) or a **proposal** that a person
approves. Every stored record carries provenance: `source`
(manual / agent / chat / api / file), `source_ref`, created/updated by,
`verified_at`, and the proposal it came from.

| Input | Behavior |
|---|---|
| Super admin edits in the UI | Applied immediately, audited |
| Chat agent | Proposal shown inline; applied when the user approves |
| Agentic sync (Refresh button or daily) | Proposals → Approvals inbox |
| File import (air-gapped usage export) | Proposals → Approvals inbox |

**Who approves:** the logged-in super admin. Any super admin can act on any
pending item; the approver is recorded.

### 3.1 Approvals inbox

One screen for every pending kind: metrics, updates (milestones,
accomplishments), risks, escalations, tickets, health changes, deletes. Filters
by type, account, source, age, "my active roles" ("My accounts"). Each item:
field-level diff, evidence (link + short excerpt), proposer. Actions: approve,
edit-then-approve, reject with reason, bulk. Pending count badge in the nav.

### 3.2 Audit log screen

Every change: who, on behalf of what (chat agent / sync / file), action
(add / edit / delete / approve / reject), record and field-level before → after,
when, source proposal. Filters + CSV export. Enforced by **database triggers**
so nothing bypasses it. Visible to super admins; read-only.

### 3.3 Coverage view

Per account and section: missing, stale (> 30 days unverified), pending
approval. This is how "complete coverage" is measured.

---

## 4. Agentic sync via Refold MCP

### 4.1 Setup (decided)

- One **generic CS service user** in Refold and **one MCP server config**.
  The server exposes every tool the sync needs: Slack, email, ticketing, CRM,
  Drive, deterministic Refold workflows (execution stats, connector inventory),
  and Refold platform metrics.
- The Server URL is a secret stored in Supabase Edge Function env only.
- Because all reads use the CS service user, the sync sees exactly what that
  user is a member of — add it to every shared customer channel and mailbox
  you want covered.

### 4.2 The CS Sync Skill (our deliverable)

A skill document (`skills/cs-sync/SKILL.md` + JSON schemas) that tells the agent
using the Refold MCP server:

1. **Modes:** full backfill (all record types for one or all accounts), ad hoc
   scoped run (one account × one record type since a date), daily incremental.
2. **Per record type:** which tools to use, what to look for, field mapping,
   how to judge confidence, and the dedupe key (`source_ref`: Slack message ts,
   email id, ticket key …).
3. **Account matching:** resolve messages/tickets to accounts using account
   aliases (channel names, email domains, CRM ids).
4. **Output and API call:** the exact payload and how to call the CS Hub ingest
   API (§4.3), in batches.
5. **Guardrails:** never invent values; quote evidence; skip if unsure; cap
   excerpt length; no secrets in payloads.

The same skill works from the platform's Edge Function runner (Refresh + daily)
and when run by hand in Claude or a Refold agent.

### 4.3 Ingest API contract (final, 7.4)

`POST /functions/v1/ingest` · `Authorization: Bearer <ingest token>` — a
`cshub_`-prefixed bearer token minted via the Ingest Tokens admin screen
(`/ingest-tokens`), not a Supabase JWT. Full reference, including every
record type's fields and every result status: `docs/ingest-api.md` — that
is what 7.5's CS Sync Skill is written against; this section is a summary.

```json
{
  "run": { "id": "uuid", "mode": "scoped|backfill|daily", "source": "agent|chat|file",
           "triggered_by": "super-admin-profile-uuid|system",
           "scope": { "account": "id-or-alias", "record_type": "tickets", "since": "ISO date" } },
  "records": [
    { "record_type": "risk", "operation": "create|update|delete",
      "account": "id-or-alias", "project": "optional id-or-name",
      "source_ref": "slack:C123/1727.0012", "observed_at": "ISO",
      "data": { "...fields per schema..." },
      "evidence": { "url": "permalink", "excerpt": "≤ 280 chars" },
      "confidence": 0.0 }
  ]
}
```

`triggered_by` is a caller *claim*, validated server-side (accepted only as
`system` or an existing super_admin profile id; otherwise stored `null`,
and the response's `run.triggeredByAccepted` says so). `run.source` defaults
to `agent` and is reused as-is by 7.6 (chat) and 7.8 (file import).

Every record goes through the same upsert decision tree regardless of the
caller-stated `operation` — the sync skill doesn't need to track platform
state, just report facts via `source_ref`:

1. A pending proposal already exists for `(account, table, source_ref)` →
   merge into it → **`updated_pending`**.
2. Else the most recently decided `rejected` proposal for that key has an
   **identical** payload → **`previously_rejected`** (skip — a human already
   said no and nothing changed). A changed payload falls through to 3.
3. Else a real row already exists for `(account, source_ref)`: identical
   current values → **`duplicate_skipped`**; different → an `update`
   proposal against that row → **`proposed_update`** (the path a ticket's
   status change takes on every sync run).
4. Else → a new `create` proposal → **`proposed`**.

Comparisons are normalized (dates to one form, numeric coercion, trimmed
strings, lowercased enums, only the fields the caller actually sent) so a
daily re-sync never files a false `proposed_update` from formatting alone.
An explicit `delete` against a `source_ref` that only matches a still-
pending `create` cancels that proposal (`superseded`) and reports
**`superseded_pending`**, rather than treating it as invalid.

Everything lands as a proposal; **nothing is applied by the API** — 7.3's
Approvals inbox and `apply_proposal()` act on the result unchanged. Limits:
max 200 records/request, 2 MB body, evidence excerpts truncated to 280
chars, unknown `data` fields stripped (listed per-record, not fatal). No
browser CORS (server-to-server only); function logs never contain request
bodies, record data, or evidence excerpts.

### 4.4 Refresh buttons and daily job

- Sync unit = **(account, record type)** with a watermark in `sync_state`
  (last_synced_at, status, error, lock).
- **Refresh** on any record screen (tickets, updates, risks, metrics …) runs that
  account × type only, from its last sync to now; shows "last synced …".
- **Daily job** (pg_cron) loops the same units — one code path.
- Idempotent via `source_ref`; watermark advances only on success; one run per
  unit at a time.

### 4.5 Chat agent ("ask the hub")

A god-mode chat panel using the same MCP server plus read tools over the
platform: ask ("what's at risk this month?"), act ("log this update" → inline
proposal), draft ("prep EBR metrics for account X"). Never writes directly.

### 4.6 Attribution

Tool reads run as the CS service user. In the platform, each proposal records
`proposed_by = cs-sync-agent` plus `triggered_by` (the user who clicked Refresh
or chatted, or "system" for the daily job). Applying requires a logged-in
approver, so the audit log always names a person.

---

## 5. Data model v3 (Postgres)

All new tables: RLS **super-admin only**, writes require AAL2 (D-029), audit
trigger attached.

- `segments` (lookup): name, sort.
- `organizations` (extend): `segment_id`, `deployment_model`
  (`cloud` | `onprem_managed` | `onprem_airgapped`), `health`
  (`active` | `caution` | `risk`), `lifecycle_stage`
  (`prospect` | `poc` | `onboarding` | `live` | `expansion` | `renewal` |
  `churned`), `data_access_mode` (`api` | `manual` | `mixed`),
  `aliases text[]`. **`owner_profile_id` retired** (equal-admins model,
  superseding 7.2a's derivation design) — the account's EDL is read live
  from its active `account_roles` rows (§5 "People and account roles"), not
  stored on the organizations row.
- `projects`: org, name, release_no, start / go-live / expected-end dates,
  health (`completed` | `on_schedule` | `caution` | `at_risk`), live_tenants,
  dev_uat_tenants, goals text[], fdes text[], edl_profile_id,
  issue_tracker_url.
- `milestones` (project, period/date, description, status), `accomplishments`
  (project, period, text), `risks` (project?, risk, impact, mitigation,
  severity, status, owner), `asks` (project?, text, owner, status).
- `escalations`: org, project?, title, severity, raised_by, raised_at, status,
  resolution.
- `tickets`: org, external_key, title, priority, status, opened_at, updated_at,
  url, system.
- `engagements` (touchpoints): org, type (call / check-in / qbr / ebr / note),
  date, attendees, summary, follow-ups.
- `metric_definitions` (key, label, unit, category, has_baseline) — seeded with
  §2.2 (generic, safe to commit); `metric_values` (org, project?, metric_key,
  period, value, baseline_value).
- `portfolio_notes`: period, kind (milestone / recommendation), text, impact.
- `proposals`: target_table, target_id (null on create), operation, payload,
  source, source_ref, evidence_url, evidence_excerpt, confidence,
  proposed_by, triggered_by, run_id, status
  (`pending` | `approved` | `rejected` | `superseded`), decided_by,
  decided_at, reason.
- `sync_state`: org, record_type, last_synced_at, last_status, last_error,
  locked_until. `sync_runs`: per run log, counts, cost.
- `ingest_tokens` (7.4): hashed, scoped, expiring.
- Provenance columns on every record table: `source`, `source_ref`,
  `created_by`, `updated_by`, `verified_at`, `proposal_id`.
- `audit_log` (extend): `on_behalf_of`, `record_table`, `record_id`,
  `before jsonb`, `after jsonb`, `proposal_id`; written by a generic trigger.

**People and account roles (equal-admins model — supersedes 7.2a's titles/
teams/account_assignments design):**

Every admin is a peer — no internal org chart on the platform, no titles, no
RBAC by role. A person's involvement in an account is a per-account **role
tag**, for record-keeping only (feeds future performance indexes, §13 of
product-overview.md); it grants no permissions.

- `account_roles`: profile, org, role (`edl` | `ta` | `fde`), `started_at`,
  `ended_at` (null = active). At most one ACTIVE role per (profile, org);
  changing role ends the current row and inserts a new one — history is
  never hard-deleted (no DELETE policy at all). Replaces
  `account_assignments` and the `organizations.owner_profile_id` derivation
  it fed — the account's EDL is read live from its active `edl` rows.
- `profiles.reports_to` (nullable, self-FK): an **optional UX convenience**
  — pre-fills standup participants and powers the "My team" scope option —
  **never permissions**. No self-reference, no cycles (enforced by a
  trigger that walks the chain).
- `project_members`: project, profile, role (`edl` | `fde` | `ta`) —
  unchanged from 7.2a. Still replaces `projects.fdes text[]` and
  `projects.edl_profile_id`.
- `saved_views`: owner profile, name, page, scope
  (`mine` | `team` | `everyone` | `person`), scope target, filters jsonb,
  sort, columns, `is_default` ("set as default" only — sidebar pinning
  dropped).
- Scope helpers (SQL functions): `my_account_ids()`, `my_team_account_ids()`
  (my own active roles **union** my direct reports' — via `reports_to`, not
  a team), `person_account_ids(profile)` — used by every list query so
  "My accounts / My team / Everyone / person" behave identically everywhere.
  Scope is focus only, never access control.
- Every new table: super-admin RLS + AAL2 writes + audit trigger, same as 7.1.

See also docs/product-overview.md §12 (personal workspaces) and §13
(gamification — performance indexes/KPIs deferred to a later block; no new
tracking needed, the audit log + `account_roles` history already capture
what's needed).

Phase 8 adds: `contacts`, `pocs` (+ success criteria), `onboarding_templates`,
`onboarding_plans`, `onboarding_tasks`, renewals. The standups block adds
`standups` (host + a remembered participant set, not per-team),
`standup_entries`, `action_items`.

---

## 6. Phase 7 blocks

| Block | Scope |
|---|---|
| **7.1 Data model v3** | Migrations for §5 (not ingest_tokens), lookup seeds, metric catalog seed, RLS, audit trigger, provenance columns, TS types, fictional local fixtures. No UI. |
| **7.2a People, teams, assignments, scoped views** | *Superseded* by the equal-admins model (see "People and account roles" above) — titles/teams/account_assignments were built, then reversed. `account_roles` + `reports_to` + the Team Structure screen (now "People") replaced them in the same phase slot. |
| **7.2b Portfolio + Account 360** | Portfolio board + coverage tab, Account 360 (6 tabs), Add account (no invite), inline add / edit / delete, Mark verified, source badges, last-verified — every list using the scope switcher and saved views. |
| **7.3 Approvals inbox + audit log screen** | §3.1 and §3.2, scoped (My accounts / My team / Everyone). |
| **Home + Standups + People activity** | Personal Home in default scope ("my day"); Standups — anyone can host, participants pre-filled from `reports_to` + a remembered set, several per day is normal; People activity — per-person active roles, history, recent activity (replaces the earlier "Team/FDE performance" framing, which assumed a hierarchy). |
| **Performance indexes / KPIs** | Deferred to a later block, alongside gamification (Phase 10) — computed from `account_roles` history + the audit log; no new tracking needed. |
| **7.4 Ingest API** | §4.3 endpoint, tokens, validation against schemas, account alias resolution, dedupe. |
| **7.5 CS Sync Skill + runner + Refresh** | `skills/cs-sync`, Edge Function runner calling Claude with the Refold Server URL, `sync_state`, Refresh buttons, daily pg_cron job, run logs, kill switch. |
| **7.6 Chat agent** | §4.5. |
| **7.7 Reports** | Monthly status report and EBR pack generated from platform data. |
| **7.8 Air-gapped import** | Usage-export bundle format → proposals. |

## 7. Phase 8 — lifecycle modules (planned)

| Module | Scope |
|---|---|
| Customer onboarding | Templates → per-account plans, tasks, owners, due dates, progress, blockers |
| User onboarding | Customer user enablement (access, training, certification) — scope to confirm |
| POC tracking | Success criteria, timeline, stakeholders, outcome, conversion to customer |
| Engagement tracking | Touchpoint cadence, QBR/EBR schedule, follow-ups, sentiment |
| Project tracking | Fuller project management on `projects` (tasks, dependencies, timeline view) |
| Renewals & expansion | Renewal dates, risk, expansion pipeline |

Every module uses the same proposal pipeline, audit, provenance and agentic
sync (new record types added to the CS Sync Skill).

## 8. Decisions to log (next free ids)

1. Product re-scoped to the Refold CS Hub; Phase 7 is super-admin only;
   customer portals frozen.
2. Public-repo confidentiality rule (§0).
3. Single proposal pipeline with field-level provenance; DB-trigger audit;
   logged-in super admin approves.
4. One generic CS service user + one Refold MCP server; CS Sync Skill is the
   contract; platform runner posts structured output to the ingest API.
5. Sync unit = (account, record type) with watermark; Refresh and daily share
   one code path.
6. "Project" = delivery workstream, "engagement" = touchpoint.
7. Old 6.5 → 7.5 (Refold platform metrics via MCP), old 6.6 → 7.7.
8. Equal admins, no internal hierarchy: every admin is a peer; involvement in
   an account is a per-account role tag (`account_roles`, record-keeping
   only, with history) rather than a title or team membership;
   `reports_to` is an optional, permission-free UX convenience. Every list
   has a My accounts / My team / Everyone / person scope and saved views
   (sidebar pinning dropped). Standups: anyone hosts, participants
   pre-filled from `reports_to` + remembered. Performance indexes / KPIs
   deferred to a later block with gamification, computed from the audit log
   + `account_roles` history. (Supersedes the earlier "Head of CS → EDL/TA
   leads → FDEs" team-structure item.)

## 9. Open questions (non-blocking for 7.1)

1. Third segment group in the status deck — name it (segments are editable, so
   this doesn't block).
2. Report format for 7.7: Google Slides, PPTX, or both.
3. "User onboarding" in Phase 8: customer users onboarding onto Refold, or
   internal team onboarding?
4. Should the repo go private? If so, the planning room needs another way to
   read it (e.g. a GitHub connector).
