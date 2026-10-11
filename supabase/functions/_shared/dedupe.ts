// Shared between `ingest` (7.4) and `provisioning`'s `resolve_account_proposal`
// action (7.5-pre2 Session 2) — the dedupe/upsert decision tree for CS
// records. Extracted this session so releasing a held record (once its
// account/tenant is resolved) runs through the EXACT same logic `ingest`
// uses for a fresh sighting, rather than a second copy drifting apart.
//
// Callers are responsible for resolving `orgId`/`tenantId` and validating/
// filtering `data` BEFORE calling `decideAndFile` — this module only
// decides what a fact with an ALREADY-KNOWN subject should do to the real
// table (duplicate_skipped / proposed_update / updated_pending /
// previously_rejected / proposed / superseded_pending), plus the delete path.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── record-type schemas — the exact allow-list apply_proposal() (7.3,
// D-080) already recognizes, so anything proposed here is guaranteed
// approvable with no changes on that side. Shared because the resolution-
// release path (provisioning's resolve_account_proposal, 7.5-pre2 Session
// 2) re-validates a held record's data against the SAME rules `ingest`
// used when it first arrived — one copy, not two drifting apart. ─────────

export const TARGET_TABLE: Record<string, string> = {
  milestone: 'milestones',
  accomplishment: 'accomplishments',
  risk: 'risks',
  escalation: 'escalations',
  ticket: 'tickets',
  metric: 'metric_values',
  health: 'organizations',
  action_item: 'action_items',
  engagement: 'engagements',
}
export const KNOWN_FIELDS: Record<string, string[]> = {
  milestone: ['period', 'description', 'status'],
  accomplishment: ['period', 'text'],
  risk: ['risk', 'impact', 'mitigation', 'severity', 'status', 'owner'],
  escalation: ['title', 'severity', 'status', 'raised_by'],
  ticket: ['external_key', 'title', 'priority', 'status', 'url', 'system'],
  metric: ['metric_key', 'period', 'value', 'baseline_value'],
  health: ['health', 'health_reason'],
  // 7.5-pre2 Session 4 — field names match the action_items table's own
  // columns directly, same convention as every other type (valuesEqual
  // compares `data`'s keys against the real row's column names verbatim,
  // so a field name that doesn't match a column would never dedupe —
  // always look "changed" even when nothing is). owner_profile_id/
  // owner_text are resolved server-side from the caller's `owner` string
  // (ingest's resolveOwner) before this filtering ever runs — never sent
  // by the caller directly.
  action_item: ['description', 'owner_profile_id', 'owner_text', 'priority', 'due_date', 'status'],
  engagement: ['engagement_date', 'attendees', 'summary', 'follow_ups'],
}
export const REQUIRED_FIELDS: Record<string, string[]> = {
  milestone: ['period', 'description'],
  accomplishment: ['period', 'text'],
  risk: ['risk', 'impact'],
  escalation: ['title'],
  ticket: ['external_key', 'title', 'system'],
  metric: ['metric_key', 'period', 'value'],
  health: ['health'],
  action_item: ['description'],
  engagement: ['engagement_date', 'summary'],
}
export const NEEDS_PROJECT: Record<string, 'required' | 'optional' | 'none'> = {
  milestone: 'required',
  accomplishment: 'required',
  risk: 'optional',
  escalation: 'optional',
  ticket: 'none',
  metric: 'optional',
  health: 'none',
  action_item: 'optional',
  engagement: 'none',
}

// Filters `rawData` down to the known fields for `recordType`, returning
// the stripped-field names separately. Required-field / metric / health
// validation stays with the caller (it needs svc for the metric_definitions
// lookup and wants its own error-message wording), this just does the
// mechanical allow-list filtering both callers need identically.
export function filterKnownFields(recordType: string, rawData: Record<string, unknown>): { data: Record<string, unknown>; stripped: string[] } {
  const known = KNOWN_FIELDS[recordType] ?? []
  const stripped: string[] = []
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rawData)) {
    if (known.includes(k)) data[k] = v
    else stripped.push(k)
  }
  return { data, stripped }
}

export async function resolveProject(svc: SupabaseClient, orgId: string, ref: string): Promise<{ id: string } | null> {
  if (UUID_RE.test(ref)) {
    const { data } = await svc.from('projects').select('id').eq('id', ref).eq('org_id', orgId).maybeSingle()
    if (data) return data
  }
  const { data } = await svc.from('projects').select('id').eq('org_id', orgId).eq('name', ref).maybeSingle()
  return data ?? null
}

// A tenant is an end-customer/program/sub-account under one account — never
// an account itself. Resolved via a structured account_sources match,
// scoped to the already-resolved org so an identifier that happens to
// match a tenant under a DIFFERENT account can never cross-attribute.
export async function resolveTenant(svc: SupabaseClient, orgId: string, ref: string | undefined): Promise<{ id: string } | null> {
  if (!ref) return null
  if (UUID_RE.test(ref)) {
    const { data } = await svc.from('tenants').select('id').eq('id', ref).eq('org_id', orgId).maybeSingle()
    if (data) return data
  }
  const { data } = await svc.from('account_sources').select('tenant_id').eq('value', ref).eq('org_id', orgId).not('tenant_id', 'is', null).maybeSingle()
  return data ? { id: data.tenant_id as string } : null
}

// action_item's `owner` is a caller claim, resolved the same spirit as
// account/tenant matching — exact only, never a fuzzy guess between two
// same-named people. profiles aren't org-scoped, so this isn't scoped to
// orgId either. Returns exactly one of {profileId, text}, never both —
// apply_proposal()'s action_items branch relies on that to know whether
// `owner` was sent at all this call.
export async function resolveOwner(svc: SupabaseClient, ownerRaw: string | undefined): Promise<{ profileId: string | null; text: string | null } | null> {
  if (!ownerRaw) return null
  const trimmed = ownerRaw.trim()
  if (!trimmed) return null
  // .limit(2), not .maybeSingle() — two people sharing a name must fall
  // back to text too, not throw or pick one arbitrarily.
  const { data } = await svc.from('profiles').select('id').ilike('full_name', trimmed).limit(2)
  if (data && data.length === 1) return { profileId: data[0].id as string, text: null }
  return { profileId: null, text: trimmed }
}

// ── normalized equality — compares ONLY the fields the caller actually
// sent (an omitted field is never "changed"), after normalizing dates to
// ISO, numbers via coercion, strings via trim, enums via lowercase. Without
// this, a daily sync run files a false proposed_update for every unchanged
// ticket just because a date arrived in a different (but equal) format. ──

const DATE_FIELDS = new Set(['period', 'due_date', 'engagement_date'])
const NUMBER_FIELDS = new Set(['value', 'baseline_value'])
const ENUM_FIELDS = new Set(['health', 'status', 'severity', 'priority'])

export function normalizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (DATE_FIELDS.has(key)) {
    const d = new Date(value as string)
    return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10)
  }
  if (NUMBER_FIELDS.has(key)) return Number(value)
  if (ENUM_FIELDS.has(key)) return String(value).trim().toLowerCase()
  if (typeof value === 'string') return value.trim()
  // Arrays (e.g. engagement.attendees) compare by reference otherwise —
  // two freshly-parsed JSON arrays with identical contents are never
  // `===`, which would make every resend look "changed." Order-independent
  // (a source re-listing attendees in a different order isn't a change).
  if (Array.isArray(value)) return JSON.stringify([...value].map((v) => String(v).trim()).sort())
  return value
}

export function valuesEqual(incoming: Record<string, unknown>, current: Record<string, unknown>): boolean {
  for (const key of Object.keys(incoming)) {
    const a = normalizeValue(key, incoming[key])
    const b = normalizeValue(key, current[key])
    if (a !== b) return false
  }
  return true
}

// The "real row" this record maps to, if one exists. `health` is always
// the organizations row itself (no source_ref lookup needed — the org
// already exists); everything else is looked up by (org_id, source_ref).
export async function resolveRealRow(svc: SupabaseClient, recordType: string, targetTable: string, orgId: string, sourceRef: string | undefined): Promise<Record<string, unknown> | null> {
  if (recordType === 'health') {
    const { data } = await svc.from('organizations').select('id, health, health_reason').eq('id', orgId).maybeSingle()
    return data
  }
  if (!sourceRef) return null
  const { data } = await svc.from(targetTable).select('*').eq('org_id', orgId).eq('source_ref', sourceRef).maybeSingle()
  return data
}

export interface DecideCtx {
  source: string
  triggeredBy: string | null
  runId: string | null
  tokenId: string | null
  proposedBy: string
}

export interface DecideArgs {
  recordType: string
  targetTable: string
  orgId: string
  operation: 'create' | 'update' | 'delete'
  data: Record<string, unknown> // already filtered/validated; tenant_id/project_id already merged in by the caller
  sourceRef: string | undefined
  evidenceUrl: string | null
  evidenceExcerpt: string | null
  confidence: number | null
}

interface FileArgs {
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

export async function fileProposal(svc: SupabaseClient, args: FileArgs, ctx: DecideCtx, statusLabel: string, strippedFields?: string[]) {
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
      proposed_by: ctx.proposedBy,
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
    console.error('dedupe: proposal insert failed', error.code)
    return { source_ref: args.sourceRef, status: 'rejected_invalid', reason: 'internal error filing proposal' }
  }
  return { source_ref: args.sourceRef, status: statusLabel, proposalId: data.id, strippedFields }
}

// The core decision tree (7.4's upsert semantics, docs/ingest-api.md
// "Upsert / dedupe semantics"), parameterized by an ALREADY-RESOLVED
// orgId — the caller (ingest's processRecord for a fresh sighting, or the
// resolution-release path for a held record whose subject just became
// known) has already done account/tenant resolution before this runs.
export async function decideAndFile(svc: SupabaseClient, args: DecideArgs, ctx: DecideCtx, strippedFields?: string[]) {
  const { recordType, targetTable, orgId, operation, data, sourceRef, evidenceUrl, evidenceExcerpt, confidence } = args
  const stripped = strippedFields?.length ? strippedFields : undefined

  if (operation === 'delete') {
    if (recordType === 'health') return { source_ref: sourceRef, status: 'rejected_invalid', reason: 'delete is not valid for health' }
    if (!sourceRef) return { source_ref: sourceRef, status: 'rejected_invalid', reason: 'source_ref is required for delete' }
    const { data: pending } = await svc.from('proposals').select('id').eq('org_id', orgId).eq('target_table', targetTable).eq('source_ref', sourceRef).eq('status', 'pending').maybeSingle()
    const realRow = await resolveRealRow(svc, recordType, targetTable, orgId, sourceRef)
    if (!realRow && pending) {
      await svc.from('proposals').update({ status: 'superseded' }).eq('id', pending.id)
      return { source_ref: sourceRef, status: 'superseded_pending' }
    }
    if (!realRow) return { source_ref: sourceRef, status: 'rejected_invalid', reason: 'nothing to delete' }
    return await fileProposal(svc, { orgId, targetTable, targetId: realRow.id as string, operation: 'delete', payload: {}, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctx, 'proposed')
  }

  if (sourceRef) {
    const { data: pending } = await svc.from('proposals').select('id').eq('org_id', orgId).eq('target_table', targetTable).eq('source_ref', sourceRef).eq('status', 'pending').maybeSingle()
    if (pending) {
      await svc.from('proposals').update({ payload: data, evidence_url: evidenceUrl, evidence_excerpt: evidenceExcerpt, confidence }).eq('id', pending.id)
      return { source_ref: sourceRef, status: 'updated_pending', proposalId: pending.id, strippedFields: stripped }
    }

    const { data: rejected } = await svc.from('proposals').select('id, payload').eq('org_id', orgId).eq('target_table', targetTable).eq('source_ref', sourceRef).eq('status', 'rejected').order('decided_at', { ascending: false }).limit(1).maybeSingle()
    if (rejected && valuesEqual(data, rejected.payload as Record<string, unknown>)) {
      return { source_ref: sourceRef, status: 'previously_rejected' }
    }

    const realRow = await resolveRealRow(svc, recordType, targetTable, orgId, sourceRef)
    if (realRow) {
      if (valuesEqual(data, realRow)) return { source_ref: sourceRef, status: 'duplicate_skipped', strippedFields: stripped }
      return await fileProposal(svc, { orgId, targetTable, targetId: realRow.id as string, operation: 'update', payload: data, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctx, 'proposed_update', stripped)
    }
  }

  return await fileProposal(svc, { orgId, targetTable, targetId: null, operation: 'create', payload: data, sourceRef, evidenceUrl, evidenceExcerpt, confidence }, ctx, 'proposed', stripped)
}
