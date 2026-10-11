// 7.5-pre2 Session 5 — the Account 360 "Refresh" affordance (previously 3
// disabled "Coming in 7.5" placeholders). One scoped call per record type;
// the Edge Function runs synchronously and returns the outcome counts
// directly — no polling needed for a single unit.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Tooltip } from '@/components/Tooltip'
import { formatDate } from '@/utils/formatDate'
import { refreshAccountRecordType } from '@/lib/syncRunner'
import { useSyncState } from '@/hooks'

interface RefreshButtonProps {
  orgId: string
  recordType: string
  label?: string
}

export function RefreshButton({ orgId, recordType, label }: RefreshButtonProps) {
  const qc = useQueryClient()
  const { data: state, refetch: refetchState } = useSyncState(orgId, recordType)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ status: string; counts?: Record<string, number>; skippedConnectors?: string[]; error?: string } | null>(null)

  async function onClick() {
    setRunning(true)
    setResult(null)
    try {
      const res = await refreshAccountRecordType(orgId, recordType)
      setResult(res)
      await refetchState()
      qc.invalidateQueries({ queryKey: ['account-action-items', orgId] })
      qc.invalidateQueries({ queryKey: ['tickets', orgId] })
      qc.invalidateQueries({ queryKey: ['engagements', orgId] })
    } finally {
      setRunning(false)
    }
  }

  const lastSynced = state?.lastSyncedAt ? formatDate(state.lastSyncedAt) : 'never'

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Last synced: {lastSynced}</span>
      <Tooltip content={`Sync ${label ?? recordType} from connected sources now`}>
        <button
          onClick={onClick}
          disabled={running}
          className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {running ? 'Syncing…' : 'Refresh'}
        </button>
      </Tooltip>
      {result && (
        <span className={result.status === 'failed' ? 'text-red-600' : result.status === 'locked' ? 'text-muted-foreground' : 'text-emerald-600'}>
          {result.status === 'locked' && 'Already running'}
          {result.status === 'failed' && `Failed: ${result.error}`}
          {(result.status === 'success' || result.status === 'partial') && (
            <>
              {Object.entries(result.counts ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'no changes'}
              {result.skippedConnectors?.length ? ` (skipped: ${result.skippedConnectors.join(', ')})` : ''}
            </>
          )}
        </span>
      )}
    </div>
  )
}
