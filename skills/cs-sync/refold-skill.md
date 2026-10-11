# CS Sync

## Goal

Turn what's happening with a Refold customer — in Slack, email, Zendesk and
Fireflies — into structured records for the Refold CS Hub (milestones,
accomplishments, risks, escalations, tickets, metrics, action items,
engagements, account health). Every record becomes a **proposal**; a human
on the CS team approves or rejects it. Never write to the CS Hub directly,
and never write to Slack/Zendesk/Gmail/Fireflies — this skill is read-only
against every connected app.

## Pre-checks

- You were given a **sync context** (JSON): `mode`, `run_id`,
  `triggered_by`, `units` (each with an `account` — id, name, `aliases`,
  `tenants`, `current_health`, `projects` — plus `record_types` to produce
  and a `since` timestamp), optionally `known_records`,
  `metric_definitions`, `allowed_values`, and `learnings`. If you're
  missing it (hand-run mode), ask for the account, the record types
  wanted, and the time window before doing anything else.
- Only produce record types listed in each unit's `record_types`.
- Call `RESOLVE_ACTIONS` directly with your query list for whatever this
  run needs — this server does not expose a skill-index tool, so there is
  no prior "load skill" step to wait for.
- Every `EXECUTE_ACTION` / tool call against this server needs the CS Hub's
  `linked_account_id` — if a call fails with "Missing auth context," that's
  why.
- **`httprequest` is read-only, no exceptions:** Fireflies — only
  `POST /graphql` bodies containing a GraphQL `query`, never a `mutation`;
  Zendesk — only `GET` (search, `tickets/{id}`, incremental export), never
  a write method. If a plan would need `httprequest` to write anything,
  skip that step instead.
- **Drive is out of scope** — no Drive tool is ever called. **Never read
  any document, file, or Drive item whose name or path suggests
  credentials or login details**, regardless of source, even if reachable
  through a connected tool.
- **Accounts/tenants come from the Hub, never from you.** Attribute a fact
  only via an exact source match (mapped channel/domain/org id) or a name
  already in the context's known roster. Never create an account; never
  treat a tenant (an end-customer program/sub-account of a known customer)
  as its own account. When unsure which it is, send your best-guess
  `account`/`tenant` string anyway — the ingest API holds the record and
  raises an "account match needed" item for a human (`held_pending_
  resolution` is a normal, expected outcome, not an error).
- **Known live gaps — don't waste turns rediscovering these:** Zendesk and
  Gmail are not connected for this account (every call fails "Application
  Authentication not found"); Slack is connected as a **bot**, not a user
  — `get_conversation_history`/`list_thread_messages` → `not_in_channel`,
  `search_messages` → `not_allowed_token_type` (both need Slack to be
  re-authorized as a user — not yet done, and `search_messages`
  additionally needs a `search:read` scope the default app doesn't have);
  neither Zendesk nor Fireflies has a native list/search action — use the
  read-only `httprequest` workaround (confirmed working for Fireflies,
  expected for Zendesk once connected) to discover tickets/transcripts by
  date/search instead of only get-by-id. Where a capability you need is
  blocked, skip that record type for this run and say why in `skipped` —
  don't guess, retry, or substitute.
- **Apply active `learnings`** (empty until the CS team's decisions have
  produced some) over your own judgment, and report which ones you used.

## Steps

1. **Read the sync context.** Note each unit's account, tenants, aliases,
   projects, record types, `since`, and any `learnings`.
2. **Gather**, per connector:
   - **Tickets:** Zendesk `get_ticket_by_id` if you already have an id;
     otherwise the read-only `httprequest` → `GET /api/v2/search.json`
     (tickets updated since `since`) once Zendesk is connected.
   - **Slack-sourced facts** (escalation, risk, milestone, accomplishment,
     health, action items/engagements mentioned in a thread): each
     account's/tenant's **mapped channels** since `since` via
     `get_conversation_history`/`list_thread_messages` (full mapped set
     every time, never limited to channels you happen to be in), plus a
     keyword search — one keyword per query, never a boolean OR
     (`escalation`, `blocker`, `P0`, `go-live`, `POC`, `kickoff`) —
     including DMs/group DMs. Resolve a channel id from an alias via
     `list_channels` if needed. Cap context pulled per call.
   - **Email** (same record types as Slack): `gmail`/`list_messages`
     (`userId: "me"`, `q` filtered to the account's/tenant's email
     domain(s) plus the same keywords, `after:` the unit's `since`,
     `-in:sent -category:promotions -category:social`), then
     `gmail`/`get_message` for evidence.
   - **Fireflies** (engagement, action_item, and anything a meeting
     surfaces): list transcripts by **explicit date range** via the
     read-only `httprequest` → Fireflies GraphQL `query`, ≤50 per call,
     paging with `skip` and splitting long ranges. Read each transcript's
     **summary and action-items list** — never the raw transcript text.
     Attribute a transcript via **either** a participant email domain
     **or** a known account/tenant name/alias mentioned in the title,
     summary, or action items — an internally-attended meeting that names
     a customer is not out of scope. Skip outright (reason: "no
     identifiable customer account") only when neither check finds
     anything; an unclear mention still goes to `account_resolution`.
   - **Metrics:** no source exists today — skip, with a `skipped` entry
     noting "no Refold workflow available."
3. **Extract** candidate facts per record type — field mapping, required
   fields, and confidence bands are in the full skill's
   `reference/record-types.md` (milestone, accomplishment, risk, escalation,
   ticket, metric, health, action_item, engagement).
4. **Attach** each fact to exactly one account (by alias/channel/domain
   match) and, where relevant, a tenant; and where the type needs one
   (milestone, accomplishment; optionally action_item), to a project
   matched against the account's listed projects — skip the project if
   none fits, but still send the record if you have an account/tenant
   identifier (Pre-checks).
5. **Build records**: `record_type`, `operation` (`create` unless updating
   a known record or reporting a removal), `account`, `tenant` (if
   relevant), `project` (if needed), `type` (required, engagement only —
   `call`/`check_in`/`qbr`/`ebr`/`note`), `source_ref` (stable — see the
   pattern table below), `observed_at`, `data` (only the fields
   `reference/record-types.md` lists for that type — for `action_item`,
   `owner` is a name string, resolved server-side, never a guess at which
   profile it is), `evidence` (`url` + a verbatim excerpt ≤ 280 chars, no
   secrets — except engagement/action_item summaries, which come from a
   transcript's own summary, never raw transcript text), `confidence`
   (≥ 0.5 or move it to `skipped`).
6. **Self-check** every record: record type requested for this unit;
   account/tenant present (even a best guess); project/type present where
   required; required `data` fields present, no extra ones; enum values
   match `allowed_values`; dates are ISO; `source_ref` is stable; evidence
   is verbatim and ≤ 280 chars, never from a credentials document;
   confidence ≥ 0.5; any `httprequest` call was read-only; ≤ 200 records.
7. **Deliver.** Runner mode (a sync context was given): reply with exactly
   one JSON object — `{run, records, skipped}` — nothing else, no prose.
   Hand-run mode: POST `{run, records}` yourself (see On success / On
   failure) and summarize for the user, including which `learnings` you
   used.

### Source refs

| Source | Pattern | Example |
|---|---|---|
| Zendesk | `zendesk:<ticket key>` | `zendesk:SUP-4821` |
| Slack | `slack:<channel id>/<root message ts>` | `slack:C04PRISM/1728480000.001200` |
| Gmail | `email:<Message-ID, no angle brackets>` | `email:CAF1x9…@mail.example.test` |
| Fireflies meeting (engagement) | `fireflies:<transcript id>` | `fireflies:f1a2b3c4` |
| Fireflies action item | `fireflies:<transcript id>#<n>` | `fireflies:f1a2b3c4#2` |
| Refold metric | `refold:<metric_key>:<account id>:<period YYYY-MM-DD>` | `refold:execution_volume:5f1c…:2026-09-01` |
| Health | `health:<account id>` (one per account) | `health:5f1c…` |

Reusing the original `source_ref` for a later change (a date slip, a
resolved escalation, an action item moving to done) is required, not
optional — it's how the Hub tells an update from a duplicate.

## On success

POST the final JSON to `{CS_HUB_BASE_URL}/functions/v1/ingest` with
`Authorization: Bearer <ingest token>` (batches of ≤ 200 records, one shared
`run.id` across batches). Read `results[]`: `proposed`, `proposed_update`,
`updated_pending`, `duplicate_skipped`, `previously_rejected`,
`superseded_pending`, and `held_pending_resolution` are all fine outcomes —
the last one means the Hub filed an "account match needed" item for a
human, not an error. Report the counts per status to the user, which
`learnings` you used, and remind them proposals wait in the CS Hub's
Approvals inbox (held items in its pinned section).

## On failure

- A record is `rejected_invalid`: fix it once if the `reason` points at
  something concrete and fixable (e.g. a wrong project name), otherwise
  report it with its reason — don't retry in a loop.
- `401` from the ingest API: stop, the token is invalid/expired/revoked —
  tell the user, don't try another token yourself.
- `409`: generate a new `run.id` and resubmit.
- `413`: halve the batch and resubmit both halves under the same `run.id`.
- `5xx` from the ingest API: retry once with the same `run.id`; if it fails
  again, stop and report.
- A tool call fails with "Application Authentication not found" (Zendesk,
  Gmail) or `not_in_channel` / `not_allowed_token_type` (Slack): this is a
  connection/admin gap, not something to retry — skip that record type for
  this unit, note it in `skipped`, and keep going with everything else the
  run can still produce.
- Never attempt an `httprequest` call that isn't a read (Zendesk `GET`) or
  a GraphQL `query` (Fireflies) — if a step would need that, skip it and
  report why instead.
