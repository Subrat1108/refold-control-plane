// Phase 7.3 — Approvals inbox + audit log screen. Same direct-Supabase +
// TanStack Query pattern as usePortfolio.ts/useTeamStructure.ts. proposals
// and audit_log both shipped in 7.1; approving/rejecting goes through the
// apply_proposal()/reject_proposal() SQL functions (20261009000001) so the
// decision is audited with action='approve'/'reject', not just a status flag.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AuditLogEntry, ProposalRow, ProposalStatus } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstOf<T>(v: any): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

// ── Proposals (Approvals inbox) ─────────────────────────────────────────────

export interface ProposalFilters {
  targetTable?: string
  orgId?: string
  source?: string
  status?: ProposalStatus
  orgIds?: string[] | null // scope filter (null = everyone, no filter)
}

async function fetchProposals(filters: ProposalFilters): Promise<ProposalRow[]> {
  let query = supabase
    .from('proposals')
    .select(
      'id, org_id, target_table, target_id, operation, payload, source, source_ref, evidence_url, evidence_excerpt, confidence, proposed_by, triggered_by, run_id, status, decided_by, decided_at, reason, created_at, organizations!proposals_org_id_fkey(name)',
    )
    .order('created_at', { ascending: false })

  query = query.eq('status', filters.status ?? 'pending')
  if (filters.targetTable) query = query.eq('target_table', filters.targetTable)
  if (filters.orgId) query = query.eq('org_id', filters.orgId)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.orgIds !== undefined && filters.orgIds !== null) query = query.in('org_id', filters.orgIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    targetTable: row.target_table,
    targetId: row.target_id,
    operation: row.operation,
    payload: row.payload ?? {},
    source: row.source,
    sourceRef: row.source_ref,
    evidenceUrl: row.evidence_url,
    evidenceExcerpt: row.evidence_excerpt,
    confidence: row.confidence,
    proposedBy: row.proposed_by,
    triggeredBy: row.triggered_by,
    runId: row.run_id,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    reason: row.reason,
    createdAt: row.created_at,
    accountName: firstOf<{ name: string }>(row.organizations)?.name ?? null,
  }))
}

export function useProposals(filters: ProposalFilters) {
  return useQuery({
    queryKey: ['proposals', filters],
    queryFn: () => fetchProposals(filters),
  })
}

async function fetchPendingProposalCount(): Promise<number> {
  const { count, error } = await supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (error) throw new Error(error.message)
  return count ?? 0
}

export function usePendingProposalCount() {
  return useQuery({ queryKey: ['pending-proposal-count'], queryFn: fetchPendingProposalCount })
}

// Read-only fetch of the CURRENT row an update/delete proposal targets, so
// the inbox can render a real before→after diff rather than trusting the
// proposal's payload alone. One small per-table dispatch, read-only — safe
// to be permissive here since nothing is written.
const DIFF_COLUMNS: Record<string, string> = {
  milestones: 'description, period, status',
  accomplishments: 'text, period',
  risks: 'risk, impact, mitigation, severity, status, owner',
  escalations: 'title, severity, status, resolution',
  tickets: 'title, priority, status, url',
  metric_values: 'value, baseline_value',
  organizations: 'health, health_reason',
}

export async function fetchCurrentRow(targetTable: string, targetId: string | null): Promise<Record<string, unknown> | null> {
  if (!targetId) return null
  const columns = DIFF_COLUMNS[targetTable]
  if (!columns) return null
  const { data, error } = await supabase.from(targetTable).select(columns).eq('id', targetId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Record<string, unknown> | null) ?? null
}

export function useCurrentRow(targetTable: string, targetId: string | null) {
  return useQuery({
    queryKey: ['proposal-current-row', targetTable, targetId],
    queryFn: () => fetchCurrentRow(targetTable, targetId),
    enabled: !!targetId,
  })
}

export async function approveProposal(id: string, decidedBy: string, payloadOverride?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('apply_proposal', {
    p_proposal_id: id,
    p_decided_by: decidedBy,
    p_payload_override: payloadOverride ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function rejectProposal(id: string, decidedBy: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_proposal', { p_proposal_id: id, p_decided_by: decidedBy, p_reason: reason })
  if (error) throw new Error(error.message)
}

// ── Audit log screen ────────────────────────────────────────────────────────

export interface AuditLogFilters {
  recordTable?: string
  action?: string
  actorId?: string
  orgId?: string
  since?: string
  until?: string
  orgIds?: string[] | null // scope filter (null = everyone, no filter)
  limit?: number
  offset?: number
}

async function fetchAuditLog(filters: AuditLogFilters): Promise<{ rows: AuditLogEntry[]; count: number }> {
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0
  let query = supabase
    .from('audit_log')
    .select(
      'id, actor_id, on_behalf_of, action, record_table, record_id, before, after, org_id, proposal_id, created_at, profiles!audit_log_actor_id_fkey(full_name), organizations!audit_log_org_id_fkey(name)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filters.recordTable) query = query.eq('record_table', filters.recordTable)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.actorId) query = query.eq('actor_id', filters.actorId)
  if (filters.orgId) query = query.eq('org_id', filters.orgId)
  if (filters.since) query = query.gte('created_at', filters.since)
  if (filters.until) query = query.lte('created_at', filters.until)
  if (filters.orgIds !== undefined && filters.orgIds !== null) query = query.in('org_id', filters.orgIds)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((row: any) => ({
    id: row.id,
    actorId: row.actor_id,
    actorName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    onBehalfOf: row.on_behalf_of,
    action: row.action,
    recordTable: row.record_table,
    recordId: row.record_id,
    before: row.before,
    after: row.after,
    orgId: row.org_id,
    accountName: firstOf<{ name: string }>(row.organizations)?.name ?? null,
    proposalId: row.proposal_id,
    createdAt: row.created_at,
  }))
  return { rows, count: count ?? 0 }
}

export function useAuditLog(filters: AuditLogFilters) {
  return useQuery({ queryKey: ['audit-log', filters], queryFn: () => fetchAuditLog(filters) })
}

export function auditLogToCsv(rows: AuditLogEntry[]): string {
  const headers = ['created_at', 'actor', 'on_behalf_of', 'action', 'record_table', 'record_id', 'account', 'before', 'after']
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [r.createdAt, r.actorName ?? '', r.onBehalfOf ?? '', r.action, r.recordTable ?? '', r.recordId ?? '', r.accountName ?? '', JSON.stringify(r.before ?? {}), JSON.stringify(r.after ?? {})]
      .map(escape)
      .join(','),
  )
  return [headers.join(','), ...lines].join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
