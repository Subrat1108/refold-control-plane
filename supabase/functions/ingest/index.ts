// Ingest API (7.4, build-spec-v3 § 4.3). The CS Sync Skill's one door into
// the platform — every record it reports becomes a PROPOSAL, never a direct
// write (§4.3: "nothing is applied by the API"); 7.3's Approvals inbox +
// apply_proposal() act on the result unchanged.
//
// Auth is a bearer ingest token (supabase/config.toml disables the gateway's
// default JWT check for this function — a custom token isn't a Supabase JWT
// and would otherwise be rejected before this code even runs). This
// function's own token lookup is the ONLY gate; it always runs as the
// service-role client (no auth.uid() exists for this caller, so every RLS
// policy on proposals/sync_runs would otherwise block everything).
//
// No CORS headers anywhere, no OPTIONS handling — server-to-server only.
// Never log a request body, a record's `data`, or an evidence excerpt —
// only ids, counts, and error codes (docs/ingest-api.md states this as a
// guarantee).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RECORDS = 200
const MAX_BODY_BYTES = 2_000_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Reads the body while counting bytes, so a 2MB cap holds even under
// chunked transfer encoding (no reliable Content-Length to check first).
async function readBodyCapped(req: Request, maxBytes: number): Promise<{ text: string } | { tooLarge: true }> {
  if (!req.body) return { text: '' }
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      try { await reader.cancel() } catch { /* already aborting */ }
      return { tooLarge: true }
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength }
  return { text: new TextDecoder().decode(buf) }
}

// ── record-type schemas — the exact allow-list apply_proposal() (7.3,
// D-080) already recognizes, so anything proposed here is guaranteed
// approvable with no changes on that side. ────────────────────────────────

const TARGET_TABLE: Record<string, string> = {
  milestone: 'milestones',
  accomplishment: 'accomplishments',
  risk: 'risks',
  escalation: 'escalations',
  ticket: 'tickets',
  metric: 'metric_values',
  health: 'organizations',
}
const KNOWN_FIELDS: Record<string, string[]> = {
  milestone: ['period', 'description', 'status'],
  accomplishment: ['period', 'text'],
  risk: ['risk', 'impact', 'mitigation', 'severity', 'status', 'owner'],
  escalation: ['title', 'severity', 'status', 'raised_by'],
  ticket: ['external_key', 'title', 'priority', 'status', 'url', 'system'],
  metric: ['metric_key', 'period', 'value', 'baseline_value'],
  health: ['health', 'health_reason'],
}
const REQUIRED_FIELDS: Record<string, string[]> = {
  milestone: ['period', 'description'],
  accomplishment: ['period', 'text'],
  risk: ['risk', 'impact'],
  escalation: ['title'],
  ticket: ['external_key', 'title', 'system'],
  metric: ['metric_key', 'period', 'value'],
  health: ['health'],
}
const NEEDS_PROJECT: Record<string, 'required' | 'optional' | 'none'> = {
  milestone: 'required',
  accomplishment: 'required',
  risk: 'optional',
  escalation: 'optional',
  ticket: 'none',
  metric: 'optional',
  health: 'none',
}

// ── normalized equality — compares ONLY the fields the caller actually
// sent (an omitted field is never "changed"), after normalizing dates to
// ISO, numbers via coercion, strings via trim, enums via lowercase. Without
// this, a daily sync run files a false proposed_update for every unchanged
// ticket just because a date arrived in a different (but equal) format. ──

const DATE_FIELDS = new Set(['period', 'due_date'])
const NUMBER_FIELDS = new Set(['value', 'baseline_value'])
const ENUM_FIELDS = new Set(['health', 'status', 'severity', 'priority'])

function normalizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (DATE_FIELDS.has(key)) {
    const d = new Date(value as string)
    return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10)
  }
  if (NUMBER_FIELDS.has(key)) return Number(value)
  if (ENUM_FIELDS.has(key)) return String(value).trim().toLowerCase()
  if (typeof value === 'string') return value.trim()
  return value
}

function valuesEqual(incoming: Record<string, unknown>, current: Record<string, unknown>): boolean {
  for (const key of Object.keys(incoming)) {
    const a = normalizeValue(key, incoming[key])
    const b = normalizeValue(key, current[key])
    if (a !== b) return false
  }
  return true
}

function tally(results: Array<{ status: string }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of results) out[r.status] = (out[r.status] ?? 0) + 1
  return out
}

interface RunCtx {
  runId: string
  source: string
  triggeredBy: string | null
  tokenId: string
}

async function resolveAccount(svc: SupabaseClient, ref: string | undefined): Promise<{ id: string } | null> {
  if (!ref) return null
  if (UUID_RE.test(ref)) {
    const { data } = await svc.from('organizations').select('id').eq('id', ref).maybeSingle()
    if (data) return data
  }
  const { data } = await svc.from('organizations').select('id').contains('aliases', [ref]).maybeSingle()
  return data ?? null
}

async function resolveProject(svc: SupabaseClient, orgId: string, ref: string): Promise<{ id: string } | null> {
  if (UUID_RE.test(ref)) {
    const { data } = await svc.from('projects').select('id').eq('id', ref).eq('org_id', orgId).maybeSingle()
    if (data) return data
  }
  const { data } = await svc.from('projects').select('id').eq('org_id', orgId).eq('name', ref).maybeSingle()
  return data ?? null
}

// The "real row" this record maps to, if one exists. `health` is always
// the organizations row itself (no source_ref lookup needed — the org
// already exists); everything else is looked up by (org_id, source_ref).
async function resolveRealRow(svc: SupabaseClient, recordType: string, targetTable: string, orgId: string, sourceRef: string | undefined): Promise<Record<string, unknown> | null> {
  if (recordType === 'health') {
    const { data } = await svc.from('organizations').select('id, health, health_reason').eq('id', orgId).maybeSingle()
    return data
  }
  if (!sourceRef) return null
  const { data } = await svc.from(targetTable).select('*').eq('org_id', orgId).eq('source_ref', sourceRef).maybeSingle()
  return data
}

interface ProposalArgs {
  orgId: string
  targetTable: string
  targetId: string | null
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  sourceRef: string | undefined
  evidenceUrl: string | null
  evidenceExcerpt: string | null
  confidence: number | null
}

async function fileProposal(svc: SupabaseClient, args: ProposalArgs, ctx: RunCtx, statusLabel: string, strippedFields?: string[]) {
  const { data, error } = await svc
    .from('proposals')
    .insert({
      org_id: args.orgId,
      target_table: args.targetTable,
      target_id: args.targetId,
      operation: args.operation,
      payload: args.payload,
      source: ctx.source,
      source_ref: args.sourceRef ?? null,
      evidence_url: args.evidenceUrl,
      evidence_excerpt: args.evidenceExcerpt,
      confidence: args.confidence,
      proposed_by: 'cs-sync-agent',
      triggered_by: ctx.triggeredBy,
      run_id: ctx.runId,
      ingest_token_id: ctx.tokenId,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    // Race: the partial unique index caught a concurrent insert for the
    // same (org, table, source_ref) pending key — merge into theirs
    // instead of failing; the caller never sees the race.
    if (error.code === '23505' && args.sourceRef) {
      const { data: existing } = await svc
        .from('proposals')
        .select('id')
        .eq('org_id', args.orgId)
        .eq('target_table', args.targetTable)
        .eq('source_ref', args.sourceRef)
        .eq('status', 'pending')
        .maybeSingle()
      if (existing) {
        await svc.from('proposals').update({ payload: args.payload, evidence_url: args.evidenceUrl, evidence_excerpt: args.evidenceExcerpt, confidence: args.confidence }).eq('id', existing.id)
        return { source_ref: args.sourceRef, status: 'updated_pending', proposalId: existing.id, strippedFields }
      }
    }
    console.error('ingest: proposal insert failed', error.code)
    return { source_ref: args.sourceRef, status: 'rejected_invalid', reason: 'internal error filing proposal' }
  }
  return { source_ref: args.sourceRef, status: statusLabel, proposalId: data.id, strippedFields }
}

async function processRecord(svc: SupabaseClient, record: Record<string, unknown>, tokenRow: { id: string; allowed_org_ids: string[] | null }, ctx: RunCtx) {
  const sourceRef = record.source_ref as string | undefined
  const recordType = record.record_type as string
  const reject = (reason: string) => ({ source_ref: sourceRef, status: 'rejected_invalid', reason })

  if (!TARGET_TABLE[recordType]) return reject(`unknown record_type: ${recordType}`)
  const targetTable = TARGET_TABLE[recordType]

  const org = await resolveAccount(svc, record.account as string | undefined)
  if (!org) return reject('unknown account')
  if (tokenRow.allowed_org_ids && !tokenRow.allowed_org_ids.includes(org.id)) return reject("account outside this token's scope")

  let projectId: string | null = null
  const needsProject = NEEDS_PROJECT[recordType]
  if (record.project) {
    const proj = await resolveProject(svc, org.id, record.project as string)
    if (!proj) return reject('unknown project')
    projectId = proj.id
  } else if (needsProject === 'required') {
    return reject('project is required for this record_type')
  }

  const evidence = record.evidence as { url?: string; excerpt?: string } | undefined
  const evidenceUrl = typeof evidence?.url === 'string' ? evidence.url : null
  const evidenceExcerpt = typeof evidence?.excerpt === 'string' ? evidence.excerpt.slice(0, 280) : null
  const confidence = typeof record.confidence === 'number' ? record.confidence : null
  const operation = record.operation as string

  // Delete carries no `data` payload to validate against KNOWN_FIELDS/
  // REQUIRED_FIELDS — those only apply to create/update. Must be handled
  // before that validation runs, not after.
  if (operation === 'delete') {
    if (recordType === 'health') return reject('delete is not valid for health')
    if (!sourceRef) return reject('source_ref is required for delete')
    const { data: pending } = await svc.from('proposals').select('id').eq('org_id', org.id).eq('target_table', targetTable).eq('source_ref', sourceRef).eq('status', 'pending').maybeSingle()
    const realRow = await resolveRealRow(svc, recordType, targetTable, org.id, sourceRef)
    if (!realRow && pending) {
      await svc.from('proposals').update({ status: 'superseded' }).eq('id', pending.id)
      return { source_ref: sourceRef, status: 'superseded_pending' }
    }
    if (!realRow) return reject('nothing to delete')
    return await fileProposal(svc, { orgId: org.id, targetTable, targetId: realRow.id as string, operation: 'delete', payload: {}, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctx, 'proposed')
  }

  const known = KNOWN_FIELDS[recordType]
  const required = REQUIRED_FIELDS[recordType]
  const rawData = (record.data ?? {}) as Record<string, unknown>
  const strippedFields: string[] = []
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rawData)) {
    if (known.includes(k)) data[k] = v
    else strippedFields.push(k)
  }
  for (const field of required) {
    if (data[field] === undefined || data[field] === null || data[field] === '') return reject(`missing required field: ${field}`)
  }
  if (recordType === 'metric') {
    const { data: def } = await svc.from('metric_definitions').select('key').eq('key', data.metric_key as string).maybeSingle()
    if (!def) return reject('unknown metric_key')
    if (Number.isNaN(new Date(data.period as string).getTime())) return reject('invalid period')
  }
  if (recordType === 'health' && !['active', 'caution', 'risk'].includes(String(data.health).toLowerCase())) {
    return reject('invalid health value')
  }
  if (projectId) data.project_id = projectId
  const stripped = strippedFields.length ? strippedFields : undefined

  if (sourceRef) {
    const { data: pending } = await svc.from('proposals').select('id').eq('org_id', org.id).eq('target_table', targetTable).eq('source_ref', sourceRef).eq('status', 'pending').maybeSingle()
    if (pending) {
      await svc.from('proposals').update({ payload: data, evidence_url: evidenceUrl, evidence_excerpt: evidenceExcerpt, confidence }).eq('id', pending.id)
      return { source_ref: sourceRef, status: 'updated_pending', proposalId: pending.id, strippedFields: stripped }
    }

    const { data: rejected } = await svc.from('proposals').select('id, payload').eq('org_id', org.id).eq('target_table', targetTable).eq('source_ref', sourceRef).eq('status', 'rejected').order('decided_at', { ascending: false }).limit(1).maybeSingle()
    if (rejected && valuesEqual(data, rejected.payload as Record<string, unknown>)) {
      return { source_ref: sourceRef, status: 'previously_rejected' }
    }

    const realRow = await resolveRealRow(svc, recordType, targetTable, org.id, sourceRef)
    if (realRow) {
      if (valuesEqual(data, realRow)) return { source_ref: sourceRef, status: 'duplicate_skipped', strippedFields: stripped }
      return await fileProposal(svc, { orgId: org.id, targetTable, targetId: realRow.id as string, operation: 'update', payload: data, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctx, 'proposed_update', stripped)
    }
  }

  return await fileProposal(svc, { orgId: org.id, targetTable, targetId: null, operation: 'create', payload: data, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctx, 'proposed', stripped)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json({ error: 'Missing bearer token' }, 401)

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const tokenHash = await sha256Hex(token)
  const { data: tokenRow } = await svc.from('ingest_tokens').select('id, allowed_org_ids, expires_at, revoked_at').eq('token_hash', tokenHash).maybeSingle()
  if (!tokenRow) { console.error('ingest: invalid token'); return json({ error: 'Invalid token' }, 401) }
  if (tokenRow.revoked_at) { console.error('ingest: revoked token', tokenRow.id); return json({ error: 'Token revoked' }, 401) }
  if (new Date(tokenRow.expires_at) <= new Date()) { console.error('ingest: expired token', tokenRow.id); return json({ error: 'Token expired' }, 401) }
  await svc.from('ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenRow.id)

  const bodyResult = await readBodyCapped(req, MAX_BODY_BYTES)
  if ('tooLarge' in bodyResult) return json({ error: 'Request body too large (max 2MB)' }, 413)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try { payload = JSON.parse(bodyResult.text) } catch { return json({ error: 'Invalid JSON' }, 400) }

  const run = payload.run ?? {}
  const records = Array.isArray(payload.records) ? payload.records : []
  if (records.length > MAX_RECORDS) return json({ error: `Too many records (max ${MAX_RECORDS})` }, 413)

  if (!['scoped', 'backfill', 'daily'].includes(run.mode)) return json({ error: 'run.mode must be scoped|backfill|daily' }, 400)
  const source = run.source ?? 'agent'
  if (!['agent', 'chat', 'file'].includes(source)) return json({ error: 'run.source must be agent|chat|file' }, 400)

  let triggeredByAccepted = false
  let triggeredBy: string | null = null
  const claimed = run.triggered_by as string | undefined
  if (claimed === 'system') {
    triggeredBy = 'system'; triggeredByAccepted = true
  } else if (claimed) {
    const { data: profile } = await svc.from('profiles').select('id').eq('id', claimed).eq('account_type', 'super_admin').maybeSingle()
    if (profile) { triggeredBy = claimed; triggeredByAccepted = true }
  }

  let runId = run.id as string | undefined
  if (runId) {
    const { data: existingRun } = await svc.from('sync_runs').select('id, ingest_token_id').eq('id', runId).maybeSingle()
    if (existingRun?.ingest_token_id && existingRun.ingest_token_id !== tokenRow.id) {
      return json({ error: "run.id already exists under a different token" }, 409)
    }
    if (!existingRun) {
      await svc.from('sync_runs').insert({ id: runId, mode: run.mode, triggered_by: triggeredBy ?? 'system', scope: run.scope ?? null, status: 'running', ingest_token_id: tokenRow.id })
    }
  } else {
    const { data: newRun } = await svc.from('sync_runs').insert({ mode: run.mode, triggered_by: triggeredBy ?? 'system', scope: run.scope ?? null, status: 'running', ingest_token_id: tokenRow.id }).select('id').single()
    runId = newRun!.id
  }

  const ctx: RunCtx = { runId, source, triggeredBy, tokenId: tokenRow.id }
  const results = []
  for (const record of records) {
    results.push(await processRecord(svc, record, tokenRow, ctx))
  }

  const finalStatus = results.some((r) => r.status === 'rejected_invalid') ? 'partial' : 'success'
  const counts = tally(results)
  await svc.from('sync_runs').update({ finished_at: new Date().toISOString(), status: finalStatus, counts }).eq('id', runId)

  console.log('ingest run complete', { runId, tokenId: tokenRow.id, counts })

  return json({ run: { id: runId, status: finalStatus, triggeredByAccepted }, results })
})
