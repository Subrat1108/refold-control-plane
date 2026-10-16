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
  useHeldRecords,
} from '@/hooks'
import { resolveAccountProposal, reassignProposal } from '@/lib/provisioning'
import { AccountTenantPicker, type AccountChoice } from '@/components/AccountTenantPicker'
import { createProject } from '@/hooks/usePortfolio'
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
  const [accountTarget, setAccountTarget] = useState<ApprovalItem | null>(null)

  const { data: proposals, isLoading, isError, refetch } = useProposals({
    targetTable: targetTable || undefined,
    source: source || undefined,
    orgIds: scope === 'everyone' ? null : scopedIds,
  })
  const { data: heldRecords } = useHeldRecords()

  // ONE shape for every pending item, attributed or not. The two used to
  // look like different species — an amber grouped block for records with
  // no account, a white card for the rest — which made the screen read as
  // two jobs. It is one job: decide about a record. The only difference is
  // that an unattributed one has to be told where it belongs first.
  const items: ApprovalItem[] = (() => {
    const out: ApprovalItem[] = []

    for (const h of heldRecords ?? []) {
      const siblings = (heldRecords ?? []).filter((o) => o.resolutionId && o.resolutionId === h.resolutionId)
      out.push({
        id: h.id, kind: 'held',
        heading: `Add · ${h.recordType.replace(/_/g, ' ')}`,
        title: h.summary,
        evidenceExcerpt: h.evidenceExcerpt, evidenceUrl: h.evidenceUrl,
        accountName: null, identifier: h.observedName,
        resolutionId: h.resolutionId,
        siblingIds: siblings.map((o) => o.id),
        createdAt: h.createdAt, source: h.source, proposedBy: h.proposedBy,
      })
    }

    for (const pr of proposals ?? []) {
      out.push({
        id: pr.id, kind: 'proposal',
        heading: `${pr.operation} · ${pr.targetTable.replace(/_/g, ' ')}`,
        title: null,
        evidenceExcerpt: pr.evidenceExcerpt, evidenceUrl: pr.evidenceUrl,
        accountName: pr.accountName, identifier: null,
        resolutionId: null, siblingIds: [],
        createdAt: pr.createdAt, source: pr.source, proposedBy: pr.proposedBy,
        proposal: pr,
      })
    }

    return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt))
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

      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing pending" description="All caught up — no records waiting for a decision in this scope." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <RecordCard
              key={item.id}
              item={item}
              checked={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              onApprove={() => item.proposal && handleApprove(item.proposal)}
              onEdit={() => item.proposal && setEditTarget(item.proposal)}
              onReject={() => item.proposal && setRejectTarget(item.proposal)}
              onSetAccount={() => setAccountTarget(item)}
            />
          ))}
        </div>
      )}

      <EditThenApproveModal proposal={editTarget} onClose={() => setEditTarget(null)} onDone={refresh} />
      <RejectModal proposal={rejectTarget} onClose={() => setRejectTarget(null)} onDone={refresh} />
      <SetAccountModal item={accountTarget} onClose={() => setAccountTarget(null)} onDone={refresh} />
    </div>
  )
}

// ONE card for every pending item. An unattributed record is not a
// different kind of thing needing a different design — it is the same
// record, missing one answer. So the frame, evidence and actions are
// identical; only the account line differs, and where it is unknown it
// carries the control that fixes it.
export interface ApprovalItem {
  id: string
  kind: 'proposal' | 'held'
  heading: string
  title: string | null
  evidenceExcerpt: string | null
  evidenceUrl: string | null
  accountName: string | null
  identifier: string | null
  resolutionId: string | null
  siblingIds: string[]
  createdAt: string
  source: string
  proposedBy: string
  proposal?: ProposalRow
}

function RecordCard({ item, checked, onToggle, onApprove, onEdit, onReject, onSetAccount }: {
  item: ApprovalItem; checked: boolean; onToggle: () => void
  onApprove: () => void; onEdit: () => void; onReject: () => void; onSetAccount: () => void
}) {
  const p = item.proposal
  const { data: currentRow } = useCurrentRow(p?.targetTable ?? '', p && p.operation !== 'create' ? p.targetId : null)
  const payloadKeys = p ? Object.keys(p.payload) : []
  const needsAccount = !item.accountName

  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <input
            type="checkbox" checked={checked} onChange={onToggle} disabled={needsAccount}
            title={needsAccount ? 'Set an account before approving' : undefined}
            className="mt-1 disabled:opacity-40"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground capitalize">{item.heading}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {needsAccount ? (
                <>
                  <span className="font-medium text-amber-700">No account yet</span>
                  {item.identifier && <> · seen as <code className="font-mono">{item.identifier}</code></>}
                </>
              ) : (
                <>{item.accountName}{' '}<button onClick={onSetAccount} className="text-primary hover:underline font-medium">change</button></>
              )}
              {' '}· proposed by {item.proposedBy} · {formatDate(item.createdAt)}
            </p>
          </div>
        </div>
        <SourceBadge source={item.source as ProposalRow['source']} verifiedAt={null} />
      </div>

      {item.title && <p className="text-sm text-foreground">{item.title}</p>}

      {(item.evidenceUrl || item.evidenceExcerpt) && (
        <p className="text-xs text-muted-foreground">
          {item.evidenceUrl && <>Evidence: <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{item.evidenceUrl}</a>{item.evidenceExcerpt ? ' — ' : ''}</>}
          {item.evidenceExcerpt && <span className="italic">&ldquo;{item.evidenceExcerpt}&rdquo;</span>}
        </p>
      )}

      {p && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {p.operation !== 'create' && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Current</p>
              {currentRow ? Object.entries(currentRow).map(([k, v]) => <p key={k} className="text-muted-foreground">{k}: {String(v ?? '—')}</p>) : <p className="text-muted-foreground">—</p>}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{p.operation === 'delete' ? 'Will be deleted' : 'Proposed'}</p>
            {p.operation === 'delete' ? <p className="text-muted-foreground">(entire record)</p> : payloadKeys.length === 0 ? <p className="text-muted-foreground">—</p> : (
              payloadKeys.map((k) => <p key={k} className="text-foreground">{k}: {String(p.payload[k])}</p>)
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
        {needsAccount ? (
          <>
            <button onClick={onSetAccount} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">Set account</button>
            <span className="text-xs text-muted-foreground">
              Needed before this can be approved
              {item.siblingIds.length > 1 && <> · {item.siblingIds.length - 1} other record{item.siblingIds.length === 2 ? '' : 's'} share this name</>}
            </span>
          </>
        ) : (
          <>
            <button onClick={onApprove} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">Approve</button>
            {p && p.operation !== 'delete' && <button onClick={onEdit} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Edit then approve</button>}
            <button onClick={onReject} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Reject</button>
          </>
        )}
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


// Setting (or correcting) an item's account.
//
// Two things this has to get right. First, the decision usually applies to
// more than one record — several facts arrive from the same unrecognised
// org — so it offers to apply to all of them rather than making you repeat
// it; that is the efficiency the grouped layout used to buy, kept without
// the separate design. Second, a record type that REQUIRES a project (a
// milestone, an accomplishment) used to dead-end here: "matches no project
// under Naehas. Create the project on that account first." That is a
// correct check and a useless instruction, so the project can now be
// created in place.
function SetAccountModal({ item, onClose, onDone }: {
  item: ApprovalItem | null; onClose: () => void; onDone: () => void
}) {
  const { profile } = useSupabaseAuth()
  const [choice, setChoice] = useState<AccountChoice | null>(null)
  const [remember, setRemember] = useState(true)
  const [applyToAll, setApplyToAll] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  // Set when the backend refuses for want of a project, so we can offer to
  // make one instead of leaving the user stuck.
  const [missingProject, setMissingProject] = useState<string | null>(null)

  useEffect(() => {
    if (!item) return
    setChoice(null); setError(null); setProgress(null); setMissingProject(null)
    setRemember(!!item.identifier)
    setApplyToAll(true)
  }, [item])

  if (!item) return null

  const siblings = item.siblingIds.length > 1 ? item.siblingIds.length : 0
  const targets = applyToAll && siblings ? item.siblingIds : [item.id]

  async function createMissingProject() {
    if (!choice || !profile || !missingProject) return
    setBusy(true); setError(null)
    try {
      await createProject(choice.orgId, { name: missingProject, health: 'on_schedule' } as never, profile.id)
      setMissingProject(null)
      await apply()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project')
      setBusy(false)
    }
  }

  async function apply() {
    if (!item) return
    setBusy(true); setError(null); setMissingProject(null)
    try {
      if (!choice) throw new Error('Choose an account first')
      let done = 0
      for (const id of targets) {
        if (targets.length > 1) setProgress(`Filing ${++done} of ${targets.length}…`)
        await reassignProposal({
          proposalId: id,
          orgId: choice.orgId,
          tenantId: choice.tenantId,
          rememberIdentifier: remember && !!item.identifier,
        })
      }
      onDone(); onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not file it'
      // "a milestone needs a project, and "X" matches no project under Y"
      const named = /matches no project under/.test(message) ? message.match(/"([^"]+)"/)?.[1] ?? null : null
      if (named) setMissingProject(named)
      setError(message)
    } finally {
      setBusy(false); setProgress(null)
    }
  }

  async function ignore() {
    if (!item?.resolutionId) { setError('Nothing to ignore here'); return }
    setBusy(true); setError(null)
    try {
      await resolveAccountProposal({ resolutionId: item.resolutionId, decision: 'ignore' })
      onDone(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not ignore it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} title={item.accountName ? "Change this record's account" : 'Which account does this belong to?'}>
      <div className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-sm text-foreground">{item.title ?? item.heading}</p>
          {item.evidenceExcerpt && <p className="text-xs text-muted-foreground italic mt-1">&ldquo;{item.evidenceExcerpt}&rdquo;</p>}
        </div>

        {item.identifier && (
          <p className="text-xs text-muted-foreground">
            The Hub saw this as <code className="font-mono">{item.identifier}</code> and could not match it to anything it knows.
          </p>
        )}

        <AccountTenantPicker value={choice} onChange={setChoice} id="set-account" />

        {siblings > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="mt-0.5" />
            <span>
              Apply to all {siblings} records seen as &ldquo;{item.identifier}&rdquo;
              <span className="block text-xs text-muted-foreground">They all arrived under the same name, so they almost always belong together.</span>
            </span>
          </label>
        )}

        {item.identifier && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
            <span>
              Also remember that &ldquo;{item.identifier}&rdquo; means this
              <span className="block text-xs text-muted-foreground">Leave unticked when the name is a project or a one-off rather than another name for the company.</span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {missingProject && choice && (
          <button onClick={createMissingProject} disabled={busy} className="rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50">
            Create project &ldquo;{missingProject}&rdquo; and file it
          </button>
        )}
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}

        <div className="flex justify-between gap-2">
          {item.resolutionId ? (
            <button onClick={ignore} disabled={busy} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
              Not a customer — ignore
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground">Cancel</button>
            <button onClick={apply} disabled={busy || !choice} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {busy ? 'Filing…' : targets.length > 1 ? `File ${targets.length} records` : 'File it'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
