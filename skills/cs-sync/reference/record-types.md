# Record types — what to extract and how

Fields match the CS Hub ingest API (`docs/ingest-api.md`). Use only the fields
listed for each type; anything else is stripped by the server.

**Allowed enum values.** The sync context's `allowed_values` (when the
runner provides it) is authoritative — use it. As a fallback reference (the
CS Hub schema as of 2026-10-10, confirmed directly against its Postgres
enums): `milestone_status` — `not_started`/`in_progress`/`done`/`at_risk`;
`risk_status` — `open`/`mitigating`/`resolved`/`accepted`;
`escalation_status` — `open`/`in_progress`/`resolved`/`closed`; `severity`
(shared by risk and escalation) — `low`/`medium`/`high`/`critical`;
`ticket_status` — `open`/`pending`/`resolved`/`closed`; `ticket_priority` —
`p1`/`p2`/`p3`/`p4`; `health` — `active`/`caution`/`risk`;
`action_item_priority` — `p0`/`high`/`medium`/`low`; `action_item_status`
(the sync-relevant subset — standups also uses `open`/`done` internally,
unrelated) — `open`/`in_progress`/`blocked`/`done`.

**Known gap, as of 2026-10-11** (see `reference/tool-map.md` §Connected
apps and `docs/refold-mcp.md`'s Slack connector addendum): Slack is still
connected as a **bot**, not a user — channel-history reads still return
`not_in_channel` and `search_messages` still fails
(`not_allowed_token_type`) until that's switched. Confirmed this session
that Refold's Slack connector *does* support a user token (and a custom
app with its own scopes), but re-authorizing is a separate, not-yet-done
step — and even once done, Refold's *current default app*'s scopes don't
include `search:read`, so `search_messages` specifically needs a custom
app with that scope added, not just a user-token re-auth. Treat an empty
channel-history result as "can't read this channel yet," not as "no
activity" — don't let it suppress a `health` reassessment that would
otherwise fire.

Confidence scale for all types:

| Confidence | Meaning |
|---|---|
| 0.9–1.0 | Read directly from a system of record (ticketing tool, Refold metrics), or stated explicitly and unambiguously in writing. |
| 0.7–0.89 | Clearly stated in conversation by someone in a position to know (customer stakeholder, account EDL/FDE). |
| 0.5–0.69 | Reasonable reading of the conversation, but some interpretation involved. |
| < 0.5 | Don't emit — put in `skipped`. |

---

## ticket → `tickets`

**Source:** the ticketing tool only (deterministic). Never create tickets from
chat messages. **Ticketing system: Zendesk** — the only one attached to the
CS Hub MCP server (`reference/tool-map.md`).

| Field | Required | Mapping |
|---|---|---|
| `external_key` | yes | Ticket key/number as shown in the tool. |
| `title` | yes | Ticket subject. |
| `system` | yes | Always `"Zendesk"` for this skill. |
| `priority` | no | Normalize to `allowed_values.ticket_priority` (`p1`/`p2`/`p3`/`p4`). |
| `status` | no | Normalize to `allowed_values.ticket_status` (`open`/`pending`/`resolved`/`closed`). |
| `url` | no | Link to the ticket. |

- Include every ticket for the account **created or updated since `since`**.
- Send current values every time; the server skips unchanged tickets and turns
  changes (e.g. status) into update proposals.
- `operation: delete` only if the ticket was deleted in the source system
  (rare). Closed tickets are an update to `status`, never a delete.
- Confidence 0.95.
- **Discovery (`reference/tool-map.md` §Connected apps):** Zendesk has no
  native list/search action — `get_ticket_by_id` only. Tickets updated
  since the watermark are fetched via the `httprequest` action running a
  **read-only `GET`** against Zendesk's own `/api/v2/search.json` (or
  `tickets/{id}`, or the incremental export endpoint) — confirmed as a
  working mechanism for Fireflies, expected to work the same way for
  Zendesk once it's connected (not yet verified live — Zendesk isn't
  connected to test against). Still blocked until that connection exists;
  skip this record type rather than guessing in the meantime.

## escalation → `escalations`

**Signals:** an explicit "escalate/escalation"; executive or sponsor
involvement over a problem; a production-down or data-loss incident; a
customer threatening a deadline, renewal or contract; repeated urgent asks with
no resolution.

| Field | Required | Mapping |
|---|---|---|
| `title` | yes | One line: what is wrong and the business impact. |
| `severity` | no | `allowed_values.severity` — production down / exec involved → top level. |
| `status` | no | open when raised; resolved when the customer confirms the fix. |
| `raised_by` | no | Role, or the name as it appears in the source (e.g. "Customer VP Finance"). |

- Resolution: when a thread shows it resolved, send an `update` with
  `status: resolved` using the **original** `source_ref`.
- Not every complaint is an escalation. A single "this is annoying" isn't one.

## risk → `risks`

**Signals:** something that could materially hurt the timeline, adoption,
renewal or expansion — and hasn't (yet) become an escalation. Examples: a key
champion leaving, a blocked dependency on the customer side, security-review
failures, a sustained drop in usage, a competitor being evaluated, a budget
freeze.

| Field | Required | Mapping |
|---|---|---|
| `risk` | yes | What could go wrong. |
| `impact` | yes | What happens if it does (timeline / revenue / adoption). |
| `mitigation` | no | Only if someone actually proposed or started one. |
| `severity` | no | `allowed_values.severity`. |
| `status` | no | `allowed_values.risk_status` (open when first seen). |
| `owner` | no | Refold person driving the mitigation, if named. |
| *(record-level)* `project` | no | If the risk is clearly about one project. |

- If you can't state an `impact`, it isn't a usable risk yet — skip it.

## milestone → `milestones`

**Signals:** an agreed delivery date or target: go-lives, UAT start/finish,
phase completions, migrations, POC deadlines.

| Field | Required | Mapping |
|---|---|---|
| `period` | yes | Target date (`YYYY-MM-DD`), or first of the month if only a month is known. |
| `description` | yes | The deliverable, e.g. "Phase 1 go-live (15 workflows)". |
| `status` | no | `allowed_values.milestone_status`. |
| *(record-level)* `project` | **yes** | Matched against the account's projects; skip if none fits. |

- **Date slips:** send an `update` reusing the original milestone's
  `source_ref` (from `known_records`) with the new `period`, and status if
  stated.
- **Completion:** an `update` with the completed status. Also consider an
  accomplishment (below).

## accomplishment → `accomplishments`

**Signals:** something delivered and confirmed: went live, shipped a feature
the customer asked for, completed a migration, passed UAT, onboarded the
customer's end customers.

| Field | Required | Mapping |
|---|---|---|
| `period` | yes | First of the month it happened (`YYYY-MM-01`). |
| `text` | yes | What was delivered, in one sentence, with a number if stated. |
| *(record-level)* `project` | **yes** | Matched against the account's projects. |

- Only things that actually happened — not plans or promises.

## metric → `metric_values`

**Source:** Refold platform tools and deterministic workflows only (execution
volume, success rate, MTTR, active connectors, MCP usage …). Never estimate
metrics from conversation.

| Field | Required | Mapping |
|---|---|---|
| `metric_key` | yes | Must be one of `metric_definitions[].key` from the context — see `reference/tool-map.md` for the full current list. |
| `period` | yes | First day of the period (`YYYY-MM-01` for monthly). |
| `value` | yes | A number in the definition's unit. |
| `baseline_value` | no | Only if the source provides a "before" figure. |
| *(record-level)* `project` | no | If the metric is project-specific. |

- Confidence 0.95 for tool-reported values.
- **Known gap (`reference/tool-map.md` §Deterministic path):** as of
  2026-10-10 the org has zero Refold workflows published, so none of these
  values currently have a source at all. Skip this record type entirely
  until a workflow exists — don't substitute a guess or a Slack-mentioned
  number for a tool-reported one.

## health → `organizations` (the account itself)

A judgment, so be conservative. Propose only when the evidence points to a
**different** health than the context's `current_health`.

| Field | Required | Mapping |
|---|---|---|
| `health` | yes | `active` \| `caution` \| `risk`. |
| `health_reason` | no (send it anyway) | One or two sentences citing the evidence. |

Rubric:

- **risk** — an open high-severity escalation, executive dissatisfaction,
  explicit churn / non-renewal / competitor signals, or an unresolved
  production outage.
- **caution** — slipping milestones, open high-severity risks, a declining
  usage trend, slow or blocked customer-side dependencies, unanswered asks.
- **active** — work on track, no open high-severity issues, a responsive
  customer.

- `source_ref`: `health:<account id>`. Evidence: the single strongest item.
- Confidence: 0.6–0.8 (it's interpretation); 0.85+ only when the customer says
  it outright.
- `delete` is never valid for health.

## action_item → `action_items`

**Signals:** a concrete, assignable task someone committed to — "I'll send
the SOC2 doc by Friday," a Fireflies transcript's own action-items list, a
Slack thread ending in "can you do X."

| Field | Required | Mapping |
|---|---|---|
| `description` | yes | The task, one line, specific enough to act on without the source. |
| `owner` | no | Name as it appears in the source (e.g. "Divyansh" or a "/"-joined list of several names if that's genuinely how it was said) — resolved server-side against profile names; never pick one person out of a joined list yourself. |
| `priority` | no | `p0`/`high`/`medium`/`low` — normalize any source casing ("P0", "High") to this. |
| `due_date` | no | ISO date, if a deadline was actually stated — never invent one. |
| `status` | no | `open` when first captured; `in_progress`/`blocked`/`done` only when the source says so later (reuse the original `source_ref` for that update, don't create a new item). |
| *(record-level)* `project` | no | If the task is clearly about one project. |

- `source_ref`: a stable id from the source — `fireflies:<transcript
  id>#<n>` (the transcript's own action-item index) or
  `slack:<channel id>/<root message ts>`.
- Confidence 0.9+ when read directly from a transcript's own action-items
  list or a ticket; 0.6–0.8 for one inferred from conversational commitment
  language.
- A blocker someone raises in a standup context (product-overview.md §5.7's
  "blocker → ask/action item") is the same shape — this skill doesn't touch
  standups directly, but a transcript/Slack-sourced equivalent is this type.

## engagement → `engagements`

**Signals:** a meeting, call, or structured touchpoint actually happened —
not a scheduled-but-not-yet-held one.

| Field | Required | Mapping |
|---|---|---|
| *(record-level)* `type` | **yes** | `call`/`check_in`/`qbr`/`ebr`/`note` — the kind of engagement, not part of `data`. |
| `engagement_date` | yes | The date it happened (`YYYY-MM-DD`). |
| `summary` | yes | What was covered/decided, from the transcript's own summary — never the raw verbatim transcript. |
| `attendees` | no | Names as they appear in the source (meeting participants, email thread, Slack thread). |
| `follow_ups` | no | Open items from the meeting that aren't already captured as a separate `action_item`. |

- `source_ref`: `fireflies:<transcript id>` for a Fireflies-sourced
  engagement; an email Message-ID or Slack ref otherwise.
- Confidence 0.9+ — this is deterministic (a meeting either happened and
  was transcribed, or it didn't), not interpretation.
- Extract decisions/risks/commitments mentioned in the summary as their
  own `milestone`/`risk`/`action_item` records too, each with their own
  `source_ref` — don't let a decision only live inside an engagement's
  `summary` text where it's not separately actionable.
