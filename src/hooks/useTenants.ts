// 7.5-pre2 Session 1 — tenants + account_sources. Direct-client reads/writes
// under RLS (is_super_admin() + is_aal2() for writes), same pattern as
// projects (usePortfolio.ts) — not proposal-mediated, since these are
// structural/directory entities, not CS facts needing human review.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tenant, AccountSource, AccountSourceType } from '@/types'

function mapTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    notes: (row.notes as string) ?? null,
    clusterName: (row.cluster_name as string) ?? null,
    namespaceName: (row.namespace_name as string) ?? null,
    refoldOrgId: (row.refold_org_id as string) ?? null,
    linkedAccountId: (row.linked_account_id as string) ?? null,
    createdAt: row.created_at as string,
  }
}

function mapAccountSource(row: Record<string, unknown>): AccountSource {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    tenantId: (row.tenant_id as string) ?? null,
    sourceType: row.source_type as AccountSourceType,
    value: row.value as string,
    notes: (row.notes as string) ?? null,
    createdAt: row.created_at as string,
  }
}

async function fetchTenants(orgId: string): Promise<Tenant[]> {
  const { data, error } = await supabase.from('tenants').select('*').eq('org_id', orgId).order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapTenant)
}

export function useTenants(orgId: string | null) {
  return useQuery({ queryKey: ['tenants', orgId], queryFn: () => fetchTenants(orgId!), enabled: !!orgId })
}

export interface TenantLocation {
  clusterName?: string | null
  namespaceName?: string | null
  refoldOrgId?: string | null
  linkedAccountId?: string | null
}

export async function createTenant(orgId: string, name: string, notes: string | null, actorId: string, location: TenantLocation = {}): Promise<string> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({
      org_id: orgId,
      name,
      notes,
      created_by: actorId,
      cluster_name: location.clusterName ?? null,
      namespace_name: location.namespaceName ?? null,
      refold_org_id: location.refoldOrgId ?? null,
      linked_account_id: location.linkedAccountId ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function deleteTenant(id: string): Promise<void> {
  const { error } = await supabase.from('tenants').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

async function fetchAccountSources(orgId: string): Promise<AccountSource[]> {
  const { data, error } = await supabase.from('account_sources').select('*').eq('org_id', orgId).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapAccountSource)
}

export function useAccountSources(orgId: string | null) {
  return useQuery({ queryKey: ['account-sources', orgId], queryFn: () => fetchAccountSources(orgId!), enabled: !!orgId })
}

export async function createAccountSource(
  orgId: string,
  tenantId: string | null,
  sourceType: AccountSourceType,
  value: string,
  actorId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('account_sources')
    .insert({ org_id: orgId, tenant_id: tenantId, source_type: sourceType, value, created_by: actorId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function deleteAccountSource(id: string): Promise<void> {
  const { error } = await supabase.from('account_sources').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Every account with its tenants, in one fetch — so a picker can show the
// real hierarchy instead of a flat list in which an account and a tenant
// look identical. `useTenants` stays for the single-account case.
export interface AccountTreeNode {
  id: string
  name: string
  deploymentType: string | null
  deploymentModel: string | null
  tenants: { id: string; name: string }[]
}

async function fetchAccountTree(): Promise<AccountTreeNode[]> {
  const [{ data: orgs, error: orgErr }, { data: tenants, error: tenErr }] = await Promise.all([
    supabase.from('organizations').select('id, name, deployment_type, deployment_model').neq('deployment_type', 'internal').order('name'),
    supabase.from('tenants').select('id, org_id, name').order('name'),
  ])
  if (orgErr) throw new Error(orgErr.message)
  if (tenErr) throw new Error(tenErr.message)

  const byOrg = new Map<string, { id: string; name: string }[]>()
  for (const t of tenants ?? []) {
    const list = byOrg.get(t.org_id as string) ?? []
    list.push({ id: t.id as string, name: t.name as string })
    byOrg.set(t.org_id as string, list)
  }
  return (orgs ?? []).map((o) => ({
    id: o.id as string,
    name: o.name as string,
    deploymentType: (o.deployment_type as string) ?? null,
    deploymentModel: (o.deployment_model as string) ?? null,
    tenants: byOrg.get(o.id as string) ?? [],
  }))
}

export function useAccountTree() {
  return useQuery({ queryKey: ['account-tree'], queryFn: fetchAccountTree })
}

// A tenant's own details. Everything except its parent, which needs the
// atomic move below.
export interface UpdateTenantInput {
  name?: string
  notes?: string | null
  clusterName?: string | null
  namespaceName?: string | null
  refoldOrgId?: string | null
  linkedAccountId?: string | null
}

export async function updateTenant(id: string, patch: UpdateTenantInput): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.clusterName !== undefined) update.cluster_name = patch.clusterName
  if (patch.namespaceName !== undefined) update.namespace_name = patch.namespaceName
  if (patch.refoldOrgId !== undefined) update.refold_org_id = patch.refoldOrgId
  if (patch.linkedAccountId !== undefined) update.linked_account_id = patch.linkedAccountId
  if (Object.keys(update).length === 0) return
  const { error } = await supabase.from('tenants').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}

// Re-parent a tenant. NOT a plain update: twelve tables carry tenant_id
// beside org_id, so the tenant and all of its records must move together or
// the records end up filed under an account the tenant no longer belongs to.
// move_tenant() does both halves in one transaction and returns how many
// rows followed.
export async function moveTenant(tenantId: string, newOrgId: string): Promise<number> {
  const { data, error } = await supabase.rpc('move_tenant', { p_tenant_id: tenantId, p_new_org_id: newOrgId })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}
