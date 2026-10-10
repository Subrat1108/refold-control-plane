# CS Sync

## Goal

Turn what's happening with a Refold customer — in Slack, email, Zendesk and
Refold platform tools — into structured records for the Refold CS Hub
(milestones, accomplishments, risks, escalations, tickets, metrics, account
health). Every record becomes a **proposal**; a human on the CS team
approves or rejects it. Never write to the CS Hub directly, and never write
to Slack/Zendesk/Gmail — this skill is read-only against every connected
app.

## Pre-checks

- You were given a **sync context** (JSON): `mode`, `run_id`,
  `triggered_by`, `units` (each with an `account` — id, name, `aliases`,
  `current_health`, `projects` — plus `record_types` to produce and a
  `since` timestamp), optionally `known_records`, `metric_definitions`, and
  `allowed_values`. If you're missing it (hand-run mode), ask for the
  account, the record types wanted, and the time window before doing
  anything else.
- Only produce record types listed in each unit's `record_types`.
- Call `RESOLVE_ACTIONS` directly with your query list for whatever this
  run needs — this server does not expose a skill-index tool, so there is
  no prior "load skill" step to wait for.
- Every `EXECUTE_ACTION` / tool call against this server needs the CS Hub's
  `linked_account_id` — if a call fails with "Missing auth context," that's
  why.
- **Known live gaps — don't waste turns rediscovering these:** Zendesk and
  Gmail are not connected for this account (every call fails
  "Application Authentication not found"); Slack's bot is not a member of
  any channel yet (`get_conversation_history`/`list_thread_messages` →
  `not_in_channel`); `search_messages` cannot work at all (bot token, not a
  user token); no Zendesk/Fireflies action lists items, only gets one by
  id; zero Refold workflows exist, so no metric has a source yet. Where a
  capability you need is blocked by one of these, skip that record type for
  this run and say why in `skipped` — don't guess, retry, or substitute.

## Steps

1. **Read the sync context.** Note each unit's account, aliases, projects,
   record types, and `since`.
2. **Gather.** For each unit and each requested record type, resolve and run
   the relevant action:
   - Tickets: `zendesk` / `get_ticket_by_id` (only if you already have an
     id — there is no list/search action).
   - Slack signals (escalation, risk, milestone, accomplishment, health):
     `slack` / `get_conversation_history` (channel + `oldest`), then
     `slack` / `list_thread_messages` (channel + `ts`) on threads that look
     relevant. Resolve a channel id from the account's aliases via
     `slack` / `list_channels` if you only have a name.
   - Email: `gmail` / `list_messages` (`userId: "me"`, `q` filtered to the
     account's email domain(s) from aliases, `after:` the unit's `since`),
     then `gmail` / `get_message` for evidence.
   - Metrics: no source exists today — skip, with a `skipped` entry noting
     "no Refold workflow available."
3. **Extract** candidate facts per record type — field mapping, required
   fields, and confidence bands are in the full skill's
   `reference/record-types.md` (milestone, accomplishment, risk, escalation,
   ticket, metric, health).
4. **Attach** each fact to exactly one account (by alias/channel/domain
   match) and, where the type requires it (milestone, accomplishment), to a
   project matched against the account's listed projects — skip if none
   fits.
5. **Build records**: `record_type`, `operation` (`create` unless updating
   a known record or reporting a removal), `account`, `project` (if
   needed), `source_ref` (stable — see the pattern table below),
   `observed_at`, `data` (only the fields `reference/record-types.md` lists
   for that type), `evidence` (`url` + a verbatim excerpt ≤ 280 chars, no
   secrets), `confidence` (≥ 0.5 or move it to `skipped`).
6. **Self-check** every record: record type requested for this unit;
   account resolves; project present and valid where required; required
   `data` fields present, no extra ones; enum values match
   `allowed_values`; dates are ISO; `source_ref` is stable; evidence is
   verbatim and ≤ 280 chars; confidence ≥ 0.5; ≤ 200 records in this
   payload.
7. **Deliver.** Runner mode (a sync context was given): reply with exactly
   one JSON object — `{run, records, skipped}` — nothing else, no prose.
   Hand-run mode: POST `{run, records}` yourself (see On success / On
   failure) and summarize for the user.

### Source refs

| Source | Pattern | Example |
|---|---|---|
| Zendesk | `zendesk:<ticket key>` | `zendesk:SUP-4821` |
| Slack | `slack:<channel id>/<root message ts>` | `slack:C04PRISM/1728480000.001200` |
| Gmail | `email:<Message-ID, no angle brackets>` | `email:CAF1x9…@mail.example.test` |
| Refold metric | `refold:<metric_key>:<account id>:<period YYYY-MM-DD>` | `refold:execution_volume:5f1c…:2026-09-01` |
| Health | `health:<account id>` (one per account) | `health:5f1c…` |

Reusing the original `source_ref` for a later change (a date slip, a
resolved escalation) is required, not optional — it's how the Hub tells an
update from a duplicate.

## On success

POST the final JSON to `{CS_HUB_BASE_URL}/functions/v1/ingest` with
`Authorization: Bearer <ingest token>` (batches of ≤ 200 records, one shared
`run.id` across batches). Read `results[]`: `proposed`, `proposed_update`,
`updated_pending`, `duplicate_skipped`, `previously_rejected`, and
`superseded_pending` are all fine outcomes — report the counts per status to
the user and remind them proposals wait in the CS Hub's Approvals inbox.

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
