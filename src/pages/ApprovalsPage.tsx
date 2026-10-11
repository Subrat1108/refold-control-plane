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
  useAccountResolutions,
  useAccountsRaw,
  useSegments,
  useTenants,
} from '@/hooks'
import { resolveAccountProposal } from '@/lib/provisioning'
import { SourceBadge } from '@/components/SourceBadge'
import { Modal } from '@/components/Modal'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { SavedViewsMenu } from '@/components/SavedViewsMenu'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { formatDate } from '@/utils/formatDate'
import type { AccountResolutionRow, ProposalRow, SavedView } from '@/types'

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
  const [resolveTarget, setResolveTarget] = useState<AccountResolutionRow | null>(null)

  const { data: proposals, isLoading, isError, refetch } = useProposals({
    targetTable: targetTable || undefined,
    source: source || undefined,
    orgIds: scope === 'everyone' ? null : scopedIds,
  })
  const { data: resolutions } = useAccountResolutions()

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['proposals'] })
    qc.invalidateQueries({ queryKey: ['pending-proposal-count'] })
    qc.invalidateQueries({ queryKey: ['account-resolutions'] })
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

      {(resolutions ?? []).length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Account match needed ({resolutions!.length})</h2>
          <div className="space-y-2">
            {resolutions!.map((r) => (
              <div key={r.id} className="bg-white rounded-lg border border-amber-200 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    "{r.observedName}" {r.scope === 'tenant' ? <>— a possible tenant of <span className="font-semibold">{r.knownOrgName ?? 'unknown account'}</span></> : '— unrecognized account'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.heldCount} record{r.heldCount === 1 ? '' : 's'} waiting · first seen {formatDate(r.createdAt)}
                    {r.candidates.length > 0 && <> · candidates: {r.candidates.map((c) => `${c.name} (${Math.round(c.confidence * 100)}%)`).join(', ')}</>}
                  </p>
                </div>
                <button onClick={() => setResolveTarget(r)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 whitespace-nowrap">Resolve</button>
              </div>
            ))}
          </div>
        </div>
      )}

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
      <ResolveAccountModal resolution={resolveTarget} onClose={() => setResolveTarget(null)} onDone={refresh} />
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

type ResolveDecision = 'map_existing' | 'map_tenant' | 'create_account' | 'ignore'

function ResolveAccountModal({ resolution, onClose, onDone }: { resolution: AccountResolutionRow | null; onClose: () => void; onDone: () => void }) {
  const { data: accounts } = useAccountsRaw()
  const { data: segments } = useSegments()
  const [decision, setDecision] = useState<ResolveDecision>('map_existing')
  const [orgId, setOrgId] = useState('')
  const { data: tenants } = useTenants(orgId || null)
  const [tenantId, setTenantId] = useState('')
  const [newTenantName, setNewTenantName] = useState('')
  const [newAccountName, setNewAccountName] = useState('')
  const [segmentId, setSegmentId] = useState('')
  const [lifecycleStage, setLifecycleStage] = useState('prospect')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (resolution) {
      setDecision('map_existing')
      setOrgId(resolution.scope === 'tenant' ? resolution.knownOrgId ?? '' : '')
      setTenantId('')
      setNewTenantName('')
      setNewAccountName(resolution.observedName)
      setSegmentId('')
      setLifecycleStage('prospect')
      setError('')
    }
  }, [resolution])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!resolution) return
    setBusy(true)
    setError('')
    try {
      if (decision === 'map_existing') {
        if (!orgId) throw new Error('Choose an account')
        await resolveAccountProposal({ resolutionId: resolution.id, decision, orgId })
      } else if (decision === 'map_tenant') {
        if (!orgId) throw new Error('Choose an account')
        if (!tenantId && !newTenantName.trim()) throw new Error('Choose an existing tenant or name a new one')
        await resolveAccountProposal({ resolutionId: resolution.id, decision, orgId, tenantId: tenantId || undefined, newTenantName: tenantId ? undefined : newTenantName.trim() })
      } else if (decision === 'create_account') {
        if (!newAccountName.trim()) throw new Error('Account name is required')
        await resolveAccountProposal({ resolutionId: resolution.id, decision, name: newAccountName.trim(), segmentId: segmentId || null, lifecycleStage })
      } else {
        await resolveAccountProposal({ resolutionId: resolution.id, decision: 'ignore' })
      }
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!resolution} onClose={onClose} title="Resolve account match">
      {resolution && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            "{resolution.observedName}" — {resolution.heldCount} record{resolution.heldCount === 1 ? '' : 's'} waiting.
            {resolution.scope === 'tenant' && <> Seen as a possible tenant of <span className="font-medium text-foreground">{resolution.knownOrgName}</span>.</>}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {([
              ['map_existing', 'Map to existing account'],
              ['map_tenant', 'Map as tenant of…'],
              ['create_account', 'Create new account'],
              ['ignore', 'Ignore — not a customer'],
            ] as [ResolveDecision, string][]).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setDecision(value)} className={`text-left rounded-md border px-3 py-2 text-xs font-medium transition-colors ${decision === value ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {label}
              </button>
            ))}
          </div>

          {decision === 'map_existing' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Account</label>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
                <option value="">Choose…</option>
                {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {decision === 'map_tenant' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Account</label>
                <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setTenantId('') }} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
                  <option value="">Choose…</option>
                  {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {orgId && (tenants ?? []).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Existing tenant</label>
                  <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); if (e.target.value) setNewTenantName('') }} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
                    <option value="">None — create new below</option>
                    {(tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {!tenantId && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">New tenant name</label>
                  <input value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} placeholder={resolution.observedName} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                </div>
              )}
            </div>
          )}

          {decision === 'create_account' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Account name</label>
                <input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Segment <span className="text-muted-foreground font-normal">(optional)</span></label>
                <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
                  <option value="">—</option>
                  {(segments ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Lifecycle stage</label>
                <select value={lifecycleStage} onChange={(e) => setLifecycleStage(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
                  <option value="prospect">Prospect</option>
                  <option value="poc">POC</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="live">Live</option>
                </select>
              </div>
            </div>
          )}

          {decision === 'ignore' && (
            <p className="text-sm text-muted-foreground">
              Every record waiting on this will be discarded, and "{resolution.observedName}" will be added to the ignore list so it never re-proposes itself.
            </p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? 'Resolving…' : 'Resolve'}
          </button>
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

