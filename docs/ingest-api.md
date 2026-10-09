# Ingest API (7.4)

The one door automated callers — the CS Sync Skill (7.5), and later the chat
agent (7.6) and file import (7.8) — use to report facts into the Hub. Every
record becomes a **proposal**; nothing is applied by this endpoint. 7.3's
Approvals inbox and `apply_proposal()`/`reject_proposal()` are the only path
from proposal to real row, unchanged by this API.

This document is the reference 7.5's CS Sync Skill is written against. All
examples below use fictional accounts (`prism-analytics`, `meridian-labs`)
and fictional data, per this repo's confidentiality rule (build-spec-v3 §0).

## Endpoint and auth

```
POST /functions/v1/ingest
Authorization: Bearer cshub_<token>
Content-Type: application/json
```

The bearer token is **not** a Supabase session JWT — it's a long-lived
credential minted from the Ingest Tokens admin screen (`/ingest-tokens`,
super-admin only). Supabase's platform-level JWT check is disabled for this
one function (`verify_jwt = false` in `supabase/config.toml`); the
function's own token lookup against `ingest_tokens.token_hash` is the only
gate. A missing or invalid token gets a `401` from the function itself.

Tokens:
- Prefixed `cshub_` so a leaked one is recognizable.
- Shown in full exactly once, at creation — only its SHA-256 hash is ever
  stored. There is no way to retrieve a lost token; revoke it and mint a new
  one.
- `expires_at` is required at creation and capped at 365 days out.
- Optionally scoped to a specific set of accounts (`allowed_org_ids`); a
  record for an account outside a token's scope is rejected
  (`rejected_invalid`, reason `"account outside this token's scope"`).
- Revoking a token (from the admin screen) takes effect immediately — the
  next request with that token gets `401`.

This endpoint is server-to-server only: it sets no CORS headers and handles
no `OPTIONS` preflight, so a browser page cannot read its response
cross-origin even if it somehow obtained a token.

## Request shape

```json
{
  "run": {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "mode": "scoped",
    "source": "agent",
    "triggered_by": "system",
    "scope": { "account": "prism-analytics", "record_type": "tickets" }
  },
  "records": [
    {
      "record_type": "ticket",
      "operation": "create",
      "account": "prism-analytics",
      "source_ref": "zendesk:SUP-4821",
      "observed_at": "2026-10-09T14:00:00Z",
      "data": {
        "external_key": "SUP-4821",
        "title": "Webhook retries exhausted on order sync",
        "system": "Zendesk",
        "priority": "high",
        "status": "open",
        "url": "https://example-helpdesk.test/tickets/4821"
      },
      "evidence": { "url": "https://example-helpdesk.test/tickets/4821", "excerpt": "Customer reports webhook retries exhausted." },
      "confidence": 0.95
    }
  ]
}
```

### `run`

| Field | Required | Notes |
|---|---|---|
| `id` | no | A UUID the caller controls, for idempotent re-posts to the same run (e.g. a retried daily job). Reusing an `id` that belongs to a **different** token is rejected with `409`. Omit to let the server generate one. |
| `mode` | yes | `scoped` \| `backfill` \| `daily`. |
| `source` | no | `agent` \| `chat` \| `file`, default `agent`. Stamped onto every proposal created in this run as `proposals.source`; reused as-is by the future chat agent (7.6) and file import (7.8) without any change to this endpoint. |
| `triggered_by` | no | A *claim*, not trusted as-is — see below. |
| `scope` | no | Free-form, stored on `sync_runs.scope` for the caller's own bookkeeping; not validated or acted on by this endpoint. |

`triggered_by` is accepted only if it is the literal `"system"`, or an id
that matches an existing profile with `account_type = 'super_admin'`.
Anything else is silently stored as `null` — and the response's
`run.triggeredByAccepted` is `false` so the caller can tell attribution was
dropped rather than assuming it stuck.

### `records[]`

| Field | Required | Notes |
|---|---|---|
| `record_type` | yes | One of `milestone`, `accomplishment`, `risk`, `escalation`, `ticket`, `metric`, `health`. |
| `operation` | yes | `create` \| `update` \| `delete`. The server decides the actual create-vs-update outcome itself (see Upsert semantics) — this is advisory for everything except `delete`, which is handled specially. |
| `account` | yes | An account id (UUID) or an entry in that organization's `aliases` (e.g. a Zendesk/Slack-visible slug). Unresolvable → `rejected_invalid`. |
| `project` | depends | An id or exact project name within the account. Required for `milestone`/`accomplishment`; optional for `risk`/`escalation`/`metric`; not used for `ticket`/`health`. |
| `source_ref` | strongly recommended | An opaque, caller-chosen key identifying this fact in its source system (e.g. `zendesk:SUP-4821`, `slack:C123/1727.0012`). Drives all dedupe/upsert behavior — omit it and every post creates a new `create` proposal with no merge. |
| `observed_at` | no | Informational timestamp; not currently validated or stored separately from `data`. |
| `data` | yes | Record-type-specific fields — see table below. Unknown keys are stripped, not fatal (see Limits). |
| `evidence` | no | `{ "url": "...", "excerpt": "..." }`. Excerpt is truncated to 280 chars server-side. |
| `confidence` | no | A number, stored as-is on the proposal for the approver's benefit. |

### Record types and fields

| `record_type` | target table | required `data` fields | optional `data` fields |
|---|---|---|---|
| `milestone` | `milestones` | `period`, `description` | `status` |
| `accomplishment` | `accomplishments` | `period`, `text` | — |
| `risk` | `risks` | `risk`, `impact` | `mitigation`, `severity`, `status`, `owner` |
| `escalation` | `escalations` | `title` | `severity`, `status`, `raised_by` |
| `ticket` | `tickets` | `external_key`, `title`, `system` | `priority`, `status`, `url` |
| `metric` | `metric_values` | `metric_key`, `period`, `value` | `baseline_value` |
| `health` | `organizations` (the account row itself) | `health` | `health_reason` |

This is exactly the allow-list `apply_proposal()` (7.3) already recognizes
for each target table — anything this endpoint proposes is guaranteed
approvable with no changes needed on that side.

Extra validation: `metric.metric_key` must exist in `metric_definitions`;
`metric.period` must parse as a date. `health.health` must be one of
`active`/`caution`/`risk`. `delete` is not valid for `health` (there's
always exactly one health row per account — nothing to delete).

## Upsert / dedupe semantics

The sync skill is meant to stay dumb — it reports what it currently sees in
the source system; the server decides what that means for platform state.
For every record with a `source_ref`, in order:

1. **A pending proposal already exists** for `(account, target table,
   source_ref)` → the incoming `data`/`evidence`/`confidence` is merged into
   it in place → **`updated_pending`**.
2. **Else the most recently decided `rejected` proposal** for that same key
   has a payload **identical** (after normalization, see below) to what's
   being sent now → **`previously_rejected`** — skip it, so a human's "no"
   doesn't get re-proposed every sync run. If the payload has **changed**
   since that rejection, it's treated as a fresh attempt (falls through to
   step 3) — a rejected item isn't stuck forever if the underlying facts
   changed.
3. **Else a real row already exists** for `(account, source_ref)`:
   - Current values identical to the incoming `data` → **`duplicate_skipped`**.
   - They differ → a new `update` proposal targeting that row →
     **`proposed_update`** (this is the path a ticket's status change takes
     on every subsequent daily sync).
4. **Else** → a new `create` proposal → **`proposed`**.

Equality is **normalized**, not literal: dates/timestamps are compared in
one canonical form, numbers via numeric coercion, strings trimmed, and
`health`/`status`/`severity`/`priority` lowercased — and only the fields the
*caller actually sent* are compared (an omitted field is never treated as
"changed"). Without this, a daily sync would file a false `proposed_update`
on every ticket just because a date arrived in a differently (but
equivalently) formatted way.

Two overlapping runs posting the same `(account, table, source_ref)` for the
first time (a manual Refresh racing the daily job) cannot both create a new
pending proposal — a database-level partial unique index
(`proposals_pending_dedupe`) is the authoritative backstop; a race loses the
insert and transparently merges into whichever proposal won, so the caller
never sees a failure from it.

### `delete`

Requires `source_ref`. If a real row exists, files a `delete` proposal
(→ `proposed`, to be approved like any other). If **no real row exists**
but a **pending `create`** for that `source_ref` does (it was never
approved), the delete cancels that pending proposal — marks it `superseded`
— and reports **`superseded_pending`**; no new proposal is filed, since
there was never a real row to delete. If neither exists, `rejected_invalid`
("nothing to delete").

## Response

```json
{
  "run": { "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "status": "success", "triggeredByAccepted": true },
  "results": [
    { "source_ref": "zendesk:SUP-4821", "status": "proposed", "proposalId": "..." }
  ]
}
```

`run.status` is `success` unless at least one record came back
`rejected_invalid`, in which case it's `partial` — the run still processed
every valid record; nothing is rolled back because of one bad one.

### Result statuses

| Status | Meaning |
|---|---|
| `proposed` | A new `create` (or `delete`) proposal was filed. |
| `proposed_update` | A new `update` proposal was filed against an existing real row whose values differ from what was sent. |
| `updated_pending` | Merged into an already-pending proposal for this key (no new row created). |
| `duplicate_skipped` | The real row's current values already match what was sent — nothing to do. |
| `previously_rejected` | A human already rejected this exact payload for this key — skipped, not re-proposed. |
| `superseded_pending` | An explicit `delete` cancelled a still-pending `create` for this key (marked `superseded`); there was never a real row. |
| `rejected_invalid` | The record failed validation (unknown account/project, missing required field, unknown `record_type`, nothing to delete, etc.) — `reason` explains why. |

A record's `strippedFields` (when present) lists any `data` keys that
weren't recognized for that `record_type` and were dropped rather than
failing the record.

## Limits

| Limit | Behavior |
|---|---|
| 200 records per request | Over this → `413`, nothing processed. |
| 2 MB request body | Enforced while the body is being read (not by trusting `Content-Length`, which can be absent under chunked transfer) → `413` if exceeded. |
| `evidence.excerpt` | Truncated to 280 characters server-side, never rejected for length. |
| Unrecognized `data` fields | Stripped, listed per-record in `strippedFields` — not fatal. |
| Reusing `run.id` under a different token | `409`. |
| Token TTL | Capped at 365 days from creation; a longer `expiresAt` is rejected when the token is minted, not clamped. |

## Logging privacy

Function logs (visible via `supabase functions logs` / local `functions
serve` output) **never** contain a request body, a record's `data`, or an
`evidence.excerpt` — only `run.id`, the `ingest_token_id`, per-record
`source_ref` (an opaque pointer, not customer content), outcome counts, and
error codes. This is a guarantee, not just current behavior: the function
has no code path that logs anything else.

## Not yet implemented

Per-token rate limiting is parked — not needed until 7.5 actually runs this
on a schedule (see `docs/decisions.md`).
