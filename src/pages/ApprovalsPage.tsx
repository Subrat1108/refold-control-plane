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
} from '@/hooks'
import { resolveAccountProposal, reassignProposal } from '@/lib/provisioning'
import { AccountTenantPicker, type AccountChoice } from '@/components/AccountTenantPicker'
import { SourceBadge } from '@/components/SourceBadge'
import { Modal } from '@/components/Modal'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { SavedViewsMenu } from '@/components/SavedViewsMenu'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { formatDate } from '@/utils/formatDate'
import type { ProposalRow, ResolutionCandidate, SavedView } from '@/types'
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
  const [moveTarget, setMoveTarget] = useState<HeldRecordRow | null>(null)
  const [clusterTarget, setClusterTarget] = useState<Cluster | null>(null)
  const [moveProposalTarget, setMoveProposalTarget] = useState<ProposalRow | null>(null)

  const { data: proposals, isLoading, isError, refetch } = useProposals({
    targetTable: targetTable || undefined,
    source: source || undefined,
    orgIds: scope === 'everyone' ? null : scopedIds,
  })
  const { data: resolutions } = useAccountResolutions()
  const { data: heldRecords } = useHeldRecords()

  // One list, but a decision is asked once per unrecognised identifier
  // rather than once per record: 17 records behind one Zendesk org is one
  // decision, not 17. Each row inside can still be sent somewhere else.
  const clusters: Cluster[] = (() => {
    const byKey = new Map<string, Cluster>()
    for (const h of heldRecords ?? []) {
      const key = h.resolutionId ?? `orphan:${h.id}`
      const found = byKey.get(key)
      if (found) { found.records.push(h); continue }
      const res = (resolutions ?? []).find((r) => r.id === h.resolutionId)
      byKey.set(key, {
        resolutionId: h.resolutionId,
        identifier: h.observedName ?? 'an unrecognised name',
        scope: res?.scope ?? 'account',
        knownOrgName: res?.knownOrgName ?? null,
        candidates: res?.candidates ?? [],
        firstSeen: res?.createdAt ?? h.createdAt,
        records: [h],
      })
    }
    return [...byKey.values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen))
  })()

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
          Everything waiting on you, in one list. Each item shows what it is and which account it will be filed under — and where the Hub could not work the
          account out, you can set it (or create one) without leaving the row.
        </p>
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

      {clusters.length > 0 && (
        <div className="space-y-3">
          {clusters.map((c) => (
            <UnresolvedCluster
              key={c.resolutionId ?? c.identifier}
              cluster={c}
              onDecide={() => setClusterTarget(c)}
              onMoveOne={(rec) => setMoveTarget(rec)}
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (proposals ?? []).length === 0 && clusters.length === 0 ? (
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
      <ResolveClusterModal cluster={clusterTarget} onClose={() => setClusterTarget(null)} onDone={refresh} />
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

// Deciding for a whole cluster at once.
//
// The old modal offered four abstract choices over an opaque string and no
// way to create what was missing — which is how "CFIHOS is an implementation
// Octave runs" became unanswerable. Here the records are shown first, the
// picker carries the real hierarchy, and anything absent can be created in
// place.
function ResolveClusterModal({ cluster, onClose, onDone }: {
  cluster: Cluster | null; onClose: () => void; onDone: () => void
}) {
  const [choice, setChoice] = useState<AccountChoice | null>(null)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  useEffect(() => {
    if (!cluster) return
    setChoice(null); setRemember(true); setError(null); setProgress(null)
  }, [cluster])

  if (!cluster) return null

  async function apply(ignore = false) {
    if (!cluster) return
    setBusy(true); setError(null)
    try {
      if (ignore) {
        if (!cluster.resolutionId) throw new Error('Nothing to ignore here')
        await resolveAccountProposal({ resolutionId: cluster.resolutionId, decision: 'ignore' })
      } else {
        if (!choice) throw new Error('Choose an account first')
        // Move every record in the cluster. The last one closes the
        // resolution automatically (reassign_proposal handles that), so
        // there is no separate "resolve" step to forget.
        let done = 0
        for (const rec of cluster.records) {
          setProgress(`Filing ${++done} of ${cluster.records.length}…`)
          await reassignProposal({
            proposalId: rec.id,
            orgId: choice.orgId,
            tenantId: choice.tenantId,
            rememberIdentifier: remember,
          })
        }
      }
      onDone(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply that')
    } finally {
      setBusy(false); setProgress(null)
    }
  }

  return (
    <Modal open={!!cluster} onClose={onClose} title="Which account do these belong to?">
      <div className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 space-y-1.5 max-h-44 overflow-y-auto">
          {cluster.records.map((r) => (
            <div key={r.id}>
              <p className="text-sm text-foreground">{r.summary}</p>
              {r.evidenceExcerpt && <p className="text-xs text-muted-foreground italic">&ldquo;{r.evidenceExcerpt}&rdquo;</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The Hub saw these as <code className="font-mono">{cluster.identifier}</code> and could not match it to anything it knows.
        </p>

        <AccountTenantPicker value={choice} onChange={setChoice} id="cluster-account" />

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
          <span>
            Also remember that <span className="font-medium">&ldquo;{cluster.identifier}&rdquo;</span> means this
            <span className="block text-xs text-muted-foreground">
              Future mentions attach on their own. Leave it unticked when the name is a project or a one-off rather than another name for the company.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}

        <div className="flex justify-between gap-2">
          <button onClick={() => apply(true)} disabled={busy} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            Not a customer — ignore
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground">Cancel</button>
            <button onClick={() => apply(false)} disabled={busy || !choice} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {busy ? 'Filing…' : `File ${cluster.records.length} record${cluster.records.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// A group of records the Hub could not attribute, all sharing one
// unrecognised identifier.
//
// The identifier is deliberately NOT the headline. `zendesk-org:24623057340828`
// tells a human nothing; the records behind it ("Calendly Auth Issue") tell
// them everything — and that evidence was sitting in the database unshown
// while the old modal asked for a decision on the opaque string alone.
export interface Cluster {
  resolutionId: string | null
  identifier: string
  scope: 'account' | 'tenant'
  knownOrgName: string | null
  candidates: ResolutionCandidate[]
  firstSeen: string
  records: HeldRecordRow[]
}

function UnresolvedCluster({ cluster, onDecide, onMoveOne }: {
  cluster: Cluster; onDecide: () => void; onMoveOne: (r: HeldRecordRow) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? cluster.records : cluster.records.slice(0, 3)

  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-3 border-l-4 border-amber-400">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {cluster.records.length} record{cluster.records.length === 1 ? '' : 's'} with no account yet
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Seen as <code className="font-mono">{cluster.identifier}</code>
            {cluster.scope === 'tenant' && cluster.knownOrgName && <> · a possible tenant of <span className="font-medium">{cluster.knownOrgName}</span></>}
            {' '}· first seen {formatDate(cluster.firstSeen)}
            {cluster.candidates.length > 0 && <> · best guesses: {cluster.candidates.map((c) => `${c.name} (${Math.round(c.confidence * 100)}%)`).join(', ')}</>}
          </p>
        </div>
        <button onClick={onDecide} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 whitespace-nowrap">
          Set account
        </button>
      </div>

      <ul className="space-y-2 pt-1 border-t border-border">
        {shown.map((r) => (
          <li key={r.id} className="pt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-foreground">{r.summary}</p>
              {r.evidenceExcerpt && <p className="text-xs text-muted-foreground mt-0.5 italic">&ldquo;{r.evidenceExcerpt}&rdquo;</p>}
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{r.recordType.replace(/_/g, ' ')} · {formatDate(r.createdAt)}</p>
            </div>
            <button onClick={() => onMoveOne(r)} className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
              this one is different
            </button>
          </li>
        ))}
      </ul>

      {cluster.records.length > 3 && (
        <button onClick={() => setExpanded((v) => !v)} className="text-xs font-medium text-primary hover:underline">
          {expanded ? 'Show fewer' : `Show all ${cluster.records.length}`}
        </button>
      )}
    </div>
  )
}

// One modal for both shapes: a held record being filed for the first time,
// and a pending record whose account the agent got wrong.
function MoveAccountModal({ held, proposal, onClose, onDone }: {
  held: HeldRecordRow | null; proposal: ProposalRow | null; onClose: () => void; onDone: () => void
}) {
  const open = !!held || !!proposal
  const proposalId = held?.id ?? proposal?.id ?? ''
  const observed = held?.observedName ?? null

  const [choice, setChoice] = useState<AccountChoice | null>(null)
  // Default ON for a held record (it carries an identifier worth learning),
  // OFF when correcting a record that already had an account.
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChoice(null); setError(null); setRemember(!!held)
  }, [open, held])

  if (!open) return null

  async function submit() {
    setBusy(true); setError(null)
    try {
      if (!choice) throw new Error('Choose where it belongs')
      await reassignProposal({
        proposalId,
        orgId: choice.orgId,
        tenantId: choice.tenantId,
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
    <Modal open={open} onClose={onClose} title={held ? 'Where does this one belong?' : 'Change this record\'s account'}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {held
            ? <>{held.summary}{held.evidenceExcerpt ? <span className="block text-xs italic mt-1">&ldquo;{held.evidenceExcerpt}&rdquo;</span> : null}</>
            : <>Currently filed under <span className="font-medium text-foreground">{proposal?.accountName ?? 'an unknown account'}</span>.</>}
        </p>

        <AccountTenantPicker value={choice} onChange={setChoice} id="move-account" />

        {observed && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
            <span>
              Also remember that <span className="font-medium">&ldquo;{observed}&rdquo;</span> means this
              <span className="block text-xs text-muted-foreground">Leave unticked if it is a project or a one-off rather than another name for the company.</span>
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
