# Tool map — Refold MCP server "CS Hub"

Finalized 2026-10-10 against the live `CS Hub` MCP server
(`environment: test`, `mode: agent`, `expose_skills: false`,
`interactive_auth: false`). The CS Sync agent reads everything through this
one server, connected as the generic CS service user (`cs-hub` linked
account). In **agent mode** the server exposes exactly two MCP tools —
`RESOLVE_ACTIONS` (turn a list of plain-English query strings into
`{slug, type, identifier, json_schema}` entries) and `EXECUTE_ACTION` (run
one resolved action: `application_slug`, `action_id`, `input_payload`,
`type`). There is no `GET_KNOWLEDGE_INDEX`/`LOAD_SKILL` tool on this server
(`expose_skills` is off), so always call `RESOLVE_ACTIONS` directly with the
query list — don't wait for a skill-index step that doesn't exist here.

A deterministic alternative to the MCP round-trip exists for every action
once you already know its `application_slug`/`action_id`/input shape:
`POST /api/v2/integration-schema/{slug}/actions/{action_id}/execute`
(`x-api-key` + `linked_account_id` headers, no LLM in the loop). **The outer
HTTP status from this endpoint is always 200 even when the underlying app
call fails** — check `node_status` (`"Success"` / `"Errored"`) in the body,
not just that the request didn't throw.

## Connected apps and what actually works today

| App | Connected (application-level) | Usable now | Notes |
|---|---|---|---|
| Slack | ✅ (oauth2) | ⚠️ partially | See below — channel reads are blocked, not the auth. |
| Fireflies | ✅ (keybased) | ⚠️ partially | Connection works (`list_users` succeeds); no discovery action exists (see below). |
| Zendesk | ❌ `connected: false` | ❌ | Every call returns `Application Authentication not found for linked_account_id cs-hub and app zendesk`. Needs the OAuth/API-key connection completed in the Refold dashboard for this linked account before any ticket data can flow. |
| Gmail | ❌ `connected: false` | ❌ | Same failure, app `gmail`. Needs the Gmail connection completed for this linked account. |

**Real, unexpected blockers found this session (not placeholders, not
"needs real server details" — these are the real server, and these are the
real gaps):**

1. **Slack: `get_conversation_history` and `list_thread_messages` return
   `not_in_channel` for every channel tried.** The connected Slack
   identity (bot, team `T0456SB6K4Z`) is not a member of any channel in the
   workspace — `list_channels`/`list_users` work (they don't need channel
   membership) but reading any channel's history does not, customer
   channels included. **Someone needs to invite the CS Hub Slack app/bot
   into at least the customer channels the sync should read** before this
   capability produces anything.
2. **Slack: `search_messages` returns `not_allowed_token_type` — structural,
   not a permissions fix.** Slack's `search.messages` API requires a
   user-scope token; the CS Hub's Slack connection is bot-token-based and
   can never call it as currently configured. Treat `search_messages` as
   **unavailable** for this skill, not just "not yet granted." Backfill-mode
   "finding mentions outside bound channels" (the original use for this
   tool) has no replacement today beyond widening which channels the bot is
   a member of.
3. **No "list/search" action exists for Zendesk tickets or Fireflies
   transcripts — only get-by-id.** Resolving "List Zendesk tickets updated
   since a time" and "List recent Fireflies meeting transcripts" against
   the live server returns nothing more specific than `get_ticket_by_id` /
   `get_transcript`, both of which require an id you'd already need to have
   from somewhere else. Tickets and meeting transcripts can only be synced
   today if some other signal (e.g. a Slack message linking a ticket URL or
   a transcript link) supplies the id first — there is no standalone
   "what's new since X" entry point into either app via this MCP server as
   configured.
4. **Zero Refold platform workflows exist** (`GET /api/v2/public/workflow`
   → `totalDocs: 0`; the MCP server's own `chains`/`associated_apps[].workflows`
   are all empty too). The planned `metric` record type's deterministic
   source (execution stats / connector inventory / MCP usage) **does not
   exist yet** — see §Deterministic path below. This blocks `metric` records
   entirely, not just makes them harder.

None of these are MCP-protocol or skill-design problems — they are
connection/app-admin setup gaps in the `cs-hub` linked account and are
outside this repo. Flagged here so 7.5's rollout plan accounts for them
before relying on this skill for real syncs.

## Action reference (real action IDs, resolved live via `RESOLVE_ACTIONS`)

| Capability | `application_slug` | `action_id` | Required input | Optional input |
|---|---|---|---|---|
| Slack — channel history since a time | `slack` | `get_conversation_history` | `channel` (channel id) | `oldest` (Slack ts, e.g. `1234567890.123456`) |
| Slack — thread replies | `slack` | `list_thread_messages` | `channel`, `ts` (root message timestamp) | — |
| Slack — search messages | `slack` | `search_messages` | `query` | `team_id` — **unavailable, see blocker 2 above** |
| Slack — list channels (to resolve an alias to a channel id) | `slack` | `list_channels` | — | `limit` |
| Email — list/search messages | `gmail` | `list_messages` | `userId` (use `me`) | `q` (Gmail search syntax: `from:`, `after:`, etc.), `maxResults` (≤500), `labelIds`, `pageToken` |
| Email — get a message | `gmail` | `get_message` | `userId`, `id` | `format` (`full`/`minimal`/`metadata`/`raw`) |
| Ticketing — get a ticket | `zendesk` | `get_ticket_by_id` | `ticket_id` | — (no list/search action exists — see blocker 3) |
| Refold platform — execution stats / connector inventory / MCP usage | — | — | — | **No action or workflow resolves to these today — none exist on this server or org (see blocker 4).** |
| CS Hub ingest (hand-run mode posting only) | — (plain HTTPS, not via this MCP server) | — | `POST {CS_HUB_BASE_URL}/functions/v1/ingest`, bearer `cshub_…` token | Never used in runner mode — the runner posts. |

`RESOLVE_ACTIONS` takes a flat list of plain-English query strings
(`integration_query`) and returns `{slug, type, identifier, json_schema}`
per resolved query — call it once per sync run with every capability you
need that run, not once per capability. Every MCP tool call to this server
(not just the REST execute endpoint) requires a `linked_account_id` header
set to the CS Hub's linked account id — `initialize` and `tools/list` work
without it, but `tools/call` does not (`"Missing auth context"` otherwise).

## Ticketing system

**Zendesk.** Use `"Zendesk"` (capitalized, exactly) as `ticket.data.system`
for every ticket record — this is the only ticketing system attached to the
CS Hub MCP server.

## Allowed values (CS Hub schema enums)

See `record-types.md` for the full per-field mapping; the enum values
themselves (confirmed directly from the CS Hub's own Postgres schema, not
Refold's):

- `milestone_status`: `not_started`, `in_progress`, `done`, `at_risk`
- `risk_status`: `open`, `mitigating`, `resolved`, `accepted`
- `escalation_status`: `open`, `in_progress`, `resolved`, `closed`
- `severity` (shared by risk and escalation): `low`, `medium`, `high`, `critical`
- `ticket_status`: `open`, `pending`, `resolved`, `closed`
- `ticket_priority`: `p1`, `p2`, `p3`, `p4`
- `health`: `active`, `caution`, `risk`

## `metric_definitions` keys available on the CS Hub

`active_connectors`, `agent_mcp_usage`, `avg_build_time`,
`deal_acceleration`, `docs_feedback_score`, `engineering_hours_saved`,
`execution_volume`, `integration_catalog_pct`, `maintenance_cost_offset`,
`mttr`, `p1_p2_sla`, `security_review_status`, `self_healing_rate`,
`si_outsourcing_savings`, `workflow_success_rate`. None of these currently
have a working deterministic source on the Refold side (blocker 4) — this
list is what the CS Hub is *ready to accept*, not what's *available to send*
yet.

## Deterministic path (no LLM) — confirmed this session

- **Any single resolved action** (ticket-by-id, a Gmail message-by-id, a
  Slack channel's history once the bot is in it, etc.) can be run
  deterministically via `POST /api/v2/integration-schema/{slug}/actions/{action_id}/execute`
  with just the org API key + `linked_account_id` header — no model call,
  no MCP round-trip. This is the same execution path `EXECUTE_ACTION` uses
  internally.
- **Metrics cannot be fetched deterministically (or at all) today** — there
  is no Refold workflow or action anywhere in this org that produces
  execution stats, connector inventory, or MCP usage numbers
  (`GET /api/v2/public/workflow` returns zero results). Someone needs to
  build and publish at least one Refold workflow before the `metric` record
  type has any source. This is a hard blocker for `metric` specifically,
  not a "slower path" — there is currently no path at all.
- Tickets have a deterministic *get* (zendesk `get_ticket_by_id`) once an id
  is known and the app is connected, but no deterministic *discovery* of
  "which tickets changed since X" (blocker 3) — that gap applies equally to
  the deterministic and the agent/LLM path, since both ultimately call the
  same action catalog.

## Health dedupe — confirmed this session (local ingest)

Tested directly against the local CS Hub stack with Prism Analytics
(fixture `health: active`): sending `health:<account id>` with the same
value (`active`) → `duplicate_skipped`; a different value (`caution`) →
`proposed_update`; resending that same new value again while the first
proposal is still pending → `updated_pending`. Matches
`record-types.md`'s `health` section and `docs/ingest-api.md` exactly —
no change needed to either.
