import { useState } from 'react'
import { Download } from 'lucide-react'
import { useAuditLog, auditLogToCsv, downloadCsv, useScope, useScopedAccountIds } from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { formatDate } from '@/utils/formatDate'
import type { AuditLogEntry } from '@/types'

const PAGE = 'audit-log'
const PAGE_SIZE = 50
const RECORD_TABLES = ['organizations', 'projects', 'milestones', 'accomplishments', 'risks', 'asks', 'escalations', 'tickets', 'engagements', 'metric_values', 'portfolio_notes', 'proposals', 'teams', 'team_members']
const ACTIONS = ['create', 'update', 'delete', 'approve', 'reject']

export function AuditLogPage() {
  const { scope, scopeTarget, setScope } = useScope(PAGE)
  const { data: scopedIds } = useScopedAccountIds(scope, scopeTarget)
  const [recordTable, setRecordTable] = useState('')
  const [action, setAction] = useState('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [page, setPage] = useState(0)

  const { data, isLoading, isError, refetch } = useAuditLog({
    recordTable: recordTable || undefined,
    action: action || undefined,
    since: since || undefined,
    until: until || undefined,
    orgIds: scope === 'everyone' ? null : scopedIds,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  function diffSummary(row: AuditLogEntry): string {
    if (!row.before && !row.after) return '—'
    if (!row.before) return 'new record'
    if (!row.after) return 'deleted'
    const changed = Object.keys(row.after).filter((k) => JSON.stringify(row.after?.[k]) !== JSON.stringify(row.before?.[k]) && k !== 'updated_by' && k !== 'created_at')
    return changed.length ? changed.join(', ') : '—'
  }

  const columns: Column<AuditLogEntry>[] = [
    { key: 'when', header: 'When', render: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span> },
    { key: 'who', header: 'Who', render: (r) => <span>{r.actorName ?? r.onBehalfOf ?? 'system'}</span> },
    { key: 'action', header: 'Action', render: (r) => <span className="capitalize">{r.action.replace(/_/g, ' ')}</span> },
    { key: 'record', header: 'Record', render: (r) => <span className="text-muted-foreground">{r.recordTable ?? '—'}</span> },
    { key: 'account', header: 'Account', render: (r) => <span className="text-muted-foreground">{r.accountName ?? '—'}</span> },
    { key: 'diff', header: 'Changed fields', render: (r) => <span className="text-xs text-muted-foreground">{diffSummary(r)}</span> },
  ]

  const rows = data?.rows ?? []
  const total = data?.count ?? 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Every change, enforced by database triggers — nothing bypasses it.</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={recordTable} onChange={(e) => { setRecordTable(e.target.value); setPage(0) }} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">All tables</option>
            {RECORD_TABLES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(0) }} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" value={since} onChange={(e) => { setSince(e.target.value); setPage(0) }} className="rounded-md border border-border px-2 py-1.5 text-sm" />
          <input type="date" value={until} onChange={(e) => { setUntil(e.target.value); setPage(0) }} className="rounded-md border border-border px-2 py-1.5 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <ScopeSwitcher scope={scope} scopeTarget={scopeTarget} onChange={setScope} />
          <button
            onClick={() => downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, auditLogToCsv(rows))}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
          <DataTable columns={columns} data={rows} rowKey={(r) => r.id} emptyTitle="No activity in this scope/filter" />
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
