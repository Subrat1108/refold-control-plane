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
//
// 7.5-pre2 Session 2 — "account match needed": the agent never invents an
// account or promotes a tenant. When an account/tenant identifier can't be
// resolved via an exact account_sources match, this function files an
// `account_resolution` proposal and HOLDS the dependent record against it
// (status = 'held') instead of guessing or rejecting it. A human resolves
// it from the Approvals inbox (provisioning's resolve_account_proposal
// action), which releases every held record through the exact same
// decideAndFile tree this function uses for a fresh sighting
// (supabase/functions/_shared/dedupe.ts).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  TARGET_TABLE,
  REQUIRED_FIELDS,
  NEEDS_PROJECT,
  filterKnownFields,
  resolveProject,
  resolveTenant,
  decideAndFile,
  type DecideCtx,
} from '../_shared/dedupe.ts'

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

// 7.5-pre2 Session 1 — account_sources is the structured, exact-match
// source of truth for resolving an account (never a fuzzy guess; the
// agent/caller supplies the identifier, this is a lookup, not an
// inference). Supersedes the old `organizations.aliases` free-text array.
async function resolveAccount(svc: SupabaseClient, ref: string | undefined): Promise<{ id: string } | null> {
  if (!ref) return null
  if (UUID_RE.test(ref)) {
    const { data } = await svc.from('organizations').select('id').eq('id', ref).maybeSingle()
    if (data) return data
  }
  const { data } = await svc.from('account_sources').select('org_id').eq('value', ref).is('tenant_id', null).maybeSingle()
  return data ? { id: data.org_id as string } : null
}

// Is this exact identifier on the ignore list (a human already said "not a
// customer" for it)? Checked before ever filing a new account_resolution —
// otherwise the same non-customer name would re-propose itself every run.
async function isIgnored(svc: SupabaseClient, identifier: string): Promise<boolean> {
  const { data } = await svc.from('sync_learnings').select('id').eq('kind', 'ignore').eq('status', 'active').filter('content->>identifier', 'eq', identifier).maybeSingle()
  return !!data
}

interface ResolutionCandidate { type: 'account' | 'tenant'; id: string; name: string; confidence: number; why: string }

// Finds a still-pending account_resolution for this exact identifier
// (so 50 sightings of the same unknown name over a week file ONE
// resolution, not 50), or files a new one. `proposals_resolution_dedupe`
// is the race-safety backstop under concurrency, same philosophy as 7.4's
// proposals_pending_dedupe.
async function findOrCreateResolution(
  svc: SupabaseClient,
  scope: 'account' | 'tenant',
  observedName: string,
  knownOrgId: string | null,
  candidates: ResolutionCandidate[] | undefined,
  ctx: RunCtx,
): Promise<string> {
  const sourceRef = scope === 'account' ? observedName : `${knownOrgId}:${observedName}`
  const { data: existing } = await svc.from('proposals').select('id').eq('target_table', 'account_resolution').eq('source_ref', sourceRef).eq('status', 'pending').maybeSingle()
  if (existing) return existing.id as string

  const { data, error } = await svc
    .from('proposals')
    .insert({
      org_id: knownOrgId,
      target_table: 'account_resolution',
      operation: 'create',
      payload: { scope, observedName, knownOrgId, candidates: (candidates ?? []).slice(0, 3) },
      source: ctx.source,
      source_ref: sourceRef,
      proposed_by: 'cs-sync-agent',
      triggered_by: ctx.triggeredBy,
      run_id: ctx.runId,
      ingest_token_id: ctx.tokenId,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await svc.from('proposals').select('id').eq('target_table', 'account_resolution').eq('source_ref', sourceRef).eq('status', 'pending').maybeSingle()
      if (raced) return raced.id as string
    }
    throw new Error(`failed to file account_resolution: ${error.message}`)
  }
  return data.id as string
}

interface HoldArgs {
  orgId: string | null // known org for a tenant-scope hold, null for an account-scope hold
  targetTable: string
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  sourceRef: string | undefined
  evidenceUrl: string | null
  evidenceExcerpt: string | null
  confidence: number | null
}

// Holds a record against an unresolved account_resolution. Merges into an
// existing held proposal for the same (org-or-null, table, source_ref) key
// if the same fact was already held by an earlier sighting — held records
// must survive across runs and dedupe against new sightings, exactly like
// pending ones already do.
async function holdRecord(svc: SupabaseClient, args: HoldArgs, ctx: RunCtx, resolutionId: string) {
  if (args.sourceRef) {
    let query = svc.from('proposals').select('id').eq('target_table', args.targetTable).eq('source_ref', args.sourceRef).eq('status', 'held')
    query = args.orgId ? query.eq('org_id', args.orgId) : query.is('org_id', null)
    const { data: existing } = await query.maybeSingle()
    if (existing) {
      await svc.from('proposals').update({ payload: args.payload, evidence_url: args.evidenceUrl, evidence_excerpt: args.evidenceExcerpt, confidence: args.confidence, blocked_by_resolution_id: resolutionId }).eq('id', existing.id)
      return { source_ref: args.sourceRef, status: 'held_pending_resolution', proposalId: existing.id, resolutionId }
    }
  }

  const { data, error } = await svc
    .from('proposals')
    .insert({
      org_id: args.orgId,
      target_table: args.targetTable,
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
      status: 'held',
      blocked_by_resolution_id: resolutionId,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505' && args.sourceRef) {
      let query = svc.from('proposals').select('id').eq('target_table', args.targetTable).eq('source_ref', args.sourceRef).eq('status', 'held')
      query = args.orgId ? query.eq('org_id', args.orgId) : query.is('org_id', null)
      const { data: raced } = await query.maybeSingle()
      if (raced) {
        await svc.from('proposals').update({ payload: args.payload, evidence_url: args.evidenceUrl, evidence_excerpt: args.evidenceExcerpt, confidence: args.confidence, blocked_by_resolution_id: resolutionId }).eq('id', raced.id)
        return { source_ref: args.sourceRef, status: 'held_pending_resolution', proposalId: raced.id, resolutionId }
      }
    }
    console.error('ingest: hold insert failed', error.code)
    return { source_ref: args.sourceRef, status: 'rejected_invalid', reason: 'internal error holding record' }
  }
  return { source_ref: args.sourceRef, status: 'held_pending_resolution', proposalId: data.id, resolutionId }
}

async function processRecord(svc: SupabaseClient, record: Record<string, unknown>, tokenRow: { id: string; allowed_org_ids: string[] | null }, ctx: RunCtx) {
  const sourceRef = record.source_ref as string | undefined
  const recordType = record.record_type as string
  const reject = (reason: string) => ({ source_ref: sourceRef, status: 'rejected_invalid', reason })

  if (!TARGET_TABLE[recordType]) return reject(`unknown record_type: ${recordType}`)
  const targetTable = TARGET_TABLE[recordType]

  const evidence = record.evidence as { url?: string; excerpt?: string } | undefined
  const evidenceUrl = typeof evidence?.url === 'string' ? evidence.url : null
  const evidenceExcerpt = typeof evidence?.excerpt === 'string' ? evidence.excerpt.slice(0, 280) : null
  const confidence = typeof record.confidence === 'number' ? record.confidence : null
  const operation = record.operation as string
  const candidates = Array.isArray(record.candidates) ? (record.candidates as ResolutionCandidate[]) : undefined
  const accountRef = record.account as string | undefined

  const org = await resolveAccount(svc, accountRef)
  if (!org) {
    if (!accountRef) return reject('account is required')
    if (await isIgnored(svc, accountRef)) return reject('ignored: not a customer')
    const resolutionId = await findOrCreateResolution(svc, 'account', accountRef, null, candidates, ctx)
    // Held with whatever the record already told us — project/tenant can't
    // be resolved without an org, so they're carried as raw refs and
    // attempted again at release time, not validated now.
    return await holdRecord(svc, {
      orgId: null,
      targetTable,
      operation: operation as 'create' | 'update' | 'delete',
      payload: { recordType, rawData: record.data ?? {}, rawTenantRef: record.tenant ?? null, rawProjectRef: record.project ?? null },
      sourceRef,
      evidenceUrl,
      evidenceExcerpt,
      confidence,
    }, ctx, resolutionId)
  }
  if (tokenRow.allowed_org_ids && !tokenRow.allowed_org_ids.includes(org.id)) return reject("account outside this token's scope")

  let tenantId: string | null = null
  if (record.tenant) {
    const tenantRef = record.tenant as string
    const tenant = await resolveTenant(svc, org.id, tenantRef)
    if (!tenant) {
      const ignoreKey = `${org.id}:${tenantRef}`
      if (await isIgnored(svc, ignoreKey)) return reject('ignored: not a customer')
      const resolutionId = await findOrCreateResolution(svc, 'tenant', tenantRef, org.id, candidates, ctx)
      return await holdRecord(svc, {
        orgId: org.id,
        targetTable,
        operation: operation as 'create' | 'update' | 'delete',
        payload: { recordType, rawData: record.data ?? {}, rawProjectRef: record.project ?? null },
        sourceRef,
        evidenceUrl,
        evidenceExcerpt,
        confidence,
      }, ctx, resolutionId)
    }
    tenantId = tenant.id
  }

  let projectId: string | null = null
  const needsProject = NEEDS_PROJECT[recordType]
  if (record.project) {
    const proj = await resolveProject(svc, org.id, record.project as string)
    if (!proj) return reject('unknown project')
    projectId = proj.id
  } else if (needsProject === 'required') {
    return reject('project is required for this record_type')
  }

  // Delete carries no `data` payload to validate against KNOWN_FIELDS/
  // REQUIRED_FIELDS — those only apply to create/update. Must be handled
  // before that validation runs, not after.
  if (operation === 'delete') {
    if (recordType === 'health') return reject('delete is not valid for health')
    if (!sourceRef) return reject('source_ref is required for delete')
    const ctxForDedupe: DecideCtx = { source: ctx.source, triggeredBy: ctx.triggeredBy, runId: ctx.runId, tokenId: ctx.tokenId, proposedBy: 'cs-sync-agent' }
    return await decideAndFile(svc, { recordType, targetTable, orgId: org.id, operation: 'delete', data: {}, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctxForDedupe)
  }

  const required = REQUIRED_FIELDS[recordType]
  const { data, stripped } = filterKnownFields(recordType, (record.data ?? {}) as Record<string, unknown>)
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
  if (tenantId) data.tenant_id = tenantId

  const ctxForDedupe: DecideCtx = { source: ctx.source, triggeredBy: ctx.triggeredBy, runId: ctx.runId, tokenId: ctx.tokenId, proposedBy: 'cs-sync-agent' }
  return await decideAndFile(svc, { recordType, targetTable, orgId: org.id, operation: operation as 'create' | 'update' | 'delete', data, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctxForDedupe, stripped.length ? stripped : undefined)
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
