// 7.5-pre2 Session 5 — thin client wrapper over the `cs-sync-runner` Edge
// Function's scoped entry point (the Refresh button). Mirrors lib/
// provisioning.ts's invoke() pattern exactly — the function holds every
// secret and enforces super_admin + AAL2 itself; the browser only ever
// sends the user's own bearer (attached by supabase.functions.invoke) plus
// {orgId, recordType}.
import { supabase } from '@/lib/supabase'

export interface SyncRunResult {
  status: 'success' | 'partial' | 'failed' | 'locked'
  counts?: Record<string, number>
  skippedConnectors?: string[]
  error?: string
  runId?: string
  skippedCount?: number
}

// 7.5-pre2 Session 6 — the discovery sweep. Same entry point, but no
// account: it runs against the whole roster looking for customers nobody
// has added yet, and anything it can't place becomes an "Account match
// needed" item in Approvals.
export function runDiscoverySweep(windowDays = 7): Promise<SyncRunResult> {
  return invokeRunner({ recordType: 'discovery', windowDays })
}

export function refreshAccountRecordType(orgId: string, recordType: string): Promise<SyncRunResult> {
  return invokeRunner({ orgId, recordType })
}

async function invokeRunner(body: Record<string, unknown>): Promise<SyncRunResult> {
  const { data, error } = await supabase.functions.invoke('cs-sync-runner', { body })
  if (error) {
    let message = error.message
    try {
      const ctx = await (error as { context?: Response }).context?.json()
      if (ctx?.error) message = ctx.error
    } catch {
      /* keep the generic message */
    }
    return { status: 'failed', error: message }
  }
  return data as SyncRunResult
}
