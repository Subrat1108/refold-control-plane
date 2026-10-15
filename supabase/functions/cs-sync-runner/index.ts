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
import { STUB_MODEL_OUTPUT_DISCOVERY, STUB_MODEL_OUTPUT_EMPTY, STUB_MODEL_OUTPUT_INVALID, STUB_MODEL_OUTPUT_VALID } from './fixtures.ts'

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
// backwards through years of history, on every first run. 7 days is the
// cold-start default, matching the sweep; the watermark takes over from
// the second run on, and the Sync Status page can override it per run.
const FIRST_RUN_LOOKBACK_DAYS = 7
// The nightly job covers ONE day, always. It used to fall back to the
// watermark and then to 7 days -- and because 41 of 41 units ended
// `partial`, which deliberately holds the watermark, every "daily" run was
// re-scanning the same 7-day window at ~185k tokens a unit. A routine
// nightly pass should cost a day, not a week. Catching up on a gap is what
// the manual trigger and its day picker are for.
const DAILY_WINDOW_DAYS = 1

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
  if (key === 'empty') {
    const empty = JSON.stringify(STUB_MODEL_OUTPUT_EMPTY)
    return { initial: empty, repair: empty }
  }
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
  // The unit was skipped before any model call because the account has no
  // sources mapped. Distinct from a truncated run: nothing was examined.
  noSources?: boolean
}

// How many consecutive empty nightly cycles before an account is surfaced
// for a human to look at. The owner's number.
const EMPTY_NIGHTS_BEFORE_FLAG = 30

// Record what this unit found and, at the threshold, surface the account.
//
// Counting happens once per NIGHT, not once per unit (the SQL function owns
// that rule via last_empty_date), so eight record types scanned on the same
// evening are one session, not eight.
//
// The flag is filed as a normal `health` PROPOSAL rather than written
// straight onto organizations.health. Same visible outcome once approved,
// but it cannot silently overwrite a rating a human set, and the reason is
// on screen before anyone accepts it -- "we could not find any data" and
// "this customer is in trouble" are not the same claim, so a person decides
// which one this is.
async function trackScanOutcome(
  svc: SupabaseClient,
  orgId: string,
  found: boolean,
  runId: string,
  mode: string,
  triggeredBy: string,
): Promise<void> {
  try {
    const { data: nights, error } = await svc.rpc('record_account_scan_result', { p_org_id: orgId, p_found: found })
    if (error) {
      console.log(`run ${runId}: could not record scan outcome — ${error.message}`)
      return
    }
    const count = Number(nights ?? 0)
    if (found || count < EMPTY_NIGHTS_BEFORE_FLAG) return

    // Two plain reads rather than a PostgREST embed: a new FK to
    // organizations is exactly what makes an embed elsewhere go ambiguous
    // (D-068), and nothing here needs the join.
    const { data: flagRow } = await svc.from('account_sync_health').select('flagged_at').eq('org_id', orgId).maybeSingle()
    // Already filed once — the threshold is a trigger, not a nightly alarm.
    if (flagRow?.flagged_at) return
    const { data: org } = await svc.from('organizations').select('health').eq('id', orgId).maybeSingle()
    if (org?.health === 'risk') {
      // Already at risk for some other reason; just stop re-checking.
      await svc.rpc('mark_account_sync_flagged', { p_org_id: orgId })
      return
    }

    console.log(`run ${runId}: account ${orgId} has ${count} consecutive empty nights — filing a health proposal for review`)
    await postToIngest([{
      record_type: 'health',
      operation: 'update',
      account: orgId,
      // Stable, so re-filing dedupes against the same proposal instead of
      // stacking duplicates in the inbox.
      source_ref: `cs-hub:sync-no-data:${orgId}`,
      data: {
        health: 'risk',
        health_reason: `No data found in any connected source for ${count} consecutive nightly syncs. The account may be mis-entered or renamed, may have no Slack/email/meeting presence to sync, or may genuinely be inactive - worth a look either way.`,
      },
      confidence: 0.5,
    }], runId, mode, triggeredBy)
    await svc.rpc('mark_account_sync_flagged', { p_org_id: orgId })
  } catch (err) {
    // Never let bookkeeping fail a run that otherwise succeeded.
    console.log(`run ${runId}: scan-outcome tracking failed — ${String(err)}`)
  }
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
  // Paused is not failed. Returning `failed` here made the caller write the
  // queue row as `error`, which takes it out of `queued` for good — so
  // pausing the system destroyed 30 queued units in one go. `locked` is the
  // existing "cannot run right now, keep it queued" signal; reuse it.
  if (settings?.kill_switch) return { status: 'locked', error: 'the sync is paused (kill switch is on) — this unit stays queued', runId: undefined }

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
    // An explicit window (the manual trigger's day picker) always wins —
    // asking for "the last 7 days" should mean that even on a unit that has
    // already run.
    //
    // With no explicit window the mode decides:
    //   daily    — exactly ONE day, never more. Not the watermark: a
    //              `partial` run holds the watermark by design, so leaning
    //              on it meant the nightly re-scanned a full week every
    //              night. A routine pass costs a day's worth or it is not
    //              routine. (A recent watermark is still honoured when it
    //              is NEWER than a day, which only makes the scan smaller.)
    //   backfill — 90 days, deliberately wide.
    //   scoped   — the watermark, else a first-run lookback.
    let since: string
    if (windowDays) {
      since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
    } else if (mode === 'daily') {
      const oneDayAgo = new Date(Date.now() - DAILY_WINDOW_DAYS * 86_400_000).toISOString()
      const mark = stateRow?.last_synced_at as string | undefined
      since = mark && mark > oneDayAgo ? mark : oneDayAgo
    } else {
      const defaultDays = mode === 'backfill' ? 90 : recordType === DISCOVERY ? DISCOVERY_DEFAULT_WINDOW_DAYS : FIRST_RUN_LOOKBACK_DAYS
      since = stateRow?.last_synced_at ?? new Date(Date.now() - defaultDays * 86_400_000).toISOString()
    }
    console.log(`run ${runId} ${recordType}: mode=${mode} since=${since}${windowDays ? ` (explicit ${windowDays}d)` : mode === 'daily' ? ' (daily = 1 day)' : ''}`)

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
    //
    // An account that found nothing on its last nightly cycle is scanned on
    // a much smaller probe budget: confirming there is nothing there should
    // cost the price of confirming it, not the price of an exhaustive
    // search. One mis-typed account used to cost a full budget every night
    // forever. A genuinely quiet customer is still scanned every night, just
    // cheaply -- and goes straight back to the full budget the moment it
    // produces a single record. A sweep is never probed: it is the thing
    // that finds the accounts in the first place.
    const fullCap = Number(settings?.max_tokens_per_unit ?? 150000)
    let tokenCap = fullCap
    if (recordType !== DISCOVERY) {
      const { data: health } = await svc
        .from('account_sync_health')
        .select('consecutive_empty_nights, last_found_at')
        .eq('org_id', orgId)
        .maybeSingle()

      // An account with no `account_sources` has nothing mapping it to a
      // Slack channel, an email domain or a Zendesk org -- there is no
      // identifier to match on, so the agent can only search everything and
      // report finding nothing. That is not a cheap failure: 18 such units
      // cost 1.72M tokens in one day and produced zero records. Skip before
      // spending anything.
      //
      // This is only safe because the discovery sweep no longer defers to
      // an account that has no aliases (see refold-skill.md rule 1b): it
      // emits those as "Account match needed" instead, which is how the
      // account gets its first source. Without that rule this skip would be
      // self-sealing -- no sources, so never scanned; never scanned, so
      // never gains sources.
      const { count: sourceCount } = await svc
        .from('account_sources')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
      if (!sourceCount && !health?.last_found_at) {
        console.log(`run ${runId}: account ${orgId} has no account_sources and has never produced a record — skipping before spending any tokens (the discovery sweep covers it instead)`)
        // 'partial', not 'success': the window was never examined, and
        // finish_sync_unit holds the watermark on partial — so once sources
        // exist, the next run still covers this period rather than skipping
        // over it as already-done.
        await finish('partial', {
          counts: {},
          skippedConnectors,
          tokensUsed: 0,
          skippedItems: [{ item: 'the entire unit — nothing was examined', reason: 'No sources are mapped for this account (no Slack channel, email domain or Zendesk org), so there is no identifier to match on and a scan could only report finding nothing. Skipped before spending any tokens. The discovery sweep raises an "Account match needed" when it sees this company; approving that attaches the identifier and this unit starts working.' }],
        })
        return { status: 'partial', counts: {}, skippedConnectors, runId, skippedCount: 1, noSources: true }
      }

      if ((health?.consecutive_empty_nights ?? 0) >= 1) {
        tokenCap = Number(settings?.probe_token_budget ?? 25000)
        console.log(`run ${runId}: account has ${health?.consecutive_empty_nights} empty night(s) — probing on ${tokenCap} tokens instead of ${fullCap}`)
      }
    }
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
    if (recordType !== DISCOVERY) await trackScanOutcome(svc, orgId, records.length > 0, runId, mode, triggeredBy)
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

  const result = await processUnit(
    service,
    item.org_id,
    item.record_type,
    item.mode,
    triggeredBy,
    resolveStubOutput(req),
    // The day range chosen when the run was queued applies to every unit
    // in it, not just the sweep.
    typeof item.window_days === 'number' ? item.window_days : undefined,
  )

  // `locked` is not a failure -- the unit's 15-minute sync_state lock is
  // still held by a run that was interrupted. Writing it as `error` took the
  // row out of `queued` permanently, so a unit that just needed a few
  // minutes was silently lost. Leave it queued and pass over it until the
  // lock can have expired.
  if (result.status === 'locked') {
    const paused = /paused/i.test(result.error ?? '')
    await service.from('sync_queue').update({
      status: 'queued',
      // A pause has no lock to wait out — the operator decides when it
      // resumes, so don't make the unit sit out an arbitrary 16 minutes
      // after they un-pause.
      retry_after: paused ? null : new Date(Date.now() + 16 * 60_000).toISOString(),
      error: result.error ?? 'the previous run of this unit is still holding its lock — will retry',
      run_id: result.runId ?? null,
    }).eq('id', item.id)
    return json(result)
  }

  await service.from('sync_queue').update({
    status: result.status === 'success' || result.status === 'partial' ? 'done' : 'error',
    finished_at: new Date().toISOString(),
    error: result.error ?? null,
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
