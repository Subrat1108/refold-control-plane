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
import { executeActionDeterministic, resolveActions } from './refold.ts'
import { SKILL_PROMPT } from './skill-prompt.ts'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? ''
// OpenRouter model ids are namespaced `provider/model` — a bare
// `claude-sonnet-5` is not a valid id there. Confirmed available against
// the live /api/v1/models catalog before setting this default.
const MODEL = Deno.env.get('CS_SYNC_MODEL') || 'anthropic/claude-sonnet-5'
const STUB_MODE = Deno.env.get('CS_SYNC_STUB_MODE') === 'true'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_TURNS = 12
const REPAIR_TURNS = 3

// OpenAI function-calling shape (OpenRouter normalizes this to each
// provider's native tool format on the way out).
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'resolve_actions',
      description: 'Resolve one or more plain-English capability queries into real Refold action ids. Read-only.',
      parameters: {
        type: 'object',
        properties: { integration_query: { type: 'array', items: { type: 'string' } } },
        required: ['integration_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_action',
      description: 'Run one resolved Refold action. Every connected app is read-only for this skill — a write will be rejected before it reaches Refold.',
      parameters: {
        type: 'object',
        properties: {
          application_slug: { type: 'string' },
          action_id: { type: 'string' },
          input_payload: { type: 'object' },
        },
        required: ['application_slug', 'action_id', 'input_payload'],
      },
    },
  },
]

async function dispatchTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === 'resolve_actions') {
    return await resolveActions((input.integration_query as string[]) ?? [])
  }
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
  stopped: 'end_turn' | 'max_turns'
  messages: Array<Record<string, unknown>>
}

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

async function runConversation(messages: Array<Record<string, unknown>>, maxTurns: number, tokensUsedSoFar: number): Promise<AgentResult> {
  let tokensUsed = tokensUsedSoFar

  for (let turn = 1; turn <= maxTurns; turn++) {
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
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, tools: TOOLS, messages }),
    })
    if (!res.ok) throw new Error(`OpenRouter API failed: ${res.status} ${await res.text()}`)
    const body = await res.json()
    tokensUsed += (body.usage?.prompt_tokens ?? 0) + (body.usage?.completion_tokens ?? 0)

    const choice = body.choices?.[0]
    if (!choice) throw new Error('OpenRouter returned no choices')
    const message = choice.message as Record<string, unknown>
    const toolCalls = (message.tool_calls ?? []) as ToolCall[]

    // Push the assistant turn back verbatim — it carries the tool_calls the
    // follow-up tool messages have to reference by id.
    messages.push(message)

    if (choice.finish_reason !== 'tool_calls' || toolCalls.length === 0) {
      return { rawText: (message.content as string) ?? null, tokensUsed, turns: turn, stopped: 'end_turn', messages }
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
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }

  return { rawText: null, tokensUsed, turns: maxTurns, stopped: 'max_turns', messages }
}

export async function runSkillAgent(syncContextJson: string, stubOutputText?: string): Promise<AgentResult> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SKILL_PROMPT },
    { role: 'user', content: syncContextJson },
  ]

  if (STUB_MODE) {
    // Exercise the tool-proxy path for real (through the allowlist) even
    // though the "model" here is fixed, then return the caller-chosen
    // fixture text as if it were the model's final turn.
    await dispatchTool('resolve_actions', { integration_query: ['list fireflies transcripts by date range'] })
    await dispatchTool('execute_action', { application_slug: 'fireflies', action_id: 'httprequest', input_payload: { method: 'POST', base_url: 'https://api.fireflies.ai', url_path: '/graphql', body: { query: 'query { transcripts(limit: 1) { id } }' } } })
    return { rawText: stubOutputText ?? null, tokensUsed: 0, turns: 1, stopped: 'end_turn', messages }
  }

  return await runConversation(messages, MAX_TURNS, 0)
}

// A repair attempt continues the SAME conversation (the model still has the
// sync context + its own prior answer) rather than starting over — only
// the validation errors are new.
export async function repairOutput(priorMessages: Array<Record<string, unknown>>, tokensUsedSoFar: number, errors: string[], stubOutputText?: string): Promise<AgentResult> {
  if (STUB_MODE) {
    return { rawText: stubOutputText ?? null, tokensUsed: tokensUsedSoFar, turns: 1, stopped: 'end_turn', messages: priorMessages }
  }
  const repairPrompt = `Your previous output failed validation:\n${errors.join('\n')}\n\nReply again with ONLY the corrected JSON object — no prose.`
  priorMessages.push({ role: 'user', content: repairPrompt })
  return await runConversation(priorMessages, REPAIR_TURNS, tokensUsedSoFar)
}
