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

export async function createTenant(orgId: string, name: string, notes: string | null, actorId: string): Promise<string> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({ org_id: orgId, name, notes, created_by: actorId })
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
