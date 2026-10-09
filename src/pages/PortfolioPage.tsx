import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import {
  useSupabaseAuth,
  useSegments,
  usePortfolioAccounts,
  useCoverage,
  coverageStatusFor,
  createAccount,
  usePortfolioNotes,
  createPortfolioNote,
  deletePortfolioNote,
  useScope,
  useScopedAccountIds,
  usePersonRoles,
  addRole,
  endRole,
} from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { Modal } from '@/components/Modal'
import { Tabs, type TabItem } from '@/components/Tabs'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { SavedViewsMenu } from '@/components/SavedViewsMenu'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { Tooltip } from '@/components/Tooltip'
import { formatDate } from '@/utils/formatDate'
import type { AssignmentRole, CoverageSection, DeploymentModel, DeploymentType, PortfolioAccountRow, PortfolioNoteKind, SavedView } from '@/types'

const PAGE = 'portfolio'
const COVERAGE_SECTIONS: CoverageSection[] = ['projects', 'milestones', 'risks', 'escalations', 'tickets', 'engagements', 'metrics']

export function PortfolioPage() {
  const [tab, setTab] = useState('board')
  const tabs: TabItem[] = [
    { id: 'board', label: 'Board' },
    { id: 'coverage', label: 'Coverage' },
  ]
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Portfolio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Every account, grouped by segment — health, EDL, coverage.</p>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'board' ? <BoardTab /> : <CoverageTab />}
    </div>
  )
}

// ── Board ────────────────────────────────────────────────────────────────

function BoardTab() {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: accounts, isLoading, isError, refetch } = usePortfolioAccounts()
  const { data: segments } = useSegments()
  const { data: myRoles } = usePersonRoles(profile?.id ?? null)
  const { scope, scopeTarget, setScope } = useScope(PAGE)
  const { data: scopedIds } = useScopedAccountIds(scope, scopeTarget)
  const [filters, setFilters] = useState<{ segmentId: string; health: string; lifecycle: string }>({ segmentId: '', health: '', lifecycle: '' })
  const [addOpen, setAddOpen] = useState(false)
  const [roleTarget, setRoleTarget] = useState<PortfolioAccountRow | null>(null)

  const myActiveRoleByOrg = new Map((myRoles ?? []).filter((r) => !r.endedAt).map((r) => [r.orgId, r]))

  const refreshMyRoles = () => {
    qc.invalidateQueries({ queryKey: ['person-roles', profile?.id] })
    qc.invalidateQueries({ queryKey: ['my-active-account-ids'] })
  }

  async function handleLeave(orgId: string) {
    const role = myActiveRoleByOrg.get(orgId)
    if (!role) return
    await endRole(role.id)
    refreshMyRoles()
  }

  const filtered = useMemo(() => {
    if (!accounts) return []
    let rows = accounts
    if (scopedIds !== null && scopedIds !== undefined) {
      const allowed = new Set(scopedIds)
      rows = rows.filter((a) => allowed.has(a.id))
    }
    if (filters.segmentId) rows = rows.filter((a) => a.segmentId === filters.segmentId)
    if (filters.health) rows = rows.filter((a) => a.health === filters.health)
    if (filters.lifecycle) rows = rows.filter((a) => a.lifecycleStage === filters.lifecycle)
    return rows
  }, [accounts, scopedIds, filters])

  const grouped = useMemo(() => {
    const bySegment = new Map<string, PortfolioAccountRow[]>()
    for (const a of filtered) {
      const key = a.segmentName ?? 'Unsegmented'
      if (!bySegment.has(key)) bySegment.set(key, [])
      bySegment.get(key)!.push(a)
    }
    return Array.from(bySegment.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  function applyView(v: SavedView) {
    setScope(v.scope, v.scopeTarget)
  }

  const columns: Column<PortfolioAccountRow>[] = [
    { key: 'name', header: 'Account', render: (a) => <Link to={`/accounts/${a.id}`} className="font-medium text-foreground hover:underline">{a.name}</Link> },
    { key: 'health', header: 'Health', render: (a) => <StatusBadge status={a.health} /> },
    { key: 'lifecycle', header: 'Lifecycle', render: (a) => <span className="text-muted-foreground capitalize">{a.lifecycleStage.replace(/_/g, ' ')}</span> },
    { key: 'deployment', header: 'Deployment', render: (a) => <span className="text-muted-foreground capitalize">{(a.deploymentModel ?? '—').replace(/_/g, ' ')}</span> },
    { key: 'edl', header: 'EDL', render: (a) => <span className="text-muted-foreground">{a.edlNames ?? '—'}</span> },
    { key: 'escalations', header: 'Open escalations', render: (a) => <span className="tabular-nums">{a.openEscalationCount}</span> },
    { key: 'milestone', header: 'Next milestone', render: (a) => <span className="text-muted-foreground">{a.nextMilestone ? `${a.nextMilestone.description} (${a.nextMilestone.period})` : '—'}</span> },
    { key: 'engagement', header: 'Last engagement', render: (a) => <span className="text-muted-foreground">{a.lastEngagementAt ? formatDate(a.lastEngagementAt) : 'never'}</span> },
    { key: 'coverage', header: 'Coverage', render: (a) => <span className="tabular-nums">{a.coveragePct}%</span> },
    {
      key: 'myRole',
      header: '',
      width: '140px',
      render: (a) => myActiveRoleByOrg.has(a.id) ? (
        <button onClick={() => handleLeave(a.id)} className="text-xs font-medium text-muted-foreground hover:text-red-600">Leave account</button>
      ) : (
        <button onClick={() => setRoleTarget(a)} className="text-xs font-medium text-primary hover:underline">Add to my accounts</button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filters.segmentId} onChange={(e) => setFilters((f) => ({ ...f, segmentId: e.target.value }))} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">All segments</option>
            {(segments ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filters.health} onChange={(e) => setFilters((f) => ({ ...f, health: e.target.value }))} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">All health</option>
            <option value="active">Active</option>
            <option value="caution">Caution</option>
            <option value="risk">Risk</option>
          </select>
          <select value={filters.lifecycle} onChange={(e) => setFilters((f) => ({ ...f, lifecycle: e.target.value }))} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">All lifecycle stages</option>
            {['prospect', 'poc', 'onboarding', 'live', 'expansion', 'renewal', 'churned'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ScopeSwitcher scope={scope} scopeTarget={scopeTarget} onChange={setScope} />
          <SavedViewsMenu page={PAGE} currentScope={scope} currentScopeTarget={scopeTarget} currentFilters={filters} onApply={applyView} />
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
            <Plus size={16} /> Add account
          </button>
        </div>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-xl shadow-card p-6">
          <DataTable columns={columns} data={[]} rowKey={(a) => a.id} emptyTitle="No accounts in this scope" emptyDescription="Try a different scope or filter, or add an account." />
        </div>
      ) : (
        grouped.map(([segmentName, rows]) => (
          <section key={segmentName} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{segmentName} <span className="text-muted-foreground font-normal">({rows.length})</span></h2>
            <div className="bg-white rounded-xl shadow-card p-6">
              <DataTable columns={columns} data={rows} rowKey={(a) => a.id} />
            </div>
          </section>
        ))
      )}

      <PortfolioNotesSection />
      <AddAccountModal open={addOpen} onClose={() => setAddOpen(false)} />
      <AddRoleModal
        account={roleTarget}
        profileId={profile?.id ?? null}
        onClose={() => setRoleTarget(null)}
        onDone={refreshMyRoles}
      />
    </div>
  )
}

function AddRoleModal({ account, profileId, onClose, onDone }: { account: PortfolioAccountRow | null; profileId: string | null; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<AssignmentRole>('fde')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!account || !profileId) return
    setBusy(true)
    setError('')
    try {
      await addRole(account.id, profileId, role)
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add role')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!account} onClose={onClose} title={`Add to my accounts — ${account?.name ?? ''}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">My role on this account</label>
          <select value={role} onChange={(e) => setRole(e.target.value as AssignmentRole)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="edl">EDL</option>
            <option value="ta">TA</option>
            <option value="fde">FDE</option>
          </select>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">{busy ? 'Adding…' : 'Add'}</button>
      </form>
    </Modal>
  )
}

function AddAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: segments } = useSegments()
  const [name, setName] = useState('')
  const [segmentId, setSegmentId] = useState('')
  const [deploymentType, setDeploymentType] = useState<DeploymentType>('cloud')
  const [deploymentModel, setDeploymentModel] = useState<DeploymentModel | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setName(''); setSegmentId(''); setDeploymentType('cloud'); setDeploymentModel(''); setError('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createAccount({ name: name.trim(), segmentId: segmentId || null, deploymentType, deploymentModel: deploymentModel || null })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Add account">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Account name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Robotics" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Segment <span className="text-muted-foreground font-normal">(optional)</span></label>
          <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="">—</option>
            {(segments ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Deployment type</label>
          <select value={deploymentType} onChange={(e) => setDeploymentType(e.target.value as DeploymentType)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="cloud">Cloud</option>
            <option value="on_premise">On-premise</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Deployment model <span className="text-muted-foreground font-normal">(optional)</span></label>
          <select value={deploymentModel} onChange={(e) => setDeploymentModel(e.target.value as DeploymentModel | '')} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="">—</option>
            <option value="cloud">Cloud</option>
            <option value="onprem_managed">On-prem (managed)</option>
            <option value="onprem_airgapped">On-prem (air-gapped)</option>
          </select>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !name} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </Modal>
  )
}

function PortfolioNotesSection() {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: notes, isLoading } = usePortfolioNotes()
  const [kind, setKind] = useState<PortfolioNoteKind>('milestone')
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7) + '-01')
  const [body, setBody] = useState('')
  const [impact, setImpact] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ['portfolio-notes'] })

  async function add(k: PortfolioNoteKind) {
    if (!profile || !body.trim()) return
    setBusy(true)
    try {
      await createPortfolioNote({ period, kind: k, body: body.trim(), impact: impact.trim() || null }, profile.id)
      setBody(''); setImpact('')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const milestones = (notes ?? []).filter((n) => n.kind === 'milestone')
  const recommendations = (notes ?? []).filter((n) => n.kind === 'recommendation')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Key milestones</h2>
        {isLoading ? <CardSkeleton /> : (
          <ul className="space-y-2">
            {milestones.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2 text-sm">
                <span>{n.body} <span className="text-muted-foreground">({n.period})</span></span>
                <button onClick={() => deletePortfolioNote(n.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
              </li>
            ))}
            {milestones.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          </ul>
        )}
        <AddNoteForm kind="milestone" period={period} setPeriod={setPeriod} body={kind === 'milestone' ? body : ''} setBody={(v) => { setKind('milestone'); setBody(v) }} impact={impact} setImpact={setImpact} busy={busy} onAdd={() => add('milestone')} />
      </section>
      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recommendations + impact</h2>
        {isLoading ? <CardSkeleton /> : (
          <ul className="space-y-2">
            {recommendations.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2 text-sm">
                <span>{n.body} {n.impact && <span className="text-muted-foreground">— {n.impact}</span>} <span className="text-muted-foreground">({n.period})</span></span>
                <button onClick={() => deletePortfolioNote(n.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
              </li>
            ))}
            {recommendations.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          </ul>
        )}
        <AddNoteForm kind="recommendation" period={period} setPeriod={setPeriod} body={kind === 'recommendation' ? body : ''} setBody={(v) => { setKind('recommendation'); setBody(v) }} impact={impact} setImpact={setImpact} busy={busy} onAdd={() => add('recommendation')} />
      </section>
    </div>
  )
}

function AddNoteForm({ period, setPeriod, body, setBody, impact, setImpact, busy, onAdd }: {
  kind: PortfolioNoteKind; period: string; setPeriod: (v: string) => void; body: string; setBody: (v: string) => void; impact: string; setImpact: (v: string) => void; busy: boolean; onAdd: () => void
}) {
  return (
    <div className="flex items-end gap-2 pt-2 border-t border-border">
      <div className="flex-1 space-y-1.5">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
        <div className="flex gap-2">
          <input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(e.target.value + '-01')} className="rounded-md border border-border px-2 py-1 text-xs" />
          <input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Impact (optional)" className="flex-1 rounded-md border border-border px-2 py-1 text-xs" />
        </div>
      </div>
      <button onClick={onAdd} disabled={busy || !body.trim()} className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-40">Add</button>
    </div>
  )
}

// ── Coverage ─────────────────────────────────────────────────────────────

const DOT_STYLES: Record<string, string> = {
  current: 'bg-green-500',
  stale: 'bg-amber-500',
  missing: 'bg-gray-300',
}

function CoverageTab() {
  const { data: accounts, isLoading, isError, refetch } = usePortfolioAccounts()
  const { data: matrix } = useCoverage()

  const columns: Column<PortfolioAccountRow>[] = [
    { key: 'name', header: 'Account', render: (a) => <Link to={`/accounts/${a.id}`} className="font-medium text-foreground hover:underline">{a.name}</Link> },
    ...COVERAGE_SECTIONS.map((section) => ({
      key: section,
      header: section.charAt(0).toUpperCase() + section.slice(1),
      render: (a: PortfolioAccountRow) => {
        const status = coverageStatusFor(matrix, a.id, section)
        return (
          <Tooltip content={status}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT_STYLES[status]}`} />
          </Tooltip>
        )
      },
    })),
  ]

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
        <DataTable columns={columns} data={accounts ?? []} rowKey={(a) => a.id} emptyTitle="No accounts yet" />
      )}
      <p className="text-xs text-muted-foreground mt-4">
        "Pending approval" isn't shown yet — it needs the Approvals inbox (7.3).
      </p>
    </div>
  )
}
