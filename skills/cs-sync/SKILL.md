---
name: cs-sync
description: Sync customer-success facts for Refold accounts — tickets, escalations, risks, milestones, accomplishments, metrics, action items, engagements and account health — from Slack, email, ticketing and Fireflies (via the Refold MCP server) into the Refold CS Hub as proposals for human approval. Use for a full backfill, the daily incremental sync, or a scoped refresh of one account and one record type. Also use when someone asks to "sync", "refresh" or "pull updates" for a customer account into the CS Hub.
---

# CS Sync

You turn what is happening with Refold's customers — in Slack, email, the
ticketing tool and Fireflies — into structured **records** for the Refold
CS Hub. Every record you produce becomes a **proposal**; a person on the
CS team approves or rejects it. You never change the Hub directly, and you
never write to Slack/Zendesk/Gmail/Fireflies — every connected app is
read-only for this skill.

## Golden rules

1. **Report facts, never invent them.** Every record must be supported by a
   concrete source item (message, email, ticket, transcript). If a field
   isn't stated or clearly derivable, leave it out.
2. **Every record needs `evidence` and a stable `source_ref`.** Evidence is a
   link plus a verbatim excerpt (≤ 280 characters) — except for `engagement`
   and `action_item` summaries, which come from a transcript's own summary
   or action-item list, never the raw verbatim transcript. `source_ref`
   rules are in §Source refs; they make re-runs safe.
3. **Report current state; let the server dedupe.** Don't try to work out
   whether the Hub already has something. Send what you see with the right
   `source_ref` — the ingest API decides create vs. update vs. skip. The only
   exception: when the sync context lists `known_records`, reuse an existing
   record's `source_ref` when you're reporting a change to that same thing
   (e.g. a milestone date slipped, an action item moved to done).
4. **When unsure, skip.** Prefer ten accurate records over fifty noisy ones.
   Don't emit anything with confidence below 0.5. Put it in `skipped` with a
   short reason instead.
5. **Accounts and tenants come from the Hub, never from you.** Attribute a
   fact to an account/tenant **only** via an exact source match (a mapped
   Slack channel, email domain, Zendesk org id, Fireflies hint) or a name
   already listed in the sync context's known roster. You never create an
   account, and you never treat a tenant as its own account (a platform
   customer's own program/sub-account is a *tenant* of that customer, not a
   new logo) — when you're not sure which it is, or whether it's a known
   account at all, send the record anyway with your best-guess `account`/
   `tenant` string: the ingest API itself will hold it and raise an
   "account match needed" item for a human, rather than you guessing. This
   is exactly the failure mode this rule exists to prevent — an agent that
   silently decided "Amex" was its own account rather than a tenant of a
   known platform customer. Never pre-filter a record out just because you
   personally aren't sure which account/tenant it is — that's the Hub's
   decision to make, not yours, as long as you have *some* identifier.
6. **Follow active `learnings` over your own judgment.** The sync context's
   `learnings` array (empty until the CS team has made enough decisions for
   patterns to emerge) carries rules and examples written from real
   approval/rejection history. When non-empty, apply them, and report which
   ones you used (by id) in your summary — this is how the Hub tracks which
   rules are actually earning their keep.
7. **Confidentiality.** Never include credentials, tokens, API keys,
   passwords or secrets in any field or excerpt — even if they appear in
   the source. Keep personal data to names and roles already visible in
   the source. Never echo the ingest token. **Never read any document,
   file, or Drive item whose name or path suggests credentials or login
   details, under any circumstances** — this applies even if such a
   document happens to be reachable through a connected tool; Drive itself
   is out of scope for this skill entirely (no Drive tool is ever called).
8. **`httprequest` (the generic escape-hatch action on Fireflies/Zendesk) is
   read-only, with no exceptions.** Fireflies: only `POST /graphql` bodies
   containing a GraphQL `query` — never a `mutation`. Zendesk: only `GET`
   requests (search, `tickets/{id}`, incremental export) — never `POST`/
   `PUT`/`DELETE`. If a plan you're building would need `httprequest` to
   write anything, stop and skip that step instead — it is never correct
   for this skill to use `httprequest` for a write, regardless of what the
   runner environment does or doesn't enforce server-side.

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
        "tenants": [{ "id": "uuid", "name": "Northwind Program", "aliases": ["northwind", "C0NORTHWIND"] }],
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
      "risks": [], "escalations": [], "tickets": [], "action_items": [], "engagements": []
    }
  },
  "metric_definitions": [{ "key": "execution_volume", "label": "Execution volume", "unit": "count" }],
  "allowed_values": { "milestone_status": [], "risk_status": [], "escalation_status": [], "severity": [], "ticket_status": [], "ticket_priority": [], "action_item_priority": [], "action_item_status": [] },
  "learnings": [{ "id": "uuid", "kind": "rule | example", "scope": "global | account | tenant", "content": "..." }]
}
```

Account/tenant `aliases` carry the bindings: Slack channel ids, customer
email domains, ticketing organization/project keys, and name variants —
these are `account_sources` rows the Hub itself maintains. Use them to find
each account's/tenant's sources and to tie items back to the right one.
Never widen a search beyond what's listed here on your own judgment.

## Modes

| Mode | Scope | Window |
|---|---|---|
| `scoped` | One account × one record type (a Refresh button). | From the unit's `since` to now. |
| `daily` | Every unit in the context. | Each unit's own `since`. |
| `backfill` | All record types for the listed accounts. | `since` if given, else the last 90 days. Work one account at a time. |
| `discovery` | **No account** — a sweep that finds customers nobody has added yet. See below. | The context's `since` (default: the last 7 days). |

Only produce record types listed in each unit's `record_types`.

## Discovery sweep (`mode: "discovery"`)

Every other mode points you at an account that already exists. This one
exists because of the opposite problem: **a conversation with a company
nobody ever added to the Hub is invisible** — no unit names it, so nothing
goes looking, and it is never seen. New prospects and early conversations
are exactly what gets missed this way.

The context looks different: instead of `units`, you get
`known_accounts` (the **whole roster** — every account, its `aliases` and
its tenants), `internal_email_domains` (who counts as "us"),
`discovery_channel_patterns`, and `since`.

**1. Collect candidates — per connector:**

| Source | Look at an item when |
|---|---|
| **Slack** | the channel is externally shared (`is_ext_shared` or `is_shared` — an outside company is in it) **or** its name contains any `discovery_channel_patterns` entry (e.g. `internal-acme`, your own team's channel *about* a customer). Then read its history since `since`. |
| **Fireflies** | any attendee's email domain is **not** in `internal_email_domains`, **or** the token owner attended (`query { user { email } }` identifies them). Then read the summary and action items. |
| **Gmail** | any thread participant's domain is not internal. Exclude sent, promotions and social. |
| **Zendesk** | **every** ticket updated since `since` (via the read-only incremental export) — a ticket always has a customer behind it. |

**2. For each candidate, decide one of three things:**

- **It belongs to a known account or tenant** (an `aliases` match, or the
  account/tenant name appears in the title, summary or action items) →
  **skip it.** Put it in `skipped` with the account name as the reason.
  That account's own sync already covers it; reporting it here too would
  file the same fact twice.
- **It is clearly a customer or prospect, but matches nothing in
  `known_accounts`** → **this is what the sweep is for.** Emit its records
  with your best-guess identifier as `account` — the external email domain
  (`acme.com`), the channel-name suffix (`internal-acme` → `acme`), the
  Zendesk organization, or the company name as written. The Hub will hold
  the record and raise an "Account match needed" item so a human can create
  the account. **Never invent the account yourself.**
- **There is no customer in it at all** (an internal team sync, a vendor
  call, a recruiting conversation) → **skip it**, reason: "no identifiable
  customer account".

**3. Keep it cheap.** A sweep looks at a lot and reports a little. Don't
pull full histories where a title, summary or action-item list answers the
question. Respect `unavailable_connectors_this_run` — those connectors are
down for this run, so don't spend turns on them; note them in `skipped`.

## Workflow

1. **Read the sync context.** Note each unit's account, tenants, aliases,
   projects, record types, `since`, and any `learnings`.
2. **Gather**, per connector (full detail and real action ids in
   `reference/tool-map.md`):
   - **Zendesk (tickets):** tickets updated since `since`, via a read-only
     search (currently `httprequest` → `GET /api/v2/search.json` or the
     incremental export endpoint, once Zendesk is connected — see the
     Known-gap note in `reference/record-types.md` if it still isn't).
     Deterministic, never inferred from chat.
   - **Slack (escalation, risk, milestone, accomplishment, health, action
     items, engagements mentioned in a thread):** read each account's and
     tenant's **mapped channels** since `since` (never limited to channels/
     threads *you* happen to be in — the account's full mapped set, every
     time), plus a supplementary keyword search — one keyword per query,
     **never a boolean OR** (`escalation`, `blocker`, `P0`, `go-live`,
     `POC`, `kickoff`) — including DMs and group DMs. Cap how much thread
     context you pull per call; you don't need an entire channel's history
     to extract one fact.
   - **Gmail (same record types as Slack):** search the CS mailbox using
     the account's/tenant's email-domain sources plus the same keyword
     list; exclude sent mail, promotions, and social
     (`-in:sent -category:promotions -category:social`).
   - **Fireflies (engagement, action_item, risk, milestone/accomplishment
     mentioned in a meeting):** list transcripts by **explicit date range**
     (`httprequest` → Fireflies' GraphQL API), capped at 50 per call,
     paging with `skip` and splitting a long range into multiple ≤50-item
     windows rather than one huge pull. Then read each transcript's
     **summary and action-items list** — never the raw transcript text.
     **Attribute a meeting two ways, not just by domain** (revised
     2026-10-11 — the domain-only rule was too blunt: most customer
     decisions actually surface in internally-attended meetings, e.g. an
     internal deal-review call that mentions a named account):
     (a) a participant's email domain matches an account/tenant source, or
     (b) the title, summary, or action items **name** a known account or
     tenant (its listed name or one of its aliases) — an internal-only
     attendee list is not itself a reason to skip. Skip a transcript
     outright (reason: "no identifiable customer account") **only** when
     neither check finds anything — no domain match and no name/alias
     mention anywhere in the title/summary/action items. A mention that's
     unclear which account/tenant it is (an ambiguous short name, a
     program name not yet in the roster) still goes through
     `account_resolution` as usual — that path is for "clearly about a
     customer, just not one we've mapped," not for "we found nothing at
     all to go on."
   - **Drive: out of scope.** No Drive tool is ever called by this skill.
3. **Extract** candidate facts per record type, following
   `reference/record-types.md` — what counts, field mapping, confidence.
4. **Attach** each fact to exactly one account (and a tenant, when the
   source clearly indicates one), and to a project where the type needs
   one (matched against the account's listed projects; skip if none fits).
   If the account/tenant itself is unclear, send your best-guess
   identifier anyway (Golden rule 5) — don't drop the record.
5. **Build records** in the ingest format below, with `source_ref`, `evidence`
   and `confidence`.
6. **Self-check** every record against the checklist below; drop or fix
   failures.
7. **Deliver:**
   - **Runner mode** (a sync context was given): reply with ONLY the output
     JSON (§Output). No prose before or after. The runner posts it.
   - **Hand-run mode**: post to the ingest API yourself (§Posting), then give
     the user a short summary, including which `learnings` (if any) you used.

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
    },
    {
      "record_type": "engagement",
      "operation": "create",
      "account": "prism-analytics",
      "type": "call",
      "source_ref": "fireflies:f1a2b3c4",
      "observed_at": "2026-10-07T15:00:00Z",
      "data": { "engagement_date": "2026-10-07", "summary": "Quarterly check-in — reviewed Q3 usage, agreed on Q4 rollout plan.", "attendees": ["Customer VP Ops", "Account EDL"], "follow_ups": "Send updated rollout timeline by Friday." },
      "evidence": { "url": "https://app.fireflies.ai/view/f1a2b3c4", "excerpt": "Reviewed Q3 usage trends and agreed on a phased Q4 rollout." },
      "confidence": 0.95
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
  `duplicate_skipped`, `previously_rejected`, `superseded_pending`, and
  `held_pending_resolution` are all fine — the last one means the Hub
  couldn't resolve the account/tenant and has filed an "account match
  needed" item for a human; it is not an error.
- For `rejected_invalid`: fix it once if the `reason` points at something
  fixable (e.g. a wrong project name), otherwise report it. No retry loops.
- `401` → stop and tell the user the token is invalid, expired or revoked.
  `409` → use a new `run.id`. `413` → halve the batch. `5xx` → retry once with
  the same `run.id`.
- Summarize for the user: counts per outcome, which `learnings` you used (if
  any), plus the `rejected_invalid` items with their reasons. Remind them
  that proposals wait in the CS Hub's Approvals inbox, and held items wait
  in its pinned "Account match needed" section.

## Source refs

A `source_ref` must be **stable** — the same fact must get the same ref on every
run. Patterns:

| Source | Pattern | Example |
|---|---|---|
| Ticketing | `<system>:<ticket key>` (lowercase system) | `zendesk:SUP-4821`, `jira:PRISM-112` |
| Slack | `slack:<channel id>/<message ts>` (root message of the thread where the fact is first stated) | `slack:C04PRISM/1728480000.001200` |
| Email | `email:<RFC Message-ID without angle brackets>` (first message stating the fact) | `email:CAF1x9…@mail.example.test` |
| Fireflies meeting (engagement) | `fireflies:<transcript id>` | `fireflies:f1a2b3c4` |
| Fireflies action item | `fireflies:<transcript id>#<n>` (the transcript's own action-item index) | `fireflies:f1a2b3c4#2` |
| Refold metric | `refold:<metric_key>:<account id>:<period YYYY-MM-DD>` | `refold:execution_volume:5f1c…:2026-09-01` |
| Health | `health:<account id>` (one ref per account; the server compares against current health) | `health:5f1c…` |

When a later message changes something you already reported (a date slips, an
escalation is resolved, an action item moves to done), **reuse the original
`source_ref`** — from `known_records`, or from the first message/transcript —
so it updates the same item instead of creating a duplicate.

## Self-check (before delivering)

- [ ] `record_type` is one of: milestone, accomplishment, risk, escalation,
      ticket, metric, health, action_item, engagement — and was requested
      for this unit.
- [ ] `account` is the account's id or one of its aliases; `tenant` (if
      used) is the tenant's id or one of its aliases, scoped to that
      account — and is **never** a guess at creating or promoting one.
- [ ] `project` is present for milestone and accomplishment, and matches a
      listed project name or id. `type` is present (and one of
      `call`/`check_in`/`qbr`/`ebr`/`note`) for every `engagement`.
- [ ] Required `data` fields are present (see `reference/record-types.md`); no
      fields the type doesn't accept. `action_item.owner` (if any) is the
      name as stated, not a guess at which profile it resolves to.
- [ ] Enum values come from `allowed_values` when the context provides them.
- [ ] Dates are ISO (`YYYY-MM-DD`; periods are the first of the month for
      monthly items).
- [ ] `source_ref` follows the pattern table and is stable.
- [ ] `evidence.excerpt` is verbatim from the source, ≤ 280 characters, with no
      secrets. Never sourced from a credentials/login-details document.
- [ ] `confidence` ≥ 0.5 (otherwise moved to `skipped`).
- [ ] Any `httprequest` call used only `GET` (Zendesk) or a GraphQL `query`,
      never a `mutation` (Fireflies).
- [ ] At most 200 records per payload.
