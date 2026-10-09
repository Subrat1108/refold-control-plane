// Standups (equal-admins model Part 3; product-overview.md § 5.7). Anyone
// can host; participants are pre-filled from reports_to + a remembered set,
// not a fixed team roster. Same direct-Supabase + TanStack Query pattern as
// every other hook file. No Edge Function involvement — standups/
// standup_entries/action_items all take direct client writes under RLS+AAL2,
// same as account_roles.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActionItem, ActionItemStatus, Standup, StandupEntry, StandupEntryRow, StandupRow } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstOf<T>(v: any): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const REMEMBERED_PARTICIPANTS_PAGE = 'standup_participants'

// ── Standups + entries ──────────────────────────────────────────────────

async function fetchStandups(): Promise<StandupRow[]> {
  const { data, error } = await supabase
    .from('standups')
    .select('id, host_profile_id, standup_date, created_at, profiles!standups_host_profile_id_fkey(full_name), standup_entries(count)')
    .order('standup_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    hostProfileId: row.host_profile_id,
    hostName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    standupDate: row.standup_date,
    participantCount: firstOf<{ count: number }>(row.standup_entries)?.count ?? 0,
    createdAt: row.created_at,
  }))
}

export function useStandups() {
  return useQuery({ queryKey: ['standups'], queryFn: fetchStandups })
}

async function fetchStandup(id: string): Promise<Standup | null> {
  const { data, error } = await supabase.from('standups').select('id, host_profile_id, standup_date, created_at').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { id: data.id, hostProfileId: data.host_profile_id, standupDate: data.standup_date, createdAt: data.created_at }
}

export function useStandup(id: string | null) {
  return useQuery({ queryKey: ['standup', id], queryFn: () => fetchStandup(id!), enabled: !!id })
}

async function fetchStandupEntries(standupId: string): Promise<StandupEntryRow[]> {
  const { data, error } = await supabase
    .from('standup_entries')
    .select('id, standup_id, profile_id, yesterday, today, blockers, created_at, profiles!standup_entries_profile_id_fkey(full_name)')
    .eq('standup_id', standupId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    standupId: row.standup_id,
    profileId: row.profile_id,
    profileName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    yesterday: row.yesterday,
    today: row.today,
    blockers: row.blockers,
    createdAt: row.created_at,
  }))
}

export function useStandupEntries(standupId: string | null) {
  return useQuery({ queryKey: ['standup-entries', standupId], queryFn: () => fetchStandupEntries(standupId!), enabled: !!standupId })
}

// Most recent entry for a person, across any standup — used both to find
// the "since last standup" window start and by the People activity view.
async function fetchLatestEntryForPerson(profileId: string): Promise<StandupEntry | null> {
  const { data, error } = await supabase
    .from('standup_entries')
    .select('id, standup_id, profile_id, yesterday, today, blockers, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { id: data.id, standupId: data.standup_id, profileId: data.profile_id, yesterday: data.yesterday, today: data.today, blockers: data.blockers, createdAt: data.created_at }
}

async function fetchRecentEntriesForPerson(profileId: string, limit = 5): Promise<(StandupEntry & { standupDate: string })[]> {
  const { data, error } = await supabase
    .from('standup_entries')
    .select('id, standup_id, profile_id, yesterday, today, blockers, created_at, standups!standup_entries_standup_id_fkey(standup_date)')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    standupId: row.standup_id,
    profileId: row.profile_id,
    yesterday: row.yesterday,
    today: row.today,
    blockers: row.blockers,
    createdAt: row.created_at,
    standupDate: firstOf<{ standup_date: string }>(row.standups)?.standup_date ?? row.created_at,
  }))
}

export function useRecentEntriesForPerson(profileId: string | null) {
  return useQuery({ queryKey: ['recent-entries-for-person', profileId], queryFn: () => fetchRecentEntriesForPerson(profileId!), enabled: !!profileId })
}

// ── Remembered participant set (reuses saved_views — see D-0xx) ───────────

async function fetchRememberedParticipants(hostId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('saved_views')
    .select('filters')
    .eq('owner_profile_id', hostId)
    .eq('page', REMEMBERED_PARTICIPANTS_PAGE)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const filters = data?.filters as { participantIds?: string[] } | undefined
  return filters?.participantIds ?? []
}

async function fetchDirectReportIds(hostId: string): Promise<string[]> {
  const { data, error } = await supabase.from('profiles').select('id').eq('reports_to', hostId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.id)
}

// Default resolution: the remembered set if one exists → else direct
// reports → else empty. Evolves with usage — every createStandup() call
// overwrites the remembered set with whoever was actually included.
export async function resolveDefaultParticipants(hostId: string): Promise<string[]> {
  const remembered = await fetchRememberedParticipants(hostId)
  if (remembered.length > 0) return remembered
  return fetchDirectReportIds(hostId)
}

export function useDefaultParticipants(hostId: string | null) {
  return useQuery({ queryKey: ['default-participants', hostId], queryFn: () => resolveDefaultParticipants(hostId!), enabled: !!hostId })
}

async function rememberParticipants(hostId: string, participantIds: string[]): Promise<void> {
  const { data: existing } = await supabase
    .from('saved_views')
    .select('id')
    .eq('owner_profile_id', hostId)
    .eq('page', REMEMBERED_PARTICIPANTS_PAGE)
    .maybeSingle()
  if (existing) {
    const { error } = await supabase.from('saved_views').update({ filters: { participantIds } }).eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('saved_views').insert({
      owner_profile_id: hostId,
      name: 'Last used',
      page: REMEMBERED_PARTICIPANTS_PAGE,
      scope: 'mine',
      filters: { participantIds },
    })
    if (error) throw new Error(error.message)
  }
}

// ── Deterministic "since last standup" draft ────────────────────────────
// Feeds Yesterday only — Today/Blockers start blank, nothing to predict.

async function activeOrgIdsFor(profileId: string): Promise<string[]> {
  const { data, error } = await supabase.from('account_roles').select('org_id').eq('profile_id', profileId).is('ended_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.org_id)
}

async function draftYesterdayFor(profileId: string): Promise<string> {
  const latest = await fetchLatestEntryForPerson(profileId)
  const since = latest ? latest.createdAt : new Date(Date.now() - 24 * 3_600_000).toISOString()
  const orgIds = await activeOrgIdsFor(profileId)

  const lines: string[] = []

  const { data: changes } = await supabase.from('audit_log').select('action, record_table').eq('actor_id', profileId).gte('created_at', since)
  if (changes && changes.length > 0) {
    const approvals = changes.filter((c) => c.action === 'approve' || c.action === 'reject').length
    const edits = changes.length - approvals
    if (edits > 0) lines.push(`Updated ${edits} record${edits === 1 ? '' : 's'}.`)
    if (approvals > 0) lines.push(`Decided ${approvals} approval${approvals === 1 ? '' : 's'}.`)
  }

  if (orgIds.length > 0) {
    const { data: newEscalations } = await supabase.from('escalations').select('title').in('org_id', orgIds).gte('created_at', since)
    if (newEscalations && newEscalations.length > 0) lines.push(`${newEscalations.length} new escalation${newEscalations.length === 1 ? '' : 's'} on my accounts.`)

    const { data: newTickets } = await supabase.from('tickets').select('title').in('org_id', orgIds).gte('created_at', since)
    if (newTickets && newTickets.length > 0) lines.push(`${newTickets.length} new ticket${newTickets.length === 1 ? '' : 's'} on my accounts.`)

    const today = new Date().toISOString().slice(0, 10)
    const { data: milestones } = await supabase.from('milestones').select('description, period, status').in('org_id', orgIds).neq('status', 'done')
    const due = (milestones ?? []).filter((m) => m.period <= today)
    if (due.length > 0) lines.push(`${due.length} milestone${due.length === 1 ? '' : 's'} due or overdue.`)
  }

  return lines.length > 0 ? lines.join(' ') : 'Nothing recorded since my last standup.'
}

// ── Create a standup (entries pre-filled, remembered set updated) ──────

export async function createStandup(hostId: string, standupDate: string, participantIds: string[]): Promise<string> {
  const { data: standup, error: standupError } = await supabase
    .from('standups')
    .insert({ host_profile_id: hostId, standup_date: standupDate })
    .select('id')
    .single()
  if (standupError) throw new Error(standupError.message)

  const drafts = await Promise.all(participantIds.map((id) => draftYesterdayFor(id)));
  const rows = participantIds.map((profileId, i) => ({ standup_id: standup.id, profile_id: profileId, yesterday: drafts[i] }))
  const { error: entriesError } = await supabase.from('standup_entries').insert(rows)
  if (entriesError) throw new Error(entriesError.message)

  await rememberParticipants(hostId, participantIds)

  return standup.id
}

export async function updateStandupEntry(id: string, patch: Partial<{ yesterday: string; today: string; blockers: string }>): Promise<void> {
  const { error } = await supabase.from('standup_entries').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Action items ─────────────────────────────────────────────────────────

async function fetchActionItems(filters: { ownerProfileId?: string; status?: ActionItemStatus }): Promise<ActionItem[]> {
  let query = supabase.from('action_items').select('id, standup_entry_id, org_id, owner_profile_id, description, due_date, status, created_by, created_at')
  if (filters.ownerProfileId) query = query.eq('owner_profile_id', filters.ownerProfileId)
  if (filters.status) query = query.eq('status', filters.status)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    standupEntryId: row.standup_entry_id,
    orgId: row.org_id,
    ownerProfileId: row.owner_profile_id,
    description: row.description,
    dueDate: row.due_date,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }))
}

export function useActionItems(filters: { ownerProfileId?: string; status?: ActionItemStatus } = {}) {
  return useQuery({ queryKey: ['action-items', filters], queryFn: () => fetchActionItems(filters) })
}

export async function createActionItem(input: { standupEntryId?: string | null; orgId?: string | null; ownerProfileId: string; description: string; dueDate?: string | null }, actorId: string): Promise<void> {
  const { error } = await supabase.from('action_items').insert({
    standup_entry_id: input.standupEntryId ?? null,
    org_id: input.orgId ?? null,
    owner_profile_id: input.ownerProfileId,
    description: input.description,
    due_date: input.dueDate ?? null,
    created_by: actorId,
  })
  if (error) throw new Error(error.message)
}

export async function updateActionItem(id: string, patch: Partial<{ ownerProfileId: string; status: ActionItemStatus; dueDate: string | null }>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.ownerProfileId !== undefined) update.owner_profile_id = patch.ownerProfileId
  if (patch.status !== undefined) update.status = patch.status
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate
  const { error } = await supabase.from('action_items').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}
