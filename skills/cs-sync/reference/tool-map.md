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

**`httprequest` is read-only for this skill, with no exceptions (7.5-pre2
Session 4).** Fireflies: only `POST /graphql` bodies containing a GraphQL
`query`, never a `mutation`. Zendesk: only `GET` (search,
`tickets/{id}`, incremental export), never `POST`/`PUT`/`DELETE`. Stated
as a hard rule in `SKILL.md` itself — and a **requirement for 7.5's
runner** (not built yet): the runner must enforce this server-side when
it executes a tool call on the skill's behalf (reject any non-conforming
`httprequest` call), which is the reason the runner should proxy
`tools/call` itself rather than handing the model Anthropic's built-in MCP
connector directly — that connector would call `EXECUTE_ACTION` with no
server-side chance to inspect or reject the call first.

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
   identity (bot) is not a member of any channel in the workspace —
   `list_channels`/`list_users` work (they don't need channel membership)
   but reading any channel's history does not, customer channels included.
2. **Slack: `search_messages` returns `not_allowed_token_type` — structural,
   not a permissions fix.** Slack's `search.messages` API requires a
   user-scope token; the CS Hub's Slack connection is bot-token-based and
   can never call it as currently configured.
3. **Both fixed the same way: re-authorize Slack as a user, not a bot** —
   confirmed this session (2026-10-11) that Refold's Slack connector
   genuinely supports this (`GET /api/v2/public/auth-structure/slack`'s
   `workspace_token` field; a real `user_scope`-populated authorize URL
   from `GET /api/v2/public/linked-account/integration/oauth-url/slack`).
   A user token isn't restricted to bot-invited channels, and
   `search.messages` accepts it. **Not yet done** — see
   `docs/refold-mcp.md`'s Slack connector addendum for the exact redirect
   URI and the one real gap even after re-auth (Refold's *default* app's
   scopes don't include `search:read`; a custom Auth Profile with that
   scope added is needed for `search_messages` specifically).
4. **No native "list/search" action exists for Zendesk tickets or
   Fireflies transcripts — only get-by-id in the official action catalog.**
   `get_ticket_by_id`/`get_transcript` both require an id you'd already
   need to have. **Resolved this session via the generic `httprequest`
   action** (§Deterministic path below) — confirmed working for Fireflies'
   own GraphQL API; expected, not yet verified, for Zendesk once connected.
5. **Zero Refold platform workflows exist** (`GET /api/v2/public/workflow`
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
| Slack — channel history since a time | `slack` | `get_conversation_history` | `channel` (channel id) | `oldest` (Slack ts, e.g. `1234567890.123456`) — **blocked until Slack is re-authorized as a user, see blockers 1–3** |
| Slack — thread replies | `slack` | `list_thread_messages` | `channel`, `ts` (root message timestamp) | — same blocker |
| Slack — search messages | `slack` | `search_messages` | `query` | `team_id` — **blocked, see blockers 2–3 (needs a user token *and* a `search:read` scope)** |
| Slack — list channels (to resolve an alias to a channel id) | `slack` | `list_channels` | — | `limit` — works today (no channel membership needed) |
| Email — list/search messages | `gmail` | `list_messages` | `userId` (use `me`) | `q` (Gmail search syntax: `from:`, `after:`, etc.), `maxResults` (≤500), `labelIds`, `pageToken` |
| Email — get a message | `gmail` | `get_message` | `userId`, `id` | `format` (`full`/`minimal`/`metadata`/`raw`) |
| Fireflies — get a transcript | `fireflies` | `get_transcript` | `transcript_id` | — (no native list/search — see blocker 4; use `httprequest` below to discover ids by date) |
| Fireflies / Zendesk — list/search via the generic escape hatch | `fireflies` / `zendesk` | `httprequest` | `method`, `base_url`, `url_path` | `body`, `query_string`, `headers` — **read-only only**: Fireflies `POST /graphql` with a `query` (never `mutation`); Zendesk `GET` only. See the read-only rule at the top of this file. |
| Ticketing — get a ticket | `zendesk` | `get_ticket_by_id` | `ticket_id` | — (no list/search action exists — see blocker 4; use `httprequest` once Zendesk is connected) |
| Refold platform — execution stats / connector inventory / MCP usage | — | — | — | **No action or workflow resolves to these today — none exist on this server or org (see blocker 5).** |
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
- `action_item_priority` (7.5-pre2 Session 4): `p0`, `high`, `medium`, `low`
- `action_item_status` (sync-relevant subset; standups also uses `open`/`done`
  internally, unrelated): `open`, `in_progress`, `blocked`, `done`

## `metric_definitions` keys available on the CS Hub

`active_connectors`, `agent_mcp_usage`, `avg_build_time`,
`deal_acceleration`, `docs_feedback_score`, `engineering_hours_saved`,
`execution_volume`, `integration_catalog_pct`, `maintenance_cost_offset`,
`mttr`, `p1_p2_sla`, `security_review_status`, `self_healing_rate`,
`si_outsourcing_savings`, `workflow_success_rate`. None of these currently
have a working deterministic source on the Refold side (blocker 5) — this
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
  "which tickets changed since X" (blocker 4) — that gap applies equally to
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
