// Saved views — "save view" + "set as default" only (sidebar pinning
// dropped, equal-admins model item f; setSavedViewPinned kept for schema
// completeness but no longer called from the UI). Same direct-Supabase +
// TanStack Query pattern as every other hook file.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SavedView, SavedViewScope } from '@/types'

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
