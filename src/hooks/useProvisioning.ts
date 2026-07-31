// Phase 6.4a — Postgres-backed reads for the admin RBAC/provisioning UIs.
// These hit real tables under RLS (super_admin can read all profiles / invitations
// / sub_roles), distinct from the still-mock metrics hooks (D-027/D-033).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AccountType, Invitation, ManagedUser, SubRole } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapManagedUser(row: any): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    accountType: row.account_type,
    role: row.role,
    status: row.status,
    subRoleId: row.sub_role_id,
    subRoleName: firstOf<{ name: string }>(row.sub_roles)?.name ?? null,
    createdAt: row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstOf<T>(v: any): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

async function fetchSuperAdmins(): Promise<ManagedUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, account_type, role, status, sub_role_id, created_at, sub_roles(name)')
    .eq('account_type', 'super_admin')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapManagedUser)
}

export function useSuperAdmins() {
  return useQuery({ queryKey: ['super-admins'], queryFn: fetchSuperAdmins })
}

// Owner view: users in the caller's own org (RLS scopes to current_org_id()).
async function fetchOrgUsers(): Promise<ManagedUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, account_type, role, status, sub_role_id, created_at, sub_roles(name)')
    .neq('account_type', 'super_admin')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapManagedUser)
}

export function useOrgUsers() {
  return useQuery({ queryKey: ['org-users'], queryFn: fetchOrgUsers })
}

async function fetchSubRoles(accountType: AccountType): Promise<SubRole[]> {
  const { data, error } = await supabase
    .from('sub_roles')
    .select('id, account_type, org_id, name, permissions, is_system')
    .eq('account_type', accountType)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    accountType: row.account_type,
    orgId: row.org_id,
    name: row.name,
    permissions: row.permissions ?? {},
    isSystem: row.is_system,
  }))
}

// Admin sub-role assignment uses the system (is_system) super_admin sub-roles.
export function useSubRoles(accountType: AccountType) {
  return useQuery({ queryKey: ['sub-roles', accountType], queryFn: () => fetchSubRoles(accountType) })
}

async function fetchPendingInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, org_id, account_type, role, status, created_at, expires_at, organizations(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    email: row.email,
    orgId: row.org_id,
    accountType: row.account_type,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    orgName: firstOf<{ name: string }>(row.organizations)?.name ?? null,
  }))
}

// Optionally scoped to a deployment type so the cloud / on-prem customer pages
// show only their own pending invites.
export function usePendingInvitations(deploymentType?: 'cloud' | 'on_premise') {
  return useQuery({
    queryKey: ['pending-invitations', deploymentType ?? 'all'],
    queryFn: async () => {
      const all = await fetchPendingInvitations()
      if (!deploymentType) return all
      const wanted: AccountType = deploymentType === 'cloud' ? 'cloud_customer' : 'onprem_customer'
      return all.filter((i) => i.accountType === wanted)
    },
  })
}

// ── owner-defined org sub-roles (6.4b, D-045) ─────────────────────────────────
// Owners create/edit their OWN org's non-system sub-roles via the DIRECT client;
// RLS (sub_roles_owner_insert/update) enforces org + non-system + AAL2 scoping,
// so these need no Edge Function. Reads come from useSubRoles(accountType) and
// are filtered to this org client-side in the UI.
export interface OrgSubRoleInput {
  accountType: AccountType
  orgId: string
  name: string
  permissions: Record<string, boolean>
}

export async function createOrgSubRole(input: OrgSubRoleInput): Promise<void> {
  const { error } = await supabase.from('sub_roles').insert({
    account_type: input.accountType,
    org_id: input.orgId,
    name: input.name,
    permissions: input.permissions,
    is_system: false,
  })
  if (error) throw new Error(error.message)
}

export async function updateOrgSubRole(
  id: string,
  patch: { name?: string; permissions?: Record<string, boolean> },
): Promise<void> {
  const { error } = await supabase.from('sub_roles').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
