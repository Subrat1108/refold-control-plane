// 7.4 — ingest_tokens list read. RLS select is is_super_admin(), no embed
// involved (no D-068 risk). Writes (create/revoke) go through the
// provisioning Edge Function — the table grants authenticated no insert/
// update at all.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface IngestToken {
  id: string
  label: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  allowedOrgIds: string[] | null
}

function mapIngestToken(row: Record<string, unknown>): IngestToken {
  return {
    id: row.id as string,
    label: row.label as string,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    revokedAt: (row.revoked_at as string) ?? null,
    lastUsedAt: (row.last_used_at as string) ?? null,
    allowedOrgIds: (row.allowed_org_ids as string[]) ?? null,
  }
}

async function fetchIngestTokens(): Promise<IngestToken[]> {
  const { data, error } = await supabase
    .from('ingest_tokens')
    .select('id, label, created_at, expires_at, revoked_at, last_used_at, allowed_org_ids')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapIngestToken)
}

export function useIngestTokens() {
  return useQuery({ queryKey: ['ingest-tokens'], queryFn: fetchIngestTokens })
}

export function ingestTokenStatus(token: IngestToken): 'active' | 'expired' | 'revoked' {
  if (token.revokedAt) return 'revoked'
  if (new Date(token.expiresAt) <= new Date()) return 'expired'
  return 'active'
}
