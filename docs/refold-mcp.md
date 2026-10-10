# Refold MCP — how the Hub connects (7.5-pre discovery, 2026-10-10)

How the CS Hub talks to Refold's MCP server to run the `cs-sync` skill
(7.5). No secrets or customer content below — this documents shapes and
mechanics only. See `skills/cs-sync/` for the skill itself and
`docs/ingest-api.md` for the endpoint it posts to.

## Credentials

Three values, held as repo-root `.env` entries (gitignored) today, and as
Supabase secrets once 7.5's runner ships: `REFOLD_API_KEY` (an org API key —
the test-environment key used for this discovery is prefixed `tk…`; a
production key is prefixed `pk…` and must not be used until go-live),
`REFOLD_LINKED_ACCOUNT_ID` (identifies which Refold-managed account to act
as — the CS Hub's own service account), `REFOLD_MCP_SERVER_ID` (the
specific MCP server to connect to; this org has one, named "CS Hub").

## Auth flow

1. `POST https://app.refold.ai/api/v2/public/session-token` with header
   `x-api-key: <org API key>` and body `{"linked_account_id": "..."}`.
   Returns `{ token, refresh_token, expires_in, refresh_expires_in }`.
   `expires_in` is ~7 days (604800s); `refresh_expires_in` is ~30 days.
2. Calling the same endpoint again returns the **same still-valid token**
   (no new one minted) unless you pass `?force_refresh=true`, which rotates
   it — the previous token keeps working until it expires or is revoked.
   There is no separate token-exchange endpoint; re-calling session-token
   (with `force_refresh` when you actually want rotation) is the refresh
   mechanism.
3. Use the returned `token` as `Authorization: Bearer <token>` for every
   MCP call and for the REST "execute action" endpoint below.

## MCP server endpoint

```
https://app.refold.ai/mcp/v1/<REFOLD_MCP_SERVER_ID>
Authorization: Bearer <session token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

Streamable HTTP, JSON-RPC 2.0 (`initialize` → `tools/list` → `tools/call`).
Responses come back as a single `text/event-stream` chunk (`data: {...}`),
not plain JSON — parse past the `data: ` prefix. No session-id header or
cookie is required between calls; each request carries full auth itself.

**`tools/call` (but not `initialize`/`tools/list`) additionally requires an
`linked_account_id: <REFOLD_LINKED_ACCOUNT_ID>` header** — omitting it on a
tool call returns `"Missing auth context — request was not authenticated"`
even though `tools/list` worked fine without it. This cost real debugging
time this session; don't skip it.

## This org's server: "CS Hub"

- `mode`: **agent** — exposes exactly two tools, not one per action:
  - `RESOLVE_ACTIONS({ integration_query: string[] })` → for each query, a
    best-guess `{ slug, type: "action"|"workflow", identifier, json_schema }`
    (or nothing, if no action matches).
  - `EXECUTE_ACTION({ application_slug, action_id, input_payload, type })`
    → runs it.
  - (A `direct`-mode server would instead list one MCP tool per exposed
    action directly in `tools/list` — not the case here.)
- `expose_skills` (the dashboard's **Retrieve Skill** switch): **off**. This
  server does not expose `GET_KNOWLEDGE_INDEX`/`LOAD_SKILL` tools — call
  `RESOLVE_ACTIONS` directly with your own query list rather than waiting
  for a skill-discovery step. (There is no public API for skill CRUD either
  — skills are managed only via Refold → MCP → *server* → Skills in the
  dashboard, confirmed by reading the full OpenAPI spec; `skills_count` is
  reported but not writable through the API.)
- `interactive_auth`: **off** — connecting an app is an admin-side flow in
  the Refold dashboard, not something an end user does mid-conversation
  with this server.
- `environment`: **test** (matches the `tk…` key used this session).
- Attached apps (from `associated_apps`, each with its own action catalog):
  **Slack, Fireflies, Zendesk, Gmail**. No workflows attached to any of
  them, and the org has zero Refold workflows published at all
  (`GET /api/v2/public/workflow` → `totalDocs: 0`).

## Connection status (Applications API)

`GET /api/v2/public/application` with `x-api-key` + `linked_account_id`
headers lists every app Refold supports, each with `connected: boolean` and
`connected_accounts[]` for this linked account. For the CS Hub's four
attached apps: **Slack** and **Fireflies** are connected; **Zendesk** and
**Gmail** are not (`connected: false`) — any action against either returns
`"Application Authentication not found for linked_account_id ... and app
..."`. Completing those two connections in the Refold dashboard is a
prerequisite for 7.5's ticket and email sourcing, independent of any code
here.

## Tools and action IDs

See `skills/cs-sync/reference/tool-map.md` for the full, current action
reference (real `action_id`s, required/optional input fields, and every
gap found while testing them live — not reproduced here to avoid two
copies drifting apart).

## Limits

- `RESOLVE_ACTIONS`: pass every capability a run needs as one
  `integration_query` list in a single call — no documented per-call cap
  observed, but there's no reason to call it once per capability either.
- `EXECUTE_ACTION` / the REST execute endpoint: **the outer HTTP status is
  always 200 even when the underlying app call fails** — the spec states
  this explicitly, and it was confirmed live (Slack `not_in_channel` and
  `not_allowed_token_type` both came back as HTTP 200 with
  `node_status: "Errored"` in the body). Always check `node_status` /
  `http_status` in the response body, never just the transport status.
- Session token: ~7-day expiry, ~30-day refresh window (see Auth flow).
- Gmail `list_messages.maxResults`: capped at 500 server-side (Gmail's own
  limit, documented in the action's `json_schema`).

## Deterministic option (no LLM)

`POST /api/v2/integration-schema/{slug}/actions/{action_id}/execute` with
`x-api-key` + `linked_account_id` headers and a JSON body of the action's
own parameters runs one action directly — the same underlying mechanism
`EXECUTE_ACTION` uses, without any MCP/JSON-RPC/model round-trip. Useful for
7.5's deterministic steps (ticket-by-id lookups, metric pulls once a
workflow exists) once an `action_id` and its parameters are already known;
it does not help with *discovering* what to fetch (there's no deterministic
"list tickets since X" today — see the tool-map's Connected apps section).
Confirmed this session: metrics have no deterministic source yet because no
Refold workflow exists in this org, not because of anything about this
endpoint.

## Not yet implemented / parked

See `docs/decisions.md`'s Parked list: rotating the Refold API key (per the
session owner, it was exposed in an earlier planning conversation — not
during this discovery session, which only ever read its length/prefix),
and standing up a production-environment (`pk…`) key + server + account
before go-live.
