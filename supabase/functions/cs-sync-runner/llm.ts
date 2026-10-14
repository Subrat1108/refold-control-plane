// 7.5-pre2 Session 5 (provider switched post-ship) — runs skill.md as an
// LLM agent via a plain `fetch` against OpenRouter's OpenAI-compatible
// chat/completions API (no SDK — matching ingest/provisioning's existing
// no-extra-deps convention). The runner PROXIES every tool call itself
// (resolveActions/executeAction from refold.ts, gated by allowlist.ts)
// rather than handing the model a built-in MCP connector — that would call
// EXECUTE_ACTION directly, with no server-side chance to reject a
// non-read-only call first.
//
// Was Anthropic's native /v1/messages API until 2026-10-12. OpenRouter is
// NOT a drop-in credential swap: it speaks the OpenAI shape, so the tool
// contract differs in four places this file has to handle —
//   1. the system prompt is a `system`-role MESSAGE, not a top-level field;
//   2. tools are {type:'function', function:{name, description, parameters}},
//      not {name, description, input_schema};
//   3. a tool call comes back as choices[0].message.tool_calls[] whose
//      `arguments` is a JSON **string** needing its own parse (Anthropic
//      handed back an already-parsed `input` object), and the turn ends with
//      finish_reason === 'tool_calls', not stop_reason === 'tool_use';
//   4. a tool RESULT is its own {role:'tool', tool_call_id} message, not a
//      tool_result block inside a user turn.
// Everything outside this file (index.ts's processUnit, validate.ts) is
// provider-agnostic and was untouched by the switch.

import { checkExecuteAction, type ExecuteActionInput } from './allowlist.ts'
import { executeActionDeterministic } from './refold.ts'
import { SKILL_PROMPT } from './skill-prompt.ts'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? ''
// OpenRouter model ids are namespaced `provider/model` — a bare
// `claude-sonnet-5` is not a valid id there. Confirmed available against
// the live /api/v1/models catalog before setting this default.
const MODEL = Deno.env.get('CS_SYNC_MODEL') || 'anthropic/claude-sonnet-5'
// A discovery sweep is bulk filtering — list meetings, check attendee
// domains, keep the few that matter — not the careful judgment a
// per-account sync makes. On Sonnet each turn took 30-40s and a sweep
// could not finish inside an Edge Function's ~150s wall at all. A fast
// model clears the same work in a fraction of the time and ~20x cheaper.
const DISCOVERY_MODEL = Deno.env.get('CS_SYNC_DISCOVERY_MODEL') || 'anthropic/claude-haiku-5.5'
const STUB_MODE = Deno.env.get('CS_SYNC_STUB_MODE') === 'true'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_TURNS = 12
const REPAIR_TURNS = 3
// A sweep's final turn carries every record it found plus its skipped list,
// so the old 4096 was far too small — the first live sweep's reply was cut
// off mid-JSON and failed as "schema-invalid output". Configurable because
// the right ceiling depends on the model.
const MAX_OUTPUT_TOKENS = Number(Deno.env.get('CS_SYNC_MAX_OUTPUT_TOKENS') ?? '16000')
// An Edge Function invocation is killed by the gateway at ~150s. The first
// sweep that actually worked did 13 real Fireflies calls and then died at
// that wall — losing every record it had gathered AND leaving the unit
// locked, the worst of both. So the loop watches its own clock: when the
// budget is nearly spent it asks for the answer NOW and takes one last
// turn, turning a total loss into a partial result.
const DEADLINE_MS = Number(Deno.env.get('CS_SYNC_DEADLINE_MS') ?? '100000')
const WRAP_UP_RESERVE_MS = 35_000
// Every tool result is re-sent as part of the conversation on EVERY later
// turn, so one fat listing is not paid for once -- it is paid for again and
// again until the run ends. That is how a 150k cap produced 412k-token
// runs in production: a 90-channel Slack listing and a 150-transcript
// Fireflies page sat in the history being re-billed. Truncating here is the
// single biggest lever on spend, and it costs nothing the agent needs: the
// marker below tells it plainly that there is more and what to do about it.
const MAX_TOOL_RESULT_BYTES = Number(Deno.env.get('CS_SYNC_MAX_TOOL_RESULT_BYTES') ?? '24000')

// OpenAI function-calling shape (OpenRouter normalizes this to each
// provider's native tool format on the way out).
// Only ONE tool is exposed. `RESOLVE_ACTIONS` used to be here and was
// actively harmful: it cost 8-16s per call, and it UNDER-REPORTS what is
// available — on the first working live sweep it returned only
// get_transcript/get_user for Fireflies, omitting `httprequest`, so the
// agent concluded Fireflies could not be listed by date and gave up
// without fetching anything (its own skipped-reason said exactly that).
// The context's `action_catalog` now states what can be called, and
// allowlist.ts is the real constraint either way — so resolving at runtime
// adds latency and bad information with no capability gain.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'execute_action',
      description: 'Run one Refold action from the action_catalog in your context. Every connected app is read-only for this skill — a write is rejected before it reaches Refold.',
      parameters: {
        type: 'object',
        properties: {
          application_slug: { type: 'string', description: 'e.g. fireflies, slack, gmail, zendesk' },
          action_id: { type: 'string', description: 'e.g. httprequest, list_channels, get_conversation_history' },
          input_payload: { type: 'object' },
        },
        required: ['application_slug', 'action_id', 'input_payload'],
      },
    },
  },
]

// Every tool call is logged: which action, whether it worked, how long it
// took, how much came back. Never the payload or the result content — the
// same privacy line `ingest` holds. Without this a run that reports nothing
// is indistinguishable from a run that failed to use its tools at all,
// which is precisely what went wrong on the first live sweep.
async function dispatchTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const started = Date.now()
  const label = name === 'execute_action'
    ? `${(input as Record<string, string>).application_slug}/${(input as Record<string, string>).action_id}`
    : name
  let outcome = 'ok'
  let result: unknown
  try {
    result = await runTool(name, input)
    const asRecord = result as Record<string, unknown> | null
    if (asRecord && typeof asRecord === 'object') {
      if ('error' in asRecord) outcome = 'rejected'
      else if (asRecord.node_status === 'Errored') outcome = `app_error:${((asRecord.data as Record<string, unknown>)?.error as string) ?? 'unknown'}`
    }
  } catch (err) {
    outcome = `threw:${err instanceof Error ? err.name : 'unknown'}`
    result = { error: String(err) }
  }
  const bytes = (() => { try { return JSON.stringify(result ?? '').length } catch { return -1 } })()
  console.log(`tool ${label} ${outcome} ${Date.now() - started}ms ${bytes}B`)
  return result
}

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === 'execute_action') {
    const call = input as unknown as ExecuteActionInput
    const check = checkExecuteAction(call)
    if (!check.ok) return { error: check.reason }
    return await executeActionDeterministic(call.application_slug, call.action_id, call.input_payload)
  }
  return { error: `unknown tool ${name}` }
}

export interface AgentResult {
  rawText: string | null
  tokensUsed: number
  turns: number
  stopped: 'end_turn' | 'max_turns' | 'deadline' | 'token_cap'
  messages: Array<Record<string, unknown>>
}

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

// Serialise a tool result, bounded. When the payload is an array-bearing
// object (every Refold listing is) the array is CUT rather than the JSON
// string sliced, so what the model receives is still valid JSON it can
// parse -- a truncated string would be worse than useless. The note is
// addressed to the model: it says how much is missing and that narrowing
// beats paging, which is the behaviour change that actually saves tokens.
function serialiseToolResult(result: unknown): string {
  let text = JSON.stringify(result ?? null)
  if (text.length <= MAX_TOOL_RESULT_BYTES) return text

  // Find the longest array anywhere one level inside the result and trim it
  // proportionally -- that is where the bulk invariably is. A bare array at
  // the top level is wrapped first: `typeof [] === 'object'`, so without
  // this it spreads into an object of numeric keys and nothing gets cut.
  const record = (Array.isArray(result) ? { items: result } : result) as Record<string, unknown> | null
  if (record && typeof record === 'object') {
    const clone: Record<string, unknown> = { ...record }
    const containers: Array<[Record<string, unknown>, string, unknown[]]> = []
    const scan = (obj: Record<string, unknown>, depth: number) => {
      if (depth > 3) return
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) containers.push([obj, key, value])
        else if (value && typeof value === 'object') {
          const nested = { ...(value as Record<string, unknown>) }
          obj[key] = nested
          scan(nested, depth + 1)
        }
      }
    }
    scan(clone, 0)
    containers.sort((a, b) => b[2].length - a[2].length)
    const biggest = containers[0]
    if (biggest && biggest[2].length > 1) {
      const [owner, key, items] = biggest
      // The note is part of the payload, so the search has to budget for it
      // up front. Measuring the slice and THEN appending the note pushed the
      // result back over the limit and silently fell through to the crude
      // fallback below -- caught by the unit test, not by inspection.
      const note = (kept: number) =>
        `Showing ${kept} of ${items.length} items in "${key}" -- ${items.length - kept} omitted to stay inside this run's budget. Do NOT page for the rest: narrow the query instead (a shorter date range, a specific channel or account). If what you need is not here, record it in \`skipped\` and move on.`
      const budget = MAX_TOOL_RESULT_BYTES - note(items.length).length - 16
      clone._truncated = note(0)
      let lo = 0, hi = items.length
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        owner[key] = items.slice(0, mid)
        if (JSON.stringify(clone).length <= budget) lo = mid
        else hi = mid - 1
      }
      if (lo > 0) {
        owner[key] = items.slice(0, lo)
        clone._truncated = note(lo)
        text = JSON.stringify(clone)
        if (text.length <= MAX_TOOL_RESULT_BYTES) return text
      }
    }
  }

  // Not array-shaped (or still too big): fall back to a hard slice, wrapped
  // so it stays parseable JSON.
  const fallbackNote = `Result was ${text.length} bytes, over this run's ${MAX_TOOL_RESULT_BYTES}-byte per-result limit. A prefix follows as text. Narrow the query rather than retrying.`
  // Reserve the note and the enclosing JSON itself, or the wrapper pushes
  // the "truncated" result back over the very limit it exists to enforce.
  const room = Math.max(0, MAX_TOOL_RESULT_BYTES - fallbackNote.length - 64)
  return JSON.stringify({ _truncated: fallbackNote, preview: text.slice(0, room) })
}

async function runConversation(messages: Array<Record<string, unknown>>, maxTurns: number, tokensUsedSoFar: number, model: string = MODEL, deadlineAt = Date.now() + DEADLINE_MS, forceFinal = false, tokenCap = Infinity): Promise<AgentResult> {
  let tokensUsed = tokensUsedSoFar
  let wrappingUp = forceFinal
  let stoppedOnTokens = false
  // The prompt is re-sent in full every turn and only ever grows, so the
  // last turn's prompt size is a sound floor for what the next one costs.
  // Testing `tokensUsed >= tokenCap` ALONE is what let a 150k cap bill 412k
  // in production: by the time the total crossed the line, the turn that
  // crossed it had already been paid for. Projecting one turn ahead stops
  // before the spend, not after it.
  let lastPromptTokens = 0

  for (let turn = 1; turn <= maxTurns; turn++) {
    // Out of time: ask for whatever it has, with no tools offered so the
    // only possible reply is the final JSON.
    // Either ceiling — time or spend — ends gathering the same way: ask
    // for what it has rather than losing the run entirely.
    const overTokens = tokensUsed + lastPromptTokens >= tokenCap
    if (!wrappingUp && (overTokens || Date.now() > deadlineAt - WRAP_UP_RESERVE_MS)) {
      wrappingUp = true
      stoppedOnTokens = overTokens
      console.log(`run ${overTokens ? `hit its ${tokenCap}-token cap` : 'deadline approaching'} after ${turn - 1} turns — asking the agent to finalise now`)
      messages.push({ role: 'user', content: 'You are out of time for this run. Stop gathering and reply NOW with ONLY the final JSON object for what you have gathered so far. Put anything you did not get to in `skipped` with the reason "run budget reached".' })
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // Optional OpenRouter attribution headers — identify this traffic
        // in the org's OpenRouter dashboard. No effect on behavior.
        // ASCII only: an HTTP header value is a ByteString, so the em-dash
        // this codebase uses in prose throws "Cannot convert argument to a
        // ByteString" at fetch time (caught by a live round-trip test).
        'HTTP-Referer': 'https://refold-control-plane.netlify.app',
        'X-Title': 'Refold CS Hub - cs-sync',
      },
      // On a finalising turn the only acceptable reply is the JSON object,
      // so drop the tools and switch the model into JSON mode. Without this
      // a fast model will happily answer a sweep in prose — which is
      // exactly how the first completed live sweep failed (8KB of prose,
      // rejected as "not valid JSON").
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        ...(wrappingUp ? { response_format: { type: 'json_object' } } : { tools: TOOLS }),
        messages,
      }),
    })
    if (!res.ok) throw new Error(`OpenRouter API failed: ${res.status} ${await res.text()}`)
    const body = await res.json()
    lastPromptTokens = body.usage?.prompt_tokens ?? lastPromptTokens
    tokensUsed += (body.usage?.prompt_tokens ?? 0) + (body.usage?.completion_tokens ?? 0)

    const choice = body.choices?.[0]
    if (!choice) throw new Error('OpenRouter returned no choices')
    const message = choice.message as Record<string, unknown>
    const toolCalls = (message.tool_calls ?? []) as ToolCall[]

    // Push the assistant turn back verbatim — it carries the tool_calls the
    // follow-up tool messages have to reference by id.
    messages.push(message)

    if (choice.finish_reason !== 'tool_calls' || toolCalls.length === 0) {
      return { rawText: (message.content as string) ?? null, tokensUsed, turns: turn, stopped: wrappingUp ? (stoppedOnTokens ? 'token_cap' : 'deadline') : 'end_turn', messages }
    }

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        // OpenAI-shape `arguments` is a JSON *string*, and a model can
        // produce a malformed one — a parse failure becomes a tool error
        // the model can see and correct, never a thrown run failure.
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'arguments were not valid JSON' }) })
        continue
      }
      const result = await dispatchTool(call.function.name, args)
      messages.push({ role: 'tool', tool_call_id: call.id, content: serialiseToolResult(result) })
    }
  }

  return { rawText: null, tokensUsed, turns: maxTurns, stopped: 'max_turns', messages }
}

export async function runSkillAgent(syncContextJson: string, stubOutputText?: string, isDiscovery = false, tokenCap = Infinity): Promise<AgentResult> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SKILL_PROMPT },
    { role: 'user', content: syncContextJson },
  ]

  if (STUB_MODE) {
    // Exercise the tool-proxy path for real (through the allowlist) even
    // though the "model" here is fixed, then return the caller-chosen
    // fixture text as if it were the model's final turn.
    await dispatchTool('execute_action', { application_slug: 'fireflies', action_id: 'httprequest', input_payload: { method: 'POST', base_url: 'https://api.fireflies.ai', url_path: '/graphql', body: { query: 'query { transcripts(limit: 1) { id } }' } } })
    return { rawText: stubOutputText ?? null, tokensUsed: 0, turns: 1, stopped: 'end_turn', messages }
  }

  return await runConversation(messages, MAX_TURNS, 0, isDiscovery ? DISCOVERY_MODEL : MODEL, Date.now() + DEADLINE_MS, false, tokenCap)
}

// A repair attempt continues the SAME conversation (the model still has the
// sync context + its own prior answer) rather than starting over — only
// the validation errors are new.
export async function repairOutput(priorMessages: Array<Record<string, unknown>>, tokensUsedSoFar: number, errors: string[], stubOutputText?: string, isDiscovery = false): Promise<AgentResult> {
  if (STUB_MODE) {
    return { rawText: stubOutputText ?? null, tokensUsed: tokensUsedSoFar, turns: 1, stopped: 'end_turn', messages: priorMessages }
  }
  const repairPrompt = `Your previous output failed validation:\n${errors.join('\n')}\n\nReply again with ONLY the corrected JSON object — no prose, no markdown fences.`
  priorMessages.push({ role: 'user', content: repairPrompt })
  // forceFinal: a repair turn gets no tools and JSON mode — it exists to
  // produce the object, not to gather more.
  return await runConversation(priorMessages, REPAIR_TURNS, tokensUsedSoFar, isDiscovery ? DISCOVERY_MODEL : MODEL, Date.now() + DEADLINE_MS, true)
}
