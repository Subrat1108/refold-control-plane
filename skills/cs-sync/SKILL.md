---
name: cs-sync
description: Sync customer-success facts for Refold accounts — tickets, escalations, risks, milestones, accomplishments, metrics and account health — from Slack, email, ticketing and Refold platform tools (via the Refold MCP server) into the Refold CS Hub as proposals for human approval. Use for a full backfill, the daily incremental sync, or a scoped refresh of one account and one record type. Also use when someone asks to "sync", "refresh" or "pull updates" for a customer account into the CS Hub.
---

# CS Sync

You turn what is happening with Refold's customers — in Slack, email, the
ticketing tool and the Refold platform — into structured **records** for the
Refold CS Hub. Every record you produce becomes a **proposal**; a person on the
CS team approves or rejects it. You never change the Hub directly.

## Golden rules

1. **Report facts, never invent them.** Every record must be supported by a
   concrete source item (message, email, ticket, metric result). If a field
   isn't stated or clearly derivable, leave it out.
2. **Every record needs `evidence` and a stable `source_ref`.** Evidence is a
   link plus a verbatim excerpt (≤ 280 characters). `source_ref` rules are in
   §Source refs; they make re-runs safe.
3. **Report current state; let the server dedupe.** Don't try to work out
   whether the Hub already has something. Send what you see with the right
   `source_ref` — the ingest API decides create vs. update vs. skip. The only
   exception: when the sync context lists `known_records`, reuse an existing
   record's `source_ref` when you're reporting a change to that same thing
   (e.g. a milestone date slipped).
4. **When unsure, skip.** Prefer ten accurate records over fifty noisy ones.
   Don't emit anything with confidence below 0.5. Put it in `skipped` with a
   short reason instead.
5. **One account per record.** If an item can't be tied to exactly one account
   (by alias, channel, domain or explicit mention), skip it.
6. **Confidentiality.** Never include credentials, tokens, API keys, passwords
   or secrets in any field or excerpt — even if they appear in the source. Keep
   personal data to names and roles already visible in the source. Never echo
   the ingest token.

## Inputs: the sync context

When run by the CS Hub runner (Refresh button or daily job), you receive a
**sync context** (JSON) with the request. When run by hand (in Claude or a
Refold agent), ask the user for the missing pieces, or build the context from
what they tell you.

```json
{
  "mode": "scoped | daily | backfill",
  "run_id": "uuid",
  "triggered_by": "system | <super-admin profile id>",
  "units": [
    {
      "account": {
        "id": "uuid",
        "name": "Prism Analytics",
        "aliases": ["prism-analytics", "prismanalytics.io", "#ext-prism"],
        "current_health": "active",
        "projects": [{ "id": "uuid", "name": "Prism — Data Platform" }]
      },
      "record_types": ["tickets"],
      "since": "2026-10-08T00:00:00Z"
    }
  ],
  "known_records": {
    "<account id>": {
      "milestones": [{ "source_ref": "...", "description": "...", "period": "2026-10-01", "status": "planned" }],
      "risks": [], "escalations": [], "tickets": []
    }
  },
  "metric_definitions": [{ "key": "execution_volume", "label": "Execution volume", "unit": "count" }],
  "allowed_values": { "milestone_status": [], "risk_status": [], "escalation_status": [], "severity": [], "ticket_status": [], "ticket_priority": [] }
}
```

Aliases carry the bindings: Slack channel names, customer email domains,
ticketing organization/project keys, and slugs. Use them to find each
account's sources and to tie items back to the account.

## Modes

| Mode | Scope | Window |
|---|---|---|
| `scoped` | One account × one record type (a Refresh button). | From the unit's `since` to now. |
| `daily` | Every unit in the context. | Each unit's own `since`. |
| `backfill` | All record types for the listed accounts. | `since` if given, else the last 90 days. Work one account at a time. |

Only produce record types listed in each unit's `record_types`.

## Workflow

1. **Read the sync context.** Note each unit's account, aliases, projects,
   record types and `since`.
2. **Gather** source items for each unit, using the tools in
   `reference/tool-map.md`. Deterministic sources come first: tickets from the
   ticketing tool, metrics from Refold platform workflows. Then conversational
   sources: Slack channels, then email.
3. **Extract** candidate facts per record type, following
   `reference/record-types.md` — what counts, field mapping, confidence.
4. **Attach** each fact to exactly one account, and to a project where the type
   needs one (matched against the account's `projects` by name; skip if none
   fits).
5. **Build records** in the ingest format below, with `source_ref`, `evidence`
   and `confidence`.
6. **Self-check** every record against the checklist below; drop or fix
   failures.
7. **Deliver:**
   - **Runner mode** (a sync context was given): reply with ONLY the output
     JSON (§Output). No prose before or after. The runner posts it.
   - **Hand-run mode**: post to the ingest API yourself (§Posting), then give
     the user a short summary.

## Output (runner mode)

Reply with exactly one JSON object; `reference/payload.schema.json` is the
full schema.

```json
{
  "run": { "id": "<run_id from context>", "mode": "scoped", "source": "agent", "triggered_by": "system" },
  "records": [
    {
      "record_type": "escalation",
      "operation": "create",
      "account": "prism-analytics",
      "source_ref": "slack:C04PRISM/1728480000.001200",
      "observed_at": "2026-10-09T13:20:00Z",
      "data": { "title": "Order sync failures blocking month-end close", "severity": "high", "status": "open", "raised_by": "Customer VP Finance" },
      "evidence": { "url": "https://example.slack.test/archives/C04PRISM/p1728480000001200", "excerpt": "This is now blocking our month-end close — we need someone on this today." },
      "confidence": 0.85
    }
  ],
  "skipped": [
    { "pointer": "slack:C04PRISM/1728470000.000300", "reason": "Mentions two accounts; can't attribute to one." }
  ]
}
```

- `operation` is `create` unless you're reporting a change to a known record
  (`update`), or the source shows the thing was removed (`delete`).
- `skipped` is for the runner's logs only — it isn't sent to the API.
- Max **200 records** per payload. With more, split into several payloads that
  share the same `run.id`.

## Posting (hand-run mode)

Only if an HTTP tool for the CS Hub ingest API is available (see the tool map)
and the user has given you a token to use.

```
POST {CS_HUB_BASE_URL}/functions/v1/ingest
Authorization: Bearer cshub_…
Content-Type: application/json
Body: { "run": {...}, "records": [...] }   (no "skipped")
```

- Batches of ≤ 200 records; reuse one `run.id` across batches of a run.
- Read `results[]`. Outcomes `proposed`, `proposed_update`, `updated_pending`,
  `duplicate_skipped`, `previously_rejected` and `superseded_pending` are all
  fine.
- For `rejected_invalid`: fix it once if the `reason` points at something
  fixable (e.g. a wrong project name), otherwise report it. No retry loops.
- `401` → stop and tell the user the token is invalid, expired or revoked.
  `409` → use a new `run.id`. `413` → halve the batch. `5xx` → retry once with
  the same `run.id`.
- Summarize for the user: counts per outcome, plus the `rejected_invalid`
  items with their reasons. Remind them that proposals wait in the CS Hub's
  Approvals inbox.

## Source refs

A `source_ref` must be **stable** — the same fact must get the same ref on every
run. Patterns:

| Source | Pattern | Example |
|---|---|---|
| Ticketing | `<system>:<ticket key>` (lowercase system) | `zendesk:SUP-4821`, `jira:PRISM-112` |
| Slack | `slack:<channel id>/<message ts>` (root message of the thread where the fact is first stated) | `slack:C04PRISM/1728480000.001200` |
| Email | `email:<RFC Message-ID without angle brackets>` (first message stating the fact) | `email:CAF1x9…@mail.example.test` |
| Refold metric | `refold:<metric_key>:<account id>:<period YYYY-MM-DD>` | `refold:execution_volume:5f1c…:2026-09-01` |
| Health | `health:<account id>` (one ref per account; the server compares against current health) | `health:5f1c…` |

When a later message changes something you already reported (a date slips, an
escalation is resolved), **reuse the original `source_ref`** — from
`known_records`, or from the first message in the thread — so it updates the
same item instead of creating a duplicate.

## Self-check (before delivering)

- [ ] `record_type` is one of: milestone, accomplishment, risk, escalation,
      ticket, metric, health — and was requested for this unit.
- [ ] `account` is the account's id or one of its aliases.
- [ ] `project` is present for milestone and accomplishment, and matches a
      listed project name or id.
- [ ] Required `data` fields are present (see `reference/record-types.md`); no
      fields the type doesn't accept.
- [ ] Enum values come from `allowed_values` when the context provides them.
- [ ] Dates are ISO (`YYYY-MM-DD`; periods are the first of the month for
      monthly items).
- [ ] `source_ref` follows the pattern table and is stable.
- [ ] `evidence.excerpt` is verbatim from the source, ≤ 280 characters, with no
      secrets.
- [ ] `confidence` ≥ 0.5 (otherwise moved to `skipped`).
- [ ] At most 200 records per payload.
