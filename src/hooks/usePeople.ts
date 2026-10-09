// Equal-admins model — account_roles (per-account role tag, record-keeping
// only, with history) + reports_to (optional, UX-only) + the scope helpers
// built on both. Supersedes useTeamStructure.ts's teams/account_assignments
// exports. Same direct-Supabase + TanStack Query pattern as every other hook
// file in this project.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AccountRoleRow, AssignmentRole, ManagedUser, SavedViewScope } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstOf<T>(v: any): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

// ── Account roles ────────────────────────────────────────────────────────

async function fetchAccountRoles(orgId: string): Promise<AccountRoleRow[]> {
  // Explicit FK hint (D-068): account_roles has only one relationship to
  // profiles today (profile_id), but every embed touching profiles gets the
  // hint on principle.
  const { data, error } = await supabase
    .from('account_roles')
    .select('id, org_id, profile_id, role, started_at, ended_at, profiles!account_roles_profile_id_fkey(full_name)')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    accountName: null,
    profileId: row.profile_id,
    profileName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    role: row.role,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }))
}

export function useAccountRoles(orgId: string | null) {
  return useQuery({ queryKey: ['account-roles', orgId], queryFn: () => fetchAccountRoles(orgId!), enabled: !!orgId })
}

// Per-person view (joins the account name instead) — the People directory's
// "active account roles, editable inline" per row.
async function fetchPersonRoles(profileId: string): Promise<AccountRoleRow[]> {
  const { data, error } = await supabase
    .from('account_roles')
    .select('id, org_id, profile_id, role, started_at, ended_at, organizations!account_roles_org_id_fkey(name)')
    .eq('profile_id', profileId)
    .order('started_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    accountName: firstOf<{ name: string }>(row.organizations)?.name ?? null,
    profileId: row.profile_id,
    profileName: null,
    role: row.role,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }))
}

export function usePersonRoles(profileId: string | null) {
  return useQuery({ queryKey: ['person-roles', profileId], queryFn: () => fetchPersonRoles(profileId!), enabled: !!profileId })
}

async function fetchMyActiveAccountIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('my_account_ids')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: { my_account_ids: string }) => r.my_account_ids)
}

export function useMyActiveAccountIds() {
  return useQuery({ queryKey: ['my-active-account-ids'], queryFn: fetchMyActiveAccountIds })
}

// "Add to my accounts" / the People directory's inline add. A second active
// role for the same (profile, org) is rejected by the DB's partial unique
// index — the caller should end the current one first (changeRole) rather
// than call this twice.
export async function addRole(orgId: string, profileId: string, role: AssignmentRole): Promise<void> {
  const { error } = await supabase.from('account_roles').insert({ org_id: orgId, profile_id: profileId, role })
  if (error) throw new Error(error.message)
}

// "Leave account" — ends the role, never deletes it (RLS has no delete
// policy on account_roles at all; history is permanent).
export async function endRole(id: string): Promise<void> {
  const { error } = await supabase.from('account_roles').update({ ended_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Changing someone's role on an account = end the current active row +
// insert the new one, as one call — never an in-place role swap, so the
// history stays accurate (who held which role, and for how long).
export async function changeRole(currentId: string, orgId: string, profileId: string, newRole: AssignmentRole): Promise<void> {
  await endRole(currentId)
  await addRole(orgId, profileId, newRole)
}

// ── reports_to / People directory ───────────────────────────────────────

export interface PersonRow extends ManagedUser {
  reportsToName: string | null
  activeRoleCount: number
}

async function fetchPeopleDirectory(): Promise<PersonRow[]> {
  // PostgREST can't embed a self-referential FK here even with an explicit
  // !fkey hint (profiles has two self-FKs — created_by and reports_to — and
  // the hint it itself suggests on the ambiguity error still 400s; a known
  // PostgREST limitation with self-joins, confirmed by direct inspection,
  // not a query-writing mistake). Resolved client-side instead: fetch the
  // rows plain, then look up each reports_to id's name from the same result
  // set (every super_admin is already in it).
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, account_type, role, status, sub_role_id, created_at, reports_to, account_roles(count)')
    .eq('account_type', 'super_admin')
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  const nameById = new Map(rows.map((r) => [r.id, r.full_name as string | null]))
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    accountType: row.account_type,
    role: row.role,
    status: row.status,
    subRoleId: row.sub_role_id,
    subRoleName: null,
    createdAt: row.created_at,
    reportsTo: row.reports_to,
    reportsToName: row.reports_to ? nameById.get(row.reports_to) ?? null : null,
    activeRoleCount: firstOf<{ count: number }>(row.account_roles)?.count ?? 0,
  }))
}

export function usePeopleDirectory() {
  return useQuery({ queryKey: ['people-directory'], queryFn: fetchPeopleDirectory })
}

async function fetchHasReports(profileId: string): Promise<boolean> {
  const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('reports_to', profileId)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

export function useHasReports(profileId: string | null) {
  return useQuery({ queryKey: ['has-reports', profileId], queryFn: () => fetchHasReports(profileId!), enabled: !!profileId })
}

async function fetchMyReports(profileId: string): Promise<{ id: string; fullName: string | null }[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('reports_to', profileId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ id: r.id, fullName: r.full_name }))
}

export function useMyReports(profileId: string | null) {
  return useQuery({ queryKey: ['my-reports', profileId], queryFn: () => fetchMyReports(profileId!), enabled: !!profileId })
}

// ── People activity (equal-admins model Part 4) — raw signals only, no
// scores/KPIs (those stay deferred per D-085's Parked note). ───────────────

export interface PersonActivityRow {
  id: string
  action: string
  recordTable: string | null
  createdAt: string
}

async function fetchPersonActivity(profileId: string, limit = 10): Promise<PersonActivityRow[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, record_table, created_at')
    .eq('actor_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ id: row.id, action: row.action, recordTable: row.record_table, createdAt: row.created_at }))
}

export function usePersonActivity(profileId: string | null) {
  return useQuery({ queryKey: ['person-activity', profileId], queryFn: () => fetchPersonActivity(profileId!), enabled: !!profileId })
}

// ── Scope helpers (focus only, never access control) ───────────────────────
// "Mine"/"My accounts" / "My team" (reports-based) / "Everyone" / a specific
// person — every super admin can already see everything via the blanket
// is_super_admin() RLS; these just narrow what a list screen SHOWS.
// 'team_id' (a specific OTHER team) no longer exists — there are no teams.

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
  return []
}

export function useScopedAccountIds(scope: SavedViewScope, scopeTarget: string | null) {
  return useQuery({
    queryKey: ['scoped-account-ids', scope, scopeTarget],
    queryFn: () => resolveScopeAccountIds(scope, scopeTarget),
  })
}
