import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useSupabaseAuth,
  useProposals,
  useCurrentRow,
  approveProposal,
  rejectProposal,
  useScope,
  useScopedAccountIds,
} from '@/hooks'
import { SourceBadge } from '@/components/SourceBadge'
import { Modal } from '@/components/Modal'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { SavedViewsMenu } from '@/components/SavedViewsMenu'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { formatDate } from '@/utils/formatDate'
import type { ProposalRow, SavedView } from '@/types'

const PAGE = 'approvals'
const TARGET_TABLES = ['milestones', 'accomplishments', 'risks', 'escalations', 'tickets', 'metric_values', 'organizations']

export function ApprovalsPage() {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { scope, scopeTarget, setScope } = useScope(PAGE)
  const { data: scopedIds } = useScopedAccountIds(scope, scopeTarget)
  const [targetTable, setTargetTable] = useState('')
  const [source, setSource] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editTarget, setEditTarget] = useState<ProposalRow | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ProposalRow | null>(null)

  const { data: proposals, isLoading, isError, refetch } = useProposals({
    targetTable: targetTable || undefined,
    source: source || undefined,
    orgIds: scope === 'everyone' ? null : scopedIds,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['proposals'] })
    qc.invalidateQueries({ queryKey: ['pending-proposal-count'] })
  }

  function applyView(v: SavedView) {
    setScope(v.scope, v.scopeTarget)
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleApprove(p: ProposalRow) {
    if (!profile) return
    await approveProposal(p.id, profile.id)
    refresh()
  }

  async function handleBulkApprove() {
    if (!profile) return
    for (const id of selected) await approveProposal(id, profile.id)
    setSelected(new Set())
    refresh()
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review and act on pending proposals from every source.</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={targetTable} onChange={(e) => setTargetTable(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">All types</option>
            {TARGET_TABLES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">All sources</option>
            <option value="manual">Manual</option>
            <option value="agent">Agent</option>
            <option value="chat">Chat</option>
            <option value="api">API</option>
            <option value="file">File</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ScopeSwitcher scope={scope} scopeTarget={scopeTarget} onChange={setScope} />
          <SavedViewsMenu page={PAGE} currentScope={scope} currentScopeTarget={scopeTarget} currentFilters={{ targetTable, source }} onApply={applyView} />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm text-foreground">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={handleBulkApprove} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">Approve selected</button>
            <button onClick={() => setSelected(new Set())} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">Clear</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (proposals ?? []).length === 0 ? (
        <EmptyState title="Nothing pending" description="All caught up — no proposals waiting for a decision in this scope." />
      ) : (
        <div className="space-y-3">
          {(proposals ?? []).map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              checked={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
              onApprove={() => handleApprove(p)}
              onEdit={() => setEditTarget(p)}
              onReject={() => setRejectTarget(p)}
            />
          ))}
        </div>
      )}

      <EditThenApproveModal proposal={editTarget} onClose={() => setEditTarget(null)} onDone={refresh} />
      <RejectModal proposal={rejectTarget} onClose={() => setRejectTarget(null)} onDone={refresh} />
    </div>
  )
}

function ProposalCard({ proposal, checked, onToggle, onApprove, onEdit, onReject }: {
  proposal: ProposalRow; checked: boolean; onToggle: () => void; onApprove: () => void; onEdit: () => void; onReject: () => void
}) {
  const { data: currentRow } = useCurrentRow(proposal.targetTable, proposal.operation === 'create' ? null : proposal.targetId)
  const payloadKeys = Object.keys(proposal.payload)

  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />
          <div>
            <p className="text-sm font-semibold text-foreground capitalize">{proposal.operation} · {proposal.targetTable.replace(/_/g, ' ')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{proposal.accountName ?? 'Unknown account'} · proposed by {proposal.proposedBy} · {formatDate(proposal.createdAt)}</p>
          </div>
        </div>
        <SourceBadge source={proposal.source} verifiedAt={null} />
      </div>

      {proposal.evidenceUrl && (
        <p className="text-xs text-muted-foreground">
          Evidence: <a href={proposal.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{proposal.evidenceUrl}</a>
          {proposal.evidenceExcerpt && <span> — "{proposal.evidenceExcerpt}"</span>}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {proposal.operation !== 'create' && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Current</p>
            {currentRow ? Object.entries(currentRow).map(([k, v]) => <p key={k} className="text-muted-foreground">{k}: {String(v ?? '—')}</p>) : <p className="text-muted-foreground">—</p>}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{proposal.operation === 'delete' ? 'Will be deleted' : 'Proposed'}</p>
          {proposal.operation === 'delete' ? <p className="text-muted-foreground">(entire record)</p> : payloadKeys.length === 0 ? <p className="text-muted-foreground">—</p> : (
            payloadKeys.map((k) => <p key={k} className="text-foreground">{k}: {String(proposal.payload[k])}</p>)
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-border">
        <button onClick={onApprove} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">Approve</button>
        {proposal.operation !== 'delete' && <button onClick={onEdit} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Edit then approve</button>}
        <button onClick={onReject} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Reject</button>
      </div>
    </div>
  )
}

function EditThenApproveModal({ proposal, onClose, onDone }: { proposal: ProposalRow | null; onClose: () => void; onDone: () => void }) {
  const { profile } = useSupabaseAuth()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (proposal) setValues(Object.fromEntries(Object.entries(proposal.payload).map(([k, v]) => [k, String(v)])))
  }, [proposal])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!proposal || !profile) return
    setBusy(true)
    try {
      await approveProposal(proposal.id, profile.id, values)
      setValues({})
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!proposal} onClose={() => { setValues({}); onClose() }} title="Edit then approve">
      {proposal && (
        <form onSubmit={submit} className="space-y-4">
          {Object.keys(values).map((k) => (
            <div key={k}>
              <label className="block text-sm font-medium text-foreground mb-1.5 capitalize">{k.replace(/_/g, ' ')}</label>
              <input value={values[k]} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </div>
          ))}
          <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">{busy ? 'Approving…' : 'Approve with these values'}</button>
        </form>
      )}
    </Modal>
  )
}

function RejectModal({ proposal, onClose, onDone }: { proposal: ProposalRow | null; onClose: () => void; onDone: () => void }) {
  const { profile } = useSupabaseAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!proposal || !profile || !reason.trim()) return
    setBusy(true)
    try {
      await rejectProposal(proposal.id, profile.id, reason.trim())
      setReason('')
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!proposal} onClose={() => { setReason(''); onClose() }} title="Reject proposal">
      {proposal && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required className="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="Why is this being rejected?" />
          </div>
          <button type="submit" disabled={busy || !reason.trim()} className="w-full rounded-md bg-red-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40">{busy ? 'Rejecting…' : 'Reject'}</button>
        </form>
      )}
    </Modal>
  )
}

