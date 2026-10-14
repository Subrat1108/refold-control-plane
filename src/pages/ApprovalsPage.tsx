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
  useHeldRecords,
  useAccountsRaw,
  useSegments,
  useTenants,
} from '@/hooks'
import { resolveAccountProposal, reassignProposal } from '@/lib/provisioning'
import { createAccount } from '@/hooks/usePortfolio'
import { SourceBadge } from '@/components/SourceBadge'
import { Modal } from '@/components/Modal'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { SavedViewsMenu } from '@/components/SavedViewsMenu'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { formatDate } from '@/utils/formatDate'
import type { AccountResolutionRow, ProposalRow, SavedView } from '@/types'
import type { HeldRecordRow } from '@/hooks/useApprovals'

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
  const [moveTarget, setMoveTarget] = useState<HeldRecordRow | null>(null)
  const [moveProposalTarget, setMoveProposalTarget] = useState<ProposalRow | null>(null)

  const { data: proposals, isLoading, isError, refetch } = useProposals({
    targetTable: targetTable || undefined,
    source: source || undefined,
    orgIds: scope === 'everyone' ? null : scopedIds,
  })
  const { data: resolutions } = useAccountResolutions()
  const { data: heldRecords } = useHeldRecords()

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['proposals'] })
    qc.invalidateQueries({ queryKey: ['pending-proposal-count'] })
    qc.invalidateQueries({ queryKey: ['account-resolutions'] })
    qc.invalidateQueries({ queryKey: ['held-records'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
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
        <p className="text-sm text-muted-foreground mt-0.5">
          <span className="font-medium">Accounts</span> decides what an unrecognised name is. <span className="font-medium">Details</span> is every record waiting —
          each shows the account it will be filed under, and you can change it.
        </p>
      </div>

      {(resolutions ?? []).length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Accounts · match needed ({resolutions!.length})</h2>
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

      <h2 className="text-sm font-semibold text-foreground pt-2">Details · records waiting</h2>

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

      {(heldRecords ?? []).length > 0 && (
        <div className="space-y-3">
          {heldRecords!.map((h) => (
            <HeldRecordCard key={h.id} record={h} onMove={() => setMoveTarget(h)} />
          ))}
        </div>
      )}

      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (proposals ?? []).length === 0 && (heldRecords ?? []).length === 0 ? (
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
              onMoveAccount={() => setMoveProposalTarget(p)}
            />
          ))}
        </div>
      )}

      <EditThenApproveModal proposal={editTarget} onClose={() => setEditTarget(null)} onDone={refresh} />
      <RejectModal proposal={rejectTarget} onClose={() => setRejectTarget(null)} onDone={refresh} />
      <ResolveAccountModal resolution={resolveTarget} onClose={() => setResolveTarget(null)} onDone={refresh} />
      <MoveAccountModal
        held={moveTarget}
        proposal={moveProposalTarget}
        onClose={() => { setMoveTarget(null); setMoveProposalTarget(null) }}
        onDone={refresh}
      />
    </div>
  )
}

function ProposalCard({ proposal, checked, onToggle, onApprove, onEdit, onReject, onMoveAccount }: {
  proposal: ProposalRow; checked: boolean; onToggle: () => void; onApprove: () => void; onEdit: () => void; onReject: () => void; onMoveAccount: () => void
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
            <p className="text-xs text-muted-foreground mt-0.5">
              {proposal.accountName ?? 'Unknown account'}
              {' '}
              <button onClick={onMoveAccount} className="text-primary hover:underline font-medium">change</button>
              {' '}· proposed by {proposal.proposedBy} · {formatDate(proposal.createdAt)}
            </p>
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


// A held record, shown in full for the first time. Previously these were a
// bare count on their resolution, so "ignore" could silently bin a record
// that belonged to a real account. Now you read it, then decide.
function HeldRecordCard({ record, onMove }: { record: HeldRecordRow; onMove: () => void }) {
  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-3 border-l-4 border-amber-400">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground capitalize">{record.recordType.replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            proposed by {record.proposedBy} · {formatDate(record.createdAt)}
          </p>
        </div>
        <SourceBadge source={record.source as ProposalRow['source']} verifiedAt={null} />
      </div>

      <p className="text-sm text-foreground">{record.summary}</p>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-border">
        <p className="text-xs text-muted-foreground pt-2">
          Account:{' '}
          <span className="font-medium text-amber-700">
            not set — seen as "{record.observedName ?? 'an unrecognised name'}"
          </span>
        </p>
        <button onClick={onMove} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">
          Set account
        </button>
      </div>
    </div>
  )
}

// One modal for both shapes: a held record being filed for the first time,
// and a pending record whose account the agent got wrong.
function MoveAccountModal({ held, proposal, onClose, onDone }: {
  held: HeldRecordRow | null; proposal: ProposalRow | null; onClose: () => void; onDone: () => void
}) {
  const { data: accounts } = useAccountsRaw()
  const open = !!held || !!proposal
  const proposalId = held?.id ?? proposal?.id ?? ''
  const observed = held?.observedName ?? null

  const [orgId, setOrgId] = useState('')
  const [newName, setNewName] = useState('')
  const [tenantId, setTenantId] = useState('')
  // Default ON for a held record (it carries an identifier worth learning),
  // OFF when correcting a record that already had an account.
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: tenants } = useTenants(orgId && orgId !== '__new__' ? orgId : null)

  useEffect(() => {
    if (!open) return
    setOrgId(''); setNewName(''); setTenantId(''); setError(null)
    setRemember(!!held)
  }, [open, held])

  if (!open) return null

  async function submit() {
    setBusy(true); setError(null)
    try {
      let targetOrgId = orgId
      if (orgId === '__new__') {
        const name = newName.trim()
        if (!name) throw new Error('Give the new account a name')
        targetOrgId = await createAccount({ name, segmentId: null, deploymentModel: null, deploymentType: 'cloud' })
      }
      if (!targetOrgId) throw new Error('Pick an account')
      await reassignProposal({
        proposalId,
        orgId: targetOrgId,
        tenantId: tenantId || null,
        rememberIdentifier: remember && !!observed,
      })
      onDone(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the record')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={held ? 'Set this record\'s account' : 'Change this record\'s account'}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {held
            ? <>Seen as <span className="font-medium text-foreground">"{observed}"</span>. If that name is not a company — an implementation, a project, a programme — pick the account it actually belongs to and leave the box below unticked.</>
            : <>Currently filed under <span className="font-medium text-foreground">{proposal?.accountName ?? 'an unknown account'}</span>.</>}
        </p>

        <div>
          <label htmlFor="move-account" className="block text-xs font-medium text-muted-foreground mb-1">Account</label>
          <select id="move-account" value={orgId} onChange={(e) => { setOrgId(e.target.value); setTenantId('') }} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
            <option value="">Select an account…</option>
            {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="__new__">+ Create a new account…</option>
          </select>
        </div>

        {orgId === '__new__' && (
          <div>
            <label htmlFor="move-new-name" className="block text-xs font-medium text-muted-foreground mb-1">New account name</label>
            <input id="move-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Octave" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
        )}

        {orgId && orgId !== '__new__' && (tenants ?? []).length > 0 && (
          <div>
            <label htmlFor="move-tenant" className="block text-xs font-medium text-muted-foreground mb-1">Tenant (optional)</label>
            <select id="move-tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
              <option value="">No tenant</option>
              {(tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {observed && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
            <span>
              Also remember that <span className="font-medium">"{observed}"</span> means this account
              <span className="block text-xs text-muted-foreground">Future mentions attach automatically. Leave unticked if the name is a project or a one-off rather than another name for the company.</span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? 'Moving…' : held ? 'File it here' : 'Move it'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
