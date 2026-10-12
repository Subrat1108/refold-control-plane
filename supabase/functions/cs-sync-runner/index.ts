// 7.5-pre2 Session 5 — the sync runner. The first real caller of the
// `cs-sync` skill: builds the sync context, runs the skill as an LLM agent
// against the real Refold MCP server (read-only, enforced server-side —
// see allowlist.ts), validates the output, and posts it to `ingest`.
//
// Two ways in, sharing one `processUnit`:
//   - Scoped (a human's Refresh click): normal Supabase session JWT,
//     {orgId, recordType} — runs synchronously, the result is the HTTP
//     response. super_admin + AAL2 required, same as every other
//     privileged write in this codebase.
//   - Queued (pg_cron's dispatch_sync_queue(), via pg_net): the project's
//     own service-role key as the bearer token — Supabase's platform-level
//     JWT check (verify_jwt stays at its default `true`) already verifies
//     the signature before this code runs; reading the already-trusted
//     `role` claim afterward is the same trust model `jwtAal` already uses
//     elsewhere in this codebase. {queue_id} — processes exactly one
//     sync_queue row and writes the result back to it.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { TARGET_TABLE } from '../_shared/dedupe.ts'
import { buildSyncContext, buildDiscoveryContext } from './context.ts'
import { runSkillAgent, repairOutput } from './llm.ts'
import { validateOutput } from './validate.ts'
import { getConnectedApps, RECORD_TYPE_CONNECTORS, READ_BLOCKED_CONNECTORS } from './refold.ts'
import { STUB_MODEL_OUTPUT_DISCOVERY, STUB_MODEL_OUTPUT_INVALID, STUB_MODEL_OUTPUT_VALID } from './fixtures.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CS_HUB_INGEST_TOKEN = Deno.env.get('CS_HUB_INGEST_TOKEN') ?? ''
const STUB_MODE = Deno.env.get('CS_SYNC_STUB_MODE') === 'true'
const INGEST_BATCH_SIZE = 200
// The discovery sweep (Session 6) is a sync MODE, not a record type — it
// has no target table of its own, and its watermark/lock live on the
// internal Refold org's otherwise-unused slot in sync_state.
const DISCOVERY = 'discovery'
const INTERNAL_ORG_ID = '00000000-0000-0000-0000-000000000001'
const DISCOVERY_DEFAULT_WINDOW_DAYS = 7
// A unit with no watermark yet used to look back 36500 days — the agent
// read that as "search since 1926" and spent its whole budget paging
// backwards through years of history, on every first run. 30 days is a
// sane cold start; the watermark takes over from the second run on.
const FIRST_RUN_LOOKBACK_DAYS = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

// Stub mode never accepts arbitrary caller-supplied "model output" — only a
// named fixture key, looked up server-side, so a stray x-stub-output header
// can't be used to inject content even when CS_SYNC_STUB_MODE happens to be
// left on somewhere it shouldn't be. Three scenarios, one header:
//   'valid'                 — first try is valid; repair is never triggered.
//   'invalid-then-repaired' — first try fails validation; the repair
//                             attempt "fixes" it, exercising that path.
//   'invalid-twice'         — fails validation both times, exercising the
//                             final-failure path (recorded `failed`, never
//                             posted to ingest).
function resolveStubOutput(req: Request): { initial?: string; repair?: string } {
  if (!STUB_MODE) return {}
  const key = req.headers.get('x-stub-output')
  const valid = JSON.stringify(STUB_MODEL_OUTPUT_VALID)
  const invalid = JSON.stringify(STUB_MODEL_OUTPUT_INVALID)
  if (key === 'invalid-then-repaired') return { initial: invalid, repair: valid }
  if (key === 'invalid-twice') return { initial: invalid, repair: invalid }
  if (key === 'discovery') {
    const discovery = JSON.stringify(STUB_MODEL_OUTPUT_DISCOVERY)
    return { initial: discovery, repair: discovery }
  }
  return { initial: valid, repair: valid }
}

// Models routinely wrap JSON in ```json fences or add a sentence before it,
// and a truncated reply leaves a half-object. A bare JSON.parse turns all
// three into the same opaque "schema-invalid output" — which is exactly how
// the first live sweep failed. Strip fences, then fall back to the outermost
// {...}, then give up honestly.
function extractJson(text: string | null): unknown | null {
  if (!text) return null
  let t = text.trim()
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fenced) t = fenced[1].trim()
  try {
    return JSON.parse(t)
  } catch { /* try the brace-slice below */ }
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(t.slice(first, last + 1))
    } catch { /* genuinely unparseable — most often truncated output */ }
  }
  return null
}

// Diagnostics with no content: length and shape only, never the text
// itself (it carries customer data).
function describeOutput(text: string | null): string {
  if (!text) return 'empty'
  const t = text.trim()
  return `len=${t.length} starts=${JSON.stringify(t.slice(0, 1))} ends=${JSON.stringify(t.slice(-1))}`
}

export interface ProcessResult {
  status: 'success' | 'partial' | 'failed' | 'locked'
  counts?: Record<string, number>
  skippedConnectors?: string[]
  error?: string
  runId?: string
  skippedCount?: number
  truncated?: boolean
}

async function postToIngest(records: unknown[], runId: string, mode: string, triggeredBy: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (let i = 0; i < records.length; i += INGEST_BATCH_SIZE) {
    const batch = records.slice(i, i + INGEST_BATCH_SIZE)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CS_HUB_INGEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ run: { id: runId, mode, source: 'agent', triggered_by: triggeredBy }, records: batch }),
    })
    if (!res.ok) throw new Error(`ingest POST failed: ${res.status}`)
    const body = await res.json()
    for (const r of body.results ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1
  }
  return counts
}

export async function processUnit(svc: SupabaseClient, orgId: string, recordType: string, mode: 'scoped' | 'daily' | 'backfill', triggeredBy: string, stub?: { initial?: string; repair?: string }, windowDays?: number): Promise<ProcessResult> {
  const { data: settings } = await svc.from('sync_settings').select('*').limit(1).single()
  if (settings?.kill_switch) return { status: 'failed', error: 'kill switch is on' }

  const { data: locked } = await svc.rpc('try_lock_sync_unit', { p_org_id: orgId, p_record_type: recordType })
  if (!locked) return { status: 'locked' }

  const runId = crypto.randomUUID()
  await svc.from('sync_runs').insert({ id: runId, mode, triggered_by: triggeredBy, scope: { account: orgId, record_type: recordType }, status: 'running' })

  const finish = async (status: 'success' | 'partial' | 'failed', extra: { counts?: Record<string, number>; error?: string; skippedConnectors?: string[]; tokensUsed?: number; skippedItems?: unknown[]; coveredThrough?: string | null }) => {
    await svc.rpc('finish_sync_unit', {
      p_org_id: orgId,
      p_record_type: recordType,
      p_status: status,
      p_error: extra.error ?? null,
      // How far this run actually got. On a truncated run this is what
      // makes the next one resume instead of re-reading or skipping.
      p_covered_through: extra.coveredThrough ?? null,
    })
    await svc.from('sync_runs').update({
      status,
      finished_at: new Date().toISOString(),
      counts: extra.counts ?? null,
      tokens_used: extra.tokensUsed ?? null,
      skipped_connectors: extra.skippedConnectors ?? null,
      // What the agent looked at and chose not to report. For a sweep this
      // is most of the answer — without it, "nothing to report" and "the
      // agent never managed to look" are indistinguishable.
      skipped_items: extra.skippedItems ?? null,
    }).eq('id', runId)
    if (extra.skippedConnectors?.length) {
      await svc.from('audit_log').insert({
        action: 'sync_connectors_skipped',
        record_table: 'sync_runs',
        record_id: runId,
        org_id: orgId,
        on_behalf_of: triggeredBy,
        metadata: { run_id: runId, skipped: extra.skippedConnectors, reason: 'not connected for this linked account', affected_record_types: [recordType] },
      })
    }
  }

  try {
    const { data: stateRow } = await svc.from('sync_state').select('last_synced_at').eq('org_id', orgId).eq('record_type', recordType).maybeSingle()
    // An explicit window (the "Scan for unknown accounts" button) wins over
    // the watermark — asking for "the last 7 days" should mean that even on
    // a unit that has already run. Otherwise: watermark, else the mode's
    // default lookback (a sweep defaults to 7 days rather than all-time,
    // since listing every meeting ever would blow the turn budget).
    const defaultDays = windowDays ?? (mode === 'backfill' ? 90 : recordType === DISCOVERY ? DISCOVERY_DEFAULT_WINDOW_DAYS : FIRST_RUN_LOOKBACK_DAYS)
    const since = windowDays
      ? new Date(Date.now() - windowDays * 86_400_000).toISOString()
      : stateRow?.last_synced_at ?? new Date(Date.now() - defaultDays * 86_400_000).toISOString()

    const neededConnectors = RECORD_TYPE_CONNECTORS[recordType] ?? []
    const connectedApps = await getConnectedApps()
    const skippedConnectors = neededConnectors.filter(
      (slug) => slug in READ_BLOCKED_CONNECTORS || !connectedApps.some((a) => a.slug === slug && a.connected),
    )

    // A discovery sweep is not tied to one account, so it gets the
    // roster-wide context instead of the single-unit one. Everything else
    // in this function — lock, watermark, validation, ingest POST, run
    // recording — is identical for both.
    const contextWithSkips = recordType === DISCOVERY
      ? await buildDiscoveryContext({ svc, mode, runId, triggeredBy, since, unavailableConnectors: skippedConnectors })
      : { ...(await buildSyncContext({ svc, orgId, recordType, mode, runId, triggeredBy, since })), unavailable_connectors_this_run: skippedConnectors }

    // The cost ceiling is a real limit now, not a decorative setting. One
    // live run burned 653,835 tokens on a single unit against a 150,000
    // setting that nothing read.
    const tokenCap = Number(settings?.max_tokens_per_unit ?? 150000)
    let agent = await runSkillAgent(JSON.stringify(contextWithSkips), stub?.initial, recordType === DISCOVERY, tokenCap)
    if (agent.stopped === 'deadline') console.log(`run ${runId}: finished under the time budget — results may be partial`)
    if (agent.stopped === 'max_turns' || !agent.rawText) {
      await finish('failed', { error: 'agent exceeded turn budget without a final answer', skippedConnectors, tokensUsed: agent.tokensUsed })
      return { status: 'failed', error: 'agent exceeded turn budget', skippedConnectors, runId }
    }

    let parsed = extractJson(agent.rawText)
    let validation = parsed ? validateOutput(parsed) : { valid: false, errors: [`final output was not valid JSON (${describeOutput(agent.rawText)})`] }

    if (!validation.valid) {
      console.log(`run ${runId}: first output rejected (${validation.errors.slice(0, 3).join('; ')}) — attempting one repair`)
      agent = await repairOutput(agent.messages, agent.tokensUsed, validation.errors, stub?.repair, recordType === DISCOVERY)
      parsed = extractJson(agent.rawText)
      validation = parsed ? validateOutput(parsed) : { valid: false, errors: [`final output was not valid JSON after repair (${describeOutput(agent.rawText)})`] }
    }

    if (!validation.valid) {
      await finish('failed', { error: `schema-invalid output: ${validation.errors.join('; ')}`, skippedConnectors, tokensUsed: agent.tokensUsed })
      return { status: 'failed', error: 'schema-invalid output', skippedConnectors, runId }
    }

    const records = (parsed as { records: unknown[] }).records
    const skippedItems = ((parsed as { skipped?: unknown[] }).skipped ?? []).slice(0, 200)
    console.log(`run ${runId} ${recordType}: ${agent.turns} turns, ${agent.tokensUsed} tokens, ${records.length} records, ${skippedItems.length} skipped`)

    const counts = records.length ? await postToIngest(records, runId, mode, triggeredBy) : {}

    // A run that stopped early must NOT look complete: `success` is what
    // advances the watermark to now(), which would silently drop whatever
    // it never reached. Truncation shows up two ways — the loop ran out of
    // time, or the agent itself said it hit the item budget.
    const hitBudget = skippedItems.some((s) => /budget/i.test(JSON.stringify((s as Record<string, unknown>)?.reason ?? '')))
    const truncated = agent.stopped === 'deadline' || agent.stopped === 'token_cap' || hitBudget
    const coveredThrough = typeof (parsed as { covered_through?: unknown }).covered_through === 'string'
      ? (parsed as { covered_through: string }).covered_through
      : null
    const status = truncated ? 'partial' : counts.rejected_invalid ? 'partial' : 'success'
    if (truncated) {
      console.log(`run ${runId}: PARTIAL (${agent.stopped === 'deadline' ? 'out of time' : agent.stopped === 'token_cap' ? 'token cap' : 'item budget'}) covered_through=${coveredThrough ?? 'unreported — watermark held'}`)
    }

    await finish(status, { counts, skippedConnectors, tokensUsed: agent.tokensUsed, skippedItems, coveredThrough })
    return { status, counts, skippedConnectors, runId, skippedCount: skippedItems.length, truncated }
  } catch (err) {
    await finish('failed', { error: String(err) })
    return { status: 'failed', error: String(err), runId }
  }
}

async function handleScoped(req: Request, body: { orgId?: string; recordType?: string; windowDays?: number }): Promise<Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization bearer token' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Invalid or expired session' }, 401)

  const { data: prof } = await caller.from('profiles').select('account_type').eq('id', userData.user.id).single()
  if (!prof || prof.account_type !== 'super_admin') return json({ error: 'Forbidden: super_admin required' }, 403)
  const payload = jwtPayload(token)
  if ((payload.aal as string) !== 'aal2') return json({ error: 'Forbidden: AAL2 (MFA) required' }, 403)

  // `discovery` is a mode, not a record type, so it has no TARGET_TABLE
  // entry and carries no orgId — it runs against the internal org's slot.
  const isDiscovery = body.recordType === DISCOVERY
  if (!isDiscovery && (!body.orgId || !body.recordType || !TARGET_TABLE[body.recordType])) {
    return json({ error: 'orgId and a valid recordType are required' }, 400)
  }

  const windowDays = typeof body.windowDays === 'number' && body.windowDays > 0 ? Math.min(body.windowDays, 365) : undefined
  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const result = await processUnit(
    service,
    isDiscovery ? INTERNAL_ORG_ID : body.orgId!,
    isDiscovery ? DISCOVERY : body.recordType!,
    'scoped',
    userData.user.id,
    resolveStubOutput(req),
    isDiscovery ? (windowDays ?? DISCOVERY_DEFAULT_WINDOW_DAYS) : windowDays,
  )
  return json(result, result.status === 'failed' ? 500 : 200)
}

async function handleQueued(req: Request, body: { queue_id?: string }): Promise<Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const payload = jwtPayload(token)

  // Two callers are allowed here. The scheduled dispatcher presents the
  // service-role key; a human driving "Run sync now" from the browser
  // presents their own session, and the page works through the queue one
  // unit at a time. Allowing the second is what lets a full manual sync
  // work with NO Vault secret set up at all.
  let triggeredBy = 'system'
  if (payload.role !== 'service_role') {
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await caller.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Invalid or expired session' }, 401)
    const { data: prof } = await caller.from('profiles').select('account_type').eq('id', userData.user.id).single()
    if (!prof || prof.account_type !== 'super_admin') return json({ error: 'Forbidden: super_admin required' }, 403)
    if ((payload.aal as string) !== 'aal2') return json({ error: 'Forbidden: AAL2 (MFA) required' }, 403)
    triggeredBy = userData.user.id
  }
  if (!body.queue_id) return json({ error: 'queue_id is required' }, 400)

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: item } = await service.from('sync_queue').select('*').eq('id', body.queue_id).maybeSingle()
  if (!item) return json({ error: 'queue item not found' }, 404)

  const result = await processUnit(service, item.org_id, item.record_type, item.mode, triggeredBy, resolveStubOutput(req))

  await service.from('sync_queue').update({
    status: result.status === 'success' || result.status === 'partial' ? 'done' : 'error',
    finished_at: new Date().toISOString(),
    error: result.error ?? (result.status === 'locked' ? 'unit already locked — another run in progress' : null),
    run_id: result.runId ?? null,
  }).eq('id', item.id)

  return json(result)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.queue_id === 'string') return handleQueued(req, body as { queue_id: string })
  return handleScoped(req, body as { orgId?: string; recordType?: string; windowDays?: number })
})
