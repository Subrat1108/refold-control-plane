// 7.5-pre2 Session 5 — reads for the sync runner's own state: per-unit
// watermarks (Account 360's Refresh buttons), recent runs + settings (the
// Sync Status admin screen), and the account-scoped action_items list (the
// new Action Items tab — a CS-synced fact list, read-only here; a human
// edits via Approvals, not a form on this tab).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActionItem, SyncQueueItem, SyncRun, SyncSettings, SyncState } from '@/types'

async function fetchSyncState(orgId: string, recordType: string): Promise<SyncState | null> {
  const { data, error } = await supabase
    .from('sync_state')
    .select('org_id, record_type, last_synced_at, last_status, last_error, locked_until')
    .eq('org_id', orgId)
    .eq('record_type', recordType)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { orgId: data.org_id, recordType: data.record_type, lastSyncedAt: data.last_synced_at, lastStatus: data.last_status, lastError: data.last_error, lockedUntil: data.locked_until }
}

export function useSyncState(orgId: string | null, recordType: string) {
  return useQuery({ queryKey: ['sync-state', orgId, recordType], queryFn: () => fetchSyncState(orgId!, recordType), enabled: !!orgId })
}

async function fetchSyncRuns(limit: number): Promise<SyncRun[]> {
  const { data, error } = await supabase
    .from('sync_runs')
    .select('id, mode, triggered_by, scope, started_at, finished_at, status, counts, cost, tokens_used, skipped_connectors')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, mode: r.mode, triggeredBy: r.triggered_by, scope: r.scope, startedAt: r.started_at, finishedAt: r.finished_at,
    status: r.status, counts: r.counts, cost: r.cost, tokensUsed: r.tokens_used, skippedConnectors: r.skipped_connectors,
  }))
}

export function useSyncRuns(limit = 50) {
  return useQuery({ queryKey: ['sync-runs', limit], queryFn: () => fetchSyncRuns(limit) })
}

async function fetchSyncSettings(): Promise<SyncSettings> {
  const { data, error } = await supabase.from('sync_settings').select('kill_switch, daily_run_at_utc, max_units_per_run, max_units_per_day, max_tokens_per_unit, updated_by, updated_at').eq('singleton', true).single()
  if (error) throw new Error(error.message)
  return { killSwitch: data.kill_switch, dailyRunAtUtc: data.daily_run_at_utc, maxUnitsPerRun: data.max_units_per_run, maxUnitsPerDay: data.max_units_per_day, maxTokensPerUnit: data.max_tokens_per_unit, updatedBy: data.updated_by, updatedAt: data.updated_at }
}

export function useSyncSettings() {
  return useQuery({ queryKey: ['sync-settings'], queryFn: fetchSyncSettings })
}

async function fetchSyncQueue(limit: number): Promise<SyncQueueItem[]> {
  const { data, error } = await supabase
    .from('sync_queue')
    .select('id, org_id, record_type, mode, run_id, status, enqueued_at, claimed_at, finished_at, error')
    .order('enqueued_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, orgId: r.org_id, recordType: r.record_type, mode: r.mode, runId: r.run_id, status: r.status,
    enqueuedAt: r.enqueued_at, claimedAt: r.claimed_at, finishedAt: r.finished_at, error: r.error,
  }))
}

export function useSyncQueue(limit = 50) {
  return useQuery({ queryKey: ['sync-queue', limit], queryFn: () => fetchSyncQueue(limit) })
}

// ── Account-scoped action items (the new Account 360 tab) ─────────────────
async function fetchAccountActionItems(orgId: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select('id, standup_entry_id, org_id, tenant_id, project_id, owner_profile_id, owner_text, description, priority, due_date, status, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, standupEntryId: r.standup_entry_id, orgId: r.org_id, tenantId: r.tenant_id, projectId: r.project_id,
    ownerProfileId: r.owner_profile_id, ownerText: r.owner_text, description: r.description, priority: r.priority,
    dueDate: r.due_date, status: r.status, source: r.source, sourceRef: r.source_ref, createdBy: r.created_by,
    updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useAccountActionItems(orgId: string | null) {
  return useQuery({ queryKey: ['account-action-items', orgId], queryFn: () => fetchAccountActionItems(orgId!), enabled: !!orgId })
}
