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
`p1`/`p2`/`p3`/`p4`; `health` — `active`/`caution`/`risk`.

**Known gap affecting every Slack-sourced type below** (escalation, risk,
milestone, accomplishment, health) — see `reference/tool-map.md` §Connected
apps: as of 2026-10-10 the CS Hub's Slack connection is not a member of any
channel, so channel-history reads return nothing (`not_in_channel`) until
someone invites it into the channels this skill needs to read. Treat an
empty channel-history result as "can't read this channel yet," not as "no
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
- **Known gap (`reference/tool-map.md` §Connected apps):** Zendesk's only
  resolvable action today is `get_ticket_by_id` — there is no list/search
  action, so "every ticket updated since `since`" has no direct source yet.
  Until that's added (or another signal supplies ticket ids), skip this
  record type rather than guessing.

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
