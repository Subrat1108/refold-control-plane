// 7.5-pre2 Session 5 — runs skill.md as an LLM agent via a plain `fetch`
// against the Anthropic Messages API (no SDK — matching ingest/
// provisioning's existing no-extra-deps convention). The runner PROXIES
// every tool call itself (resolveActions/executeAction from refold.ts,
// gated by allowlist.ts) rather than handing the model Anthropic's built-in
// MCP connector — that connector would call EXECUTE_ACTION directly, with
// no server-side chance to reject a non-read-only call first.

import { checkExecuteAction, type ExecuteActionInput } from './allowlist.ts'
import { executeActionDeterministic, resolveActions } from './refold.ts'
import { SKILL_PROMPT } from './skill-prompt.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
// Your instruction named `claude-sonnet-5-5`, which isn't a real model id —
// defaulting to `claude-sonnet-5` (current ids: claude-sonnet-5/-opus-5/
// -fable-5, claude-haiku-4-5-20251001). Fully overridable either way.
const MODEL = Deno.env.get('CS_SYNC_MODEL') || 'claude-sonnet-5'
const STUB_MODE = Deno.env.get('CS_SYNC_STUB_MODE') === 'true'
const MAX_TURNS = 12
const REPAIR_TURNS = 3

const TOOLS = [
  {
    name: 'resolve_actions',
    description: 'Resolve one or more plain-English capability queries into real Refold action ids. Read-only.',
    input_schema: {
      type: 'object',
      properties: { integration_query: { type: 'array', items: { type: 'string' } } },
      required: ['integration_query'],
    },
  },
  {
    name: 'execute_action',
    description: 'Run one resolved Refold action. Every connected app is read-only for this skill — a write will be rejected before it reaches Refold.',
    input_schema: {
      type: 'object',
      properties: {
        application_slug: { type: 'string' },
        action_id: { type: 'string' },
        input_payload: { type: 'object' },
      },
      required: ['application_slug', 'action_id', 'input_payload'],
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
  messages: Array<{ role: string; content: unknown }>
}

async function runConversation(messages: Array<{ role: string; content: unknown }>, maxTurns: number, tokensUsedSoFar: number): Promise<AgentResult> {
  let tokensUsed = tokensUsedSoFar

  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SKILL_PROMPT, tools: TOOLS, messages }),
    })
    if (!res.ok) throw new Error(`Anthropic API failed: ${res.status} ${await res.text()}`)
    const body = await res.json()
    tokensUsed += (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0)

    const content = body.content as Array<Record<string, unknown>>
    if (body.stop_reason !== 'tool_use') {
      const textBlock = content.find((c) => c.type === 'text')
      messages.push({ role: 'assistant', content })
      return { rawText: (textBlock?.text as string) ?? null, tokensUsed, turns: turn, stopped: 'end_turn', messages }
    }

    messages.push({ role: 'assistant', content })
    const toolResults = []
    for (const block of content) {
      if (block.type !== 'tool_use') continue
      const result = await dispatchTool(block.name as string, block.input as Record<string, unknown>)
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return { rawText: null, tokensUsed, turns: maxTurns, stopped: 'max_turns', messages }
}

export async function runSkillAgent(syncContextJson: string, stubOutputText?: string): Promise<AgentResult> {
  const messages: Array<{ role: string; content: unknown }> = [{ role: 'user', content: syncContextJson }]

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
export async function repairOutput(priorMessages: Array<{ role: string; content: unknown }>, tokensUsedSoFar: number, errors: string[], stubOutputText?: string): Promise<AgentResult> {
  if (STUB_MODE) {
    return { rawText: stubOutputText ?? null, tokensUsed: tokensUsedSoFar, turns: 1, stopped: 'end_turn', messages: priorMessages }
  }
  const repairPrompt = `Your previous output failed validation:\n${errors.join('\n')}\n\nReply again with ONLY the corrected JSON object — no prose.`
  priorMessages.push({ role: 'user', content: repairPrompt })
  return await runConversation(priorMessages, REPAIR_TURNS, tokensUsedSoFar)
}
