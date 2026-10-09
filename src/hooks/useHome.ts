// Home ("my day") — Part 2 of the equal-admins model. Same direct-Supabase +
// TanStack Query pattern as every other hook file. Each query fetches across
// every account (small admin-panel scale, same approach as usePortfolio.ts's
// board aggregates) — the page itself filters by the current scope's org-id
// list client-side.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface MilestoneDue {
  id: string
  orgId: string
  accountName: string | null
  description: string
  period: string
  overdue: boolean
}

async function fetchMilestonesDue(): Promise<MilestoneDue[]> {
  const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('milestones')
    .select('id, org_id, description, period, status, organizations!milestones_org_id_fkey(name)')
    .neq('status', 'done')
    .lte('period', in7Days)
    .order('period', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    accountName: (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations)?.name ?? null,
    description: row.description,
    period: row.period,
    overdue: row.period < today,
  }))
}

export function useMilestonesDue() {
  return useQuery({ queryKey: ['milestones-due'], queryFn: fetchMilestonesDue })
}

export interface EscalationOpen {
  id: string
  orgId: string
  accountName: string | null
  title: string
  severity: string
}

async function fetchOpenEscalationsAll(): Promise<EscalationOpen[]> {
  const { data, error } = await supabase
    .from('escalations')
    .select('id, org_id, title, severity, status, organizations!escalations_org_id_fkey(name)')
    .not('status', 'in', '(resolved,closed)')
    .order('raised_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    accountName: (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations)?.name ?? null,
    title: row.title,
    severity: row.severity,
  }))
}

export function useOpenEscalationsAll() {
  return useQuery({ queryKey: ['open-escalations-all'], queryFn: fetchOpenEscalationsAll })
}

export interface TicketOpen {
  id: string
  orgId: string
  accountName: string | null
  title: string
  priority: string
}

async function fetchOpenP1P2Tickets(): Promise<TicketOpen[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, org_id, title, priority, status, organizations!tickets_org_id_fkey(name)')
    .in('priority', ['p1', 'p2'])
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    accountName: (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations)?.name ?? null,
    title: row.title,
    priority: row.priority,
  }))
}

export function useOpenP1P2Tickets() {
  return useQuery({ queryKey: ['open-p1-p2-tickets'], queryFn: fetchOpenP1P2Tickets })
}

// "Activity in the last 24h" per account — a true before/after health diff
// isn't queryable without history tracking, so this is the honest, available
// proxy: did ANYTHING on this account's audit trail change recently.
async function fetchRecentActivityOrgIds(): Promise<Set<string>> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { data, error } = await supabase.from('audit_log').select('org_id').gte('created_at', since).not('org_id', 'is', null)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.org_id as string))
}

export function useRecentActivityOrgIds() {
  return useQuery({ queryKey: ['recent-activity-org-ids'], queryFn: fetchRecentActivityOrgIds })
}
