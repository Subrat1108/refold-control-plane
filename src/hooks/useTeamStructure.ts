// Phase 7.2a — Postgres-backed reads/writes for the Team Structure screen and
// the scope helpers every scoped list uses. Same pattern as useProvisioning.ts
// (direct supabase client + TanStack Query) — this is real data, not mock.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  AccountAssignmentRow,
  AssignmentRole,
  SavedView,
  SavedViewScope,
  TeamSummary,
} from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstOf<T>(v: any): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

// ── Teams ──────────────────────────────────────────────────────────────────

async function fetchTeams(): Promise<TeamSummary[]> {
  // Explicit FK hint (D-068): teams has only one relationship to profiles
  // today (lead_profile_id), but every embed touching profiles gets the hint
  // on principle — a second one (e.g. a future "created_by") should never be
  // able to silently break this query the way D-068 did.
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, lead_profile_id, created_at, profiles!teams_lead_profile_id_fkey(full_name), team_members(count)')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    leadProfileId: row.lead_profile_id,
    leadName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    memberCount: firstOf<{ count: number }>(row.team_members)?.count ?? 0,
    createdAt: row.created_at,
  }))
}

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: fetchTeams })
}

export async function createTeam(name: string, leadProfileId: string | null): Promise<void> {
  const { error } = await supabase.from('teams').insert({ name, lead_profile_id: leadProfileId })
  if (error) throw new Error(error.message)
}

export async function updateTeam(id: string, patch: { name?: string; leadProfileId?: string | null }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.leadProfileId !== undefined) update.lead_profile_id = patch.leadProfileId
  const { error } = await supabase.from('teams').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

async function fetchTeamMemberIds(teamId: string): Promise<string[]> {
  const { data, error } = await supabase.from('team_members').select('profile_id').eq('team_id', teamId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.profile_id)
}

export function useTeamMemberIds(teamId: string | null) {
  return useQuery({
    queryKey: ['team-member-ids', teamId],
    queryFn: () => fetchTeamMemberIds(teamId!),
    enabled: !!teamId,
  })
}

export async function addTeamMember(teamId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('team_members').insert({ team_id: teamId, profile_id: profileId })
  if (error) throw new Error(error.message)
}

export async function removeTeamMember(teamId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('profile_id', profileId)
  if (error) throw new Error(error.message)
}

// ── Accounts (organizations, excluding the internal Refold org) ────────────

const INTERNAL_ORG_ID = '00000000-0000-0000-0000-000000000001'

export interface AccountListRow {
  id: string
  name: string
  deploymentType: string
  health: string
  assignmentCount: number
}

async function fetchAssignableAccounts(): Promise<AccountListRow[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, deployment_type, health, account_assignments(count)')
    .neq('id', INTERNAL_ORG_ID)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    deploymentType: row.deployment_type,
    health: row.health,
    assignmentCount: firstOf<{ count: number }>(row.account_assignments)?.count ?? 0,
  }))
}

export function useAssignableAccounts() {
  return useQuery({ queryKey: ['assignable-accounts'], queryFn: fetchAssignableAccounts })
}

async function fetchAccountAssignments(orgId: string): Promise<AccountAssignmentRow[]> {
  const { data, error } = await supabase
    .from('account_assignments')
    .select('id, org_id, profile_id, role, is_primary, profiles!account_assignments_profile_id_fkey(full_name)')
    .eq('org_id', orgId)
    .order('role', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    profileId: row.profile_id,
    profileName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    role: row.role,
    isPrimary: row.is_primary,
  }))
}

export function useAccountAssignments(orgId: string | null) {
  return useQuery({
    queryKey: ['account-assignments', orgId],
    queryFn: () => fetchAccountAssignments(orgId!),
    enabled: !!orgId,
  })
}

export async function addAccountAssignment(orgId: string, profileId: string, role: AssignmentRole, isPrimary: boolean): Promise<void> {
  const { error } = await supabase
    .from('account_assignments')
    .insert({ org_id: orgId, profile_id: profileId, role, is_primary: isPrimary })
  if (error) throw new Error(error.message)
}

export async function setAccountAssignmentPrimary(id: string, isPrimary: boolean): Promise<void> {
  const { error } = await supabase.from('account_assignments').update({ is_primary: isPrimary }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function removeAccountAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('account_assignments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Scope helpers (D-073) — focus only, never access control ───────────────
// Every list screen resolves its current ScopeSwitcher selection to an org-id
// list via exactly these calls, so "Mine / My team / Everyone / person / a
// specific team" behave identically everywhere.

export async function resolveScopeAccountIds(
  scope: SavedViewScope,
  scopeTarget: string | null,
): Promise<string[] | null> {
  // null = "everyone" = no filter at all (the caller should skip .in(...)).
  if (scope === 'everyone') return null
  if (scope === 'mine') {
    const { data, error } = await supabase.rpc('my_account_ids')
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: { my_account_ids: string }) => r.my_account_ids)
  }
  if (scope === 'team') {
    const { data, error } = await supabase.rpc('my_team_account_ids')
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: { my_team_account_ids: string }) => r.my_team_account_ids)
  }
  if (scope === 'person' && scopeTarget) {
    const { data, error } = await supabase.rpc('person_account_ids', { p_profile_id: scopeTarget })
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: { person_account_ids: string }) => r.person_account_ids)
  }
  if (scope === 'team_id' && scopeTarget) {
    const { data, error } = await supabase.rpc('team_account_ids', { p_team_id: scopeTarget })
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: { team_account_ids: string }) => r.team_account_ids)
  }
  return []
}

export function useScopedAccountIds(scope: SavedViewScope, scopeTarget: string | null) {
  return useQuery({
    queryKey: ['scoped-account-ids', scope, scopeTarget],
    queryFn: () => resolveScopeAccountIds(scope, scopeTarget),
  })
}

// ── Saved views ──────────────────────────────────────────────────────────────

async function fetchSavedViews(page: string): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from('saved_views')
    .select('id, owner_profile_id, name, page, scope, scope_target, filters, sort, columns, is_default, pinned, created_at')
    .eq('page', page)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    name: row.name,
    page: row.page,
    scope: row.scope,
    scopeTarget: row.scope_target,
    filters: row.filters ?? {},
    sort: row.sort,
    columns: row.columns,
    isDefault: row.is_default,
    pinned: row.pinned,
    createdAt: row.created_at,
  }))
}

// RLS already scopes saved_views to owner_profile_id = auth.uid() — no need to
// filter by profile id client-side too, the server never returns anyone else's.
export function useSavedViews(page: string) {
  return useQuery({ queryKey: ['saved-views', page], queryFn: () => fetchSavedViews(page) })
}

export interface SaveViewInput {
  ownerProfileId: string
  name: string
  page: string
  scope: SavedViewScope
  scopeTarget: string | null
  filters: Record<string, unknown>
  isDefault?: boolean
}

export async function saveView(input: SaveViewInput): Promise<void> {
  const { error } = await supabase.from('saved_views').insert({
    owner_profile_id: input.ownerProfileId,
    name: input.name,
    page: input.page,
    scope: input.scope,
    scope_target: input.scopeTarget,
    filters: input.filters,
    is_default: input.isDefault ?? false,
  })
  if (error) throw new Error(error.message)
}

export async function setSavedViewDefault(id: string, page: string, ownerProfileId: string): Promise<void> {
  // Only one default per (owner, page) — the DB enforces this with a partial
  // unique index, so clear any existing default first.
  await supabase.from('saved_views').update({ is_default: false }).eq('page', page).eq('owner_profile_id', ownerProfileId).eq('is_default', true)
  const { error } = await supabase.from('saved_views').update({ is_default: true }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setSavedViewPinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from('saved_views').update({ pinned }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function renameSavedView(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('saved_views').update({ name }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteSavedView(id: string): Promise<void> {
  const { error } = await supabase.from('saved_views').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
