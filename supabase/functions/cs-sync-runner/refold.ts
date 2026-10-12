// 7.5-pre2 Session 5 — talks to the real Refold API (docs/refold-mcp.md).
// Two auth shapes, used for two different things: a cached session token
// (Bearer) for RESOLVE_ACTIONS — the one agent-mode-only MCP tool with no
// deterministic equivalent — and the org API key directly (x-api-key +
// linked_account_id, no session token) for the deterministic REST execute
// endpoint, once a call has been resolved AND validated (allowlist.ts).
//
// CS_SYNC_STUB_MODE short-circuits every call in here to a synthetic
// fixture (fixtures.ts) — set only for local/CI testing, never on cloud.

import { STUB_CONNECTED_APPS, STUB_SESSION_TOKEN, stubExecuteAction, stubResolveActions } from './fixtures.ts'

const REFOLD_BASE = 'https://app.refold.ai'
const STUB_MODE = Deno.env.get('CS_SYNC_STUB_MODE') === 'true'

const API_KEY = Deno.env.get('REFOLD_API_KEY') ?? ''
const LINKED_ACCOUNT_ID = Deno.env.get('REFOLD_LINKED_ACCOUNT_ID') ?? ''
const MCP_SERVER_ID = Deno.env.get('REFOLD_MCP_SERVER_ID') ?? ''

interface SessionToken {
  token: string
  expiresAt: number // epoch ms
}

// Module-level cache — one Edge Function instance, one org, no need for a
// keyed cache. Cold starts just re-fetch; that's fine, it's a 7-day token.
let cachedToken: SessionToken | null = null

async function fetchSessionToken(forceRefresh: boolean): Promise<SessionToken> {
  if (STUB_MODE) {
    return { token: STUB_SESSION_TOKEN.token, expiresAt: Date.now() + STUB_SESSION_TOKEN.expires_in * 1000 }
  }
  const url = `${REFOLD_BASE}/api/v2/public/session-token${forceRefresh ? '?force_refresh=true' : ''}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ linked_account_id: LINKED_ACCOUNT_ID }),
  })
  if (!res.ok) throw new Error(`session-token request failed: ${res.status}`)
  const body = await res.json()
  return { token: body.token as string, expiresAt: Date.now() + (body.expires_in as number) * 1000 }
}

async function getSessionToken(forceRefresh = false): Promise<string> {
  const safetyMarginMs = 60_000
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - safetyMarginMs > Date.now()) {
    return cachedToken.token
  }
  cachedToken = await fetchSessionToken(forceRefresh)
  return cachedToken.token
}

// JSON-RPC 2.0 over streamable HTTP — the response is one `text/event-stream`
// chunk (`data: {...}`), not plain JSON (docs/refold-mcp.md).
async function mcpCall(method: string, params: Record<string, unknown>, retrying = false): Promise<Record<string, unknown>> {
  const token = await getSessionToken()
  const res = await fetch(`${REFOLD_BASE}/mcp/v1/${MCP_SERVER_ID}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      // Required on tools/call (not initialize/tools/list) — omitting it
      // returns "Missing auth context" even though the token itself is valid.
      linked_account_id: LINKED_ACCOUNT_ID,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
  })

  if (res.status === 401 && !retrying) {
    cachedToken = null
    await getSessionToken(true)
    return mcpCall(method, params, true)
  }
  if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status}`)

  const raw = await res.text()
  const dataLine = raw.split('\n').find((l) => l.startsWith('data: '))
  const jsonText = dataLine ? dataLine.slice('data: '.length) : raw
  return JSON.parse(jsonText)
}

export async function resolveActions(queries: string[]): Promise<unknown> {
  if (STUB_MODE) return stubResolveActions(queries)
  const result = await mcpCall('tools/call', { name: 'RESOLVE_ACTIONS', arguments: { integration_query: queries } })
  return result.result ?? result
}

// The deterministic REST path (docs/refold-mcp.md "Deterministic option") —
// x-api-key + linked_account_id only, no session token, no MCP round-trip.
// Always returns HTTP 200 even on an underlying app failure; callers must
// check `node_status` themselves.
export async function executeActionDeterministic(applicationSlug: string, actionId: string, inputPayload: Record<string, unknown>): Promise<{ node_status: string; [k: string]: unknown }> {
  if (STUB_MODE) return stubExecuteAction(applicationSlug, actionId)
  const res = await fetch(`${REFOLD_BASE}/api/v2/integration-schema/${applicationSlug}/actions/${actionId}/execute`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, linked_account_id: LINKED_ACCOUNT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify(inputPayload),
  })
  return await res.json()
}

// Connected is not the same as usable. Slack reports `connected: true`
// because the app IS linked — but the connection is bot-token based, so
// every channel read comes back `not_in_channel` and search comes back
// `not_allowed_token_type` (re-verified 2026-10-12 against real channel
// ids). Without this, a sweep spends its whole turn budget listing Slack
// channels it can never read and never reaches the connectors that work.
//
// REMOVE THE SLACK ENTRY once Slack is re-authorized as a user — see
// docs/refold-mcp.md's Slack connector addendum for what that needs
// (and note `search_messages` additionally wants a `search:read` scope).
export const READ_BLOCKED_CONNECTORS: Record<string, string> = {
  slack: 'connected as a bot — channel reads return not_in_channel until Slack is re-authorized as a user',
}

export interface ConnectedApp {
  slug: string
  connected: boolean
}

export async function getConnectedApps(): Promise<ConnectedApp[]> {
  if (STUB_MODE) return STUB_CONNECTED_APPS
  const res = await fetch(`${REFOLD_BASE}/api/v2/public/application`, {
    headers: { 'x-api-key': API_KEY, linked_account_id: LINKED_ACCOUNT_ID },
  })
  if (!res.ok) throw new Error(`application list failed: ${res.status}`)
  const body = await res.json()
  const apps = (body.data ?? body) as Array<Record<string, unknown>>
  return apps.map((a) => ({ slug: String(a.slug ?? a.application_slug ?? ''), connected: Boolean(a.connected) }))
}

// Which connectors a record type needs, so the connector check (processUnit
// step 9) can tell the model up front which ones are unavailable this run
// instead of letting it discover not_in_channel/"Application Authentication
// not found" through failed tool calls.
export const RECORD_TYPE_CONNECTORS: Record<string, string[]> = {
  ticket: ['zendesk'],
  escalation: ['slack', 'gmail'],
  risk: ['slack', 'gmail'],
  milestone: ['slack', 'gmail'],
  accomplishment: ['slack', 'gmail'],
  health: ['slack', 'gmail'],
  action_item: ['slack', 'gmail', 'fireflies'],
  engagement: ['fireflies'],
  metric: [],
  // The discovery sweep (Session 6) reaches for everything it can — the
  // run's connector-skip audit row then names whichever are down, which is
  // how a sweep honestly reports "I could only see part of the picture."
  discovery: ['fireflies', 'slack', 'gmail', 'zendesk'],
}
