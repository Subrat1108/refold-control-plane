# Slack custom actions (user token) — spec to hand to Refold

**Why this exists.** Refold's stock Slack connector authenticates as a
**bot**. A bot token can list channels but cannot read them: every
`conversations.history` call returns `not_in_channel`, and `search.messages`
returns `not_allowed_token_type` because Slack only accepts a **user** token
for search. Re-verified against real channel ids on 2026-10-12 — this is a
token-type limitation, not a permissions or membership problem.

Result (before this): the sync could see Slack channel *names* and nothing
inside them, which is most of the value. These custom actions fixed that by
calling the same Slack Web API endpoints with a **user token**. They are
now live — see Status below.

Everything below is **read-only**. No action writes to Slack, and the CS
Hub's runner rejects any non-read call before it reaches Refold.

---

## The prompt to use

> Create custom actions on the Slack connector for our MCP server, using a
> **user token** (`xoxp-…`) rather than the bot token, and expose them as
> MCP tools. All of them are read-only calls to the Slack Web API.
>
> For each action: `GET` or `POST` to the Slack Web API endpoint named
> below, passing the user token as `Authorization: Bearer <user token>`,
> returning Slack's JSON response unmodified.
>
> | Action id (use exactly) | Slack endpoint | Inputs | Purpose |
> |---|---|---|---|
> | `user_conversation_history` | `conversations.history` | `channel` (id, required), `oldest` (ts), `latest` (ts), `limit` (default 100), `cursor` | Read messages in a channel since a timestamp |
> | `user_conversation_replies` | `conversations.replies` | `channel` (required), `ts` (required), `limit`, `cursor` | Read a thread's replies |
> | `user_search_messages` | `search.messages` | `query` (required), `count`, `page`, `sort` | Keyword search across everything the user can see |
> | `user_list_channels` | `conversations.list` | `types` (default `public_channel,private_channel`), `exclude_archived` (default true), `limit` (default 200), `cursor` | List channels **including private ones the user is in** |
> | `user_conversation_members` | `conversations.members` | `channel` (required), `limit`, `cursor` | Who is in a channel — used to detect external participants |
> | `user_users_info` | `users.info` | `user` (required) | Resolve a Slack user id to a name and email domain |
> | `user_users_list` | `users.list` | `limit`, `cursor` | Bulk resolve users to names/email domains |
>
> **User-token OAuth scopes required** (request all of these on the
> user-token side, not the bot side):
> `channels:history`, `groups:history`, `im:history`, `mpim:history`,
> `channels:read`, `groups:read`, `im:read`, `mpim:read`,
> `search:read`, `users:read`, `users:read.email`
>
> Notes:
> - `search:read` is the one Refold's default Slack app does **not**
>   request, which is why `search.messages` fails today. It must be in the
>   user-token scope list.
> - The `*:history` scopes are what make reading channels work at all —
>   a user token with these can read any conversation the person can read,
>   without needing to be separately invited the way a bot does.
> - `im:history`/`mpim:history` cover DMs and group DMs, which is where a
>   lot of customer conversation actually happens.
> - All responses should be returned as-is; pagination cursors must be
>   passed through so the caller can page.
> - Do not create any action that posts, edits, deletes, joins, or
>   otherwise writes. Read-only only.

---

## Status: done and verified (2026-10-12)

All seven actions exist, are exposed, and were tested live against the real
workspace. Channel reading, private-channel listing and `search.messages` —
all impossible on the bot token — now work.

The identifiers are opaque hashes (the `_custom` suffix is on the display
name, not the id):
`6accecbf9b5b1cb653df996d` history · `6accecbf9b5b1cb653df991b` replies ·
`6accecbf8698d709960292cd` search · `6accecbf9b5b1cb653df996b` list ·
`6accecbf8698d709960292f8` members · `6accecbf8698d709960292cf` users.info ·
`6accecbf9b5b1cb653df991d` users.list

**One quirk worth knowing:** an omitted optional parameter is passed to
Slack as an empty value, which Slack rejects with `invalid_arguments`.
`conversations.members` fails without `limit` and succeeds with it; same
for `conversations.replies` and `search.messages`. Always send every
parameter. The runner's action catalog now instructs exactly that.

## Wiring in this repo (done 2026-10-12)

The runner enforces a hardcoded allowlist, so new action ids do nothing
until they are added. All three edits are made:

1. `supabase/functions/cs-sync-runner/allowlist.ts` — the seven hashed ids
   added to the Slack allowlist.
2. `supabase/functions/cs-sync-runner/context.ts` — `ACTION_CATALOG`'s
   Slack block rewritten to the user-token actions, with every optional
   parameter spelled out (see the quirk above).
3. `supabase/functions/cs-sync-runner/refold.ts` — `READ_BLOCKED_CONNECTORS`
   emptied, so runs no longer skip Slack. The mechanism is kept for the
   next connector that is "connected" but not actually usable.
