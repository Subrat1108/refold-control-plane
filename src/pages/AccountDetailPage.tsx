import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Plus, Trash2, UserPlus } from 'lucide-react'
import {
  useSupabaseAuth,
  useSuperAdmins,
  useSegments,
  useAccount,
  updateAccount,
  useCoverage,
  coveragePct,
  useLastEngagements,
  useOrgAuditLog,
  markVerified,
  useProjects,
  createProject,
  deleteProject,
  useProjectMembers,
  addProjectMember,
  removeProjectMember,
  useMilestones,
  createMilestone,
  deleteMilestone,
  useAccomplishments,
  createAccomplishment,
  deleteAccomplishment,
  useRisks,
  createRisk,
  deleteRisk,
  useAsks,
  createAsk,
  deleteAsk,
  useEscalations,
  createEscalation,
  resolveEscalation,
  deleteEscalation,
  useTickets,
  createTicket,
  deleteTicket,
  useEngagements,
  createEngagement,
  deleteEngagement,
  useMetricDefinitions,
  useMetricValues,
  upsertMetricValue,
  deleteMetricValue,
} from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { SourceBadge } from '@/components/SourceBadge'
import { Modal } from '@/components/Modal'
import { SlideOver } from '@/components/SlideOver'
import { Tabs, type TabItem } from '@/components/Tabs'
import { Tooltip } from '@/components/Tooltip'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { formatDate } from '@/utils/formatDate'
import type {
  Account,
  AssignmentRole,
  EngagementType,
  Project,
  RiskSeverity,
  TicketPriority,
} from '@/types'

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects' },
  { id: 'escalations', label: 'Escalations' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'engagements', label: 'Engagements' },
  { id: 'metrics', label: 'Metrics' },
]

export function AccountDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const [tab, setTab] = useState('overview')
  const { data: account, isLoading, isError, refetch } = useAccount(orgId ?? null)
  const { data: segments } = useSegments()
  const { data: people } = useSuperAdmins()
  const { data: lastEngagements } = useLastEngagements()
  const { data: coverage } = useCoverage()
  const [healthModalOpen, setHealthModalOpen] = useState(false)
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()

  if (!orgId) return null
  if (isLoading) return <div className="p-6"><CardSkeleton /></div>
  if (isError || !account) return <div className="p-6"><ErrorState onRetry={() => refetch()} /></div>

  const segmentName = segments?.find((s) => s.id === account.segmentId)?.name ?? '—'
  const ownerName = people?.find((p) => p.id === account.ownerProfileId)?.fullName ?? '—'
  const lastEngagementAt = lastEngagements?.[account.id] ?? null
  const pct = coveragePct(coverage, account.id)

  async function handleMarkVerified() {
    if (!profile) return
    await markVerified('organizations', account!.id, profile.id)
    qc.invalidateQueries({ queryKey: ['account', orgId] })
  }

  return (
    <div className="p-6 space-y-6">
      <Link to="/portfolio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to Portfolio
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{account.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {segmentName} · {(account.deploymentModel ?? '—').replace(/_/g, ' ')} · Owner: {ownerName}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tooltip content={account.healthReason ?? 'No reason recorded'}><span><StatusBadge status={account.health} /></span></Tooltip>
          <StatusBadge status={account.lifecycleStage} />
          <span className="text-xs text-muted-foreground">Last engagement: {lastEngagementAt ? formatDate(lastEngagementAt) : 'never'}</span>
          <span className="text-xs text-muted-foreground">Coverage: {pct}%</span>
          {account.deploymentType !== 'internal' && (
            <Link
              to={account.deploymentType === 'cloud' ? `/cloud-customers/${account.id}` : `/onprem-customers/${account.id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              View deployment →
            </Link>
          )}
          <Tooltip content="Coming in 7.5"><button disabled className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed">Refresh</button></Tooltip>
          <Tooltip content="Coming in 7.6"><button disabled className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed">Ask about this account</button></Tooltip>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <OverviewTab account={account} onChangeHealth={() => setHealthModalOpen(true)} onMarkVerified={handleMarkVerified} />
      )}
      {tab === 'projects' && <ProjectsTab orgId={account.id} people={people ?? []} />}
      {tab === 'escalations' && <EscalationsTab orgId={account.id} />}
      {tab === 'tickets' && <TicketsTab orgId={account.id} />}
      {tab === 'engagements' && <EngagementsTab orgId={account.id} />}
      {tab === 'metrics' && <MetricsTab orgId={account.id} />}

      <ChangeHealthModal account={account} open={healthModalOpen} onClose={() => setHealthModalOpen(false)} />
    </div>
  )
}

function ChangeHealthModal({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const [health, setHealth] = useState(account.health)
  const [reason, setReason] = useState(account.healthReason ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    try {
      await updateAccount(account.id, { health, healthReason: reason || null }, profile.id)
      qc.invalidateQueries({ queryKey: ['account', account.id] })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change health">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Health</label>
          <select value={health} onChange={(e) => setHealth(e.target.value as Account['health'])} className="w-full rounded-md border border-border px-3 py-2 text-sm">
            <option value="active">Active</option>
            <option value="caution">Caution</option>
            <option value="risk">Risk</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="Why is this changing?" />
        </div>
        <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ account, onChangeHealth, onMarkVerified }: { account: Account; onChangeHealth: () => void; onMarkVerified: () => void }) {
  const { data: escalations } = useEscalations(account.id)
  const { data: projects } = useProjects(account.id)
  const { data: auditLog, isLoading: auditLoading } = useOrgAuditLog(account.id)
  const openEscalations = (escalations ?? []).filter((e) => e.status !== 'resolved' && e.status !== 'closed')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Health</h2>
          <div className="flex gap-2">
            <button onClick={onChangeHealth} className="text-xs font-medium text-primary hover:underline">Change health</button>
            <button onClick={onMarkVerified} className="text-xs font-medium text-primary hover:underline">Mark verified</button>
          </div>
        </div>
        <StatusBadge status={account.health} />
        <p className="text-sm text-muted-foreground">{account.healthReason ?? 'No reason recorded.'}</p>
        <p className="text-xs text-muted-foreground">{account.verifiedAt ? `Verified ${formatDate(account.verifiedAt)}` : 'Never verified'}</p>
      </section>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Open escalations ({openEscalations.length})</h2>
        {openEscalations.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <ul className="space-y-1.5">
            {openEscalations.slice(0, 5).map((e) => <li key={e.id} className="text-sm">{e.title} <StatusBadge status={e.severity} /></li>)}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Projects ({(projects ?? []).length})</h2>
        {(projects ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <ul className="space-y-1.5">
            {(projects ?? []).map((p) => <li key={p.id} className="text-sm flex items-center justify-between"><span>{p.name}</span><StatusBadge status={p.health} /></li>)}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
        {auditLoading ? <CardSkeleton /> : (auditLog ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
          <ul className="space-y-1.5">
            {(auditLog ?? []).map((a) => (
              <li key={a.id} className="text-sm text-muted-foreground">
                <span className="text-foreground">{a.actorName ?? 'system'}</span> {a.action.replace(/_/g, ' ')} · {formatDate(a.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ── Projects ─────────────────────────────────────────────────────────────

function ProjectsTab({ orgId, people }: { orgId: string; people: { id: string; fullName: string | null }[] }) {
  const qc = useQueryClient()
  const { data: projects, isLoading, isError, refetch } = useProjects(orgId)
  const { data: accountRisks } = useRisks(orgId)
  const { data: accountAsks } = useAsks(orgId)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [assignTarget, setAssignTarget] = useState<Project | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['projects', orgId] })

  const accountLevelRisks = (accountRisks ?? []).filter((r) => r.projectId === null)
  const accountLevelAsks = (accountAsks ?? []).filter((a) => a.projectId === null)

  if (isLoading) return <CardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90">
          <Plus size={16} /> Add project
        </button>
      </div>

      {(projects ?? []).length === 0 ? (
        <EmptyState title="No projects yet" description="Add a delivery workstream for this account." />
      ) : (
        (projects ?? []).map((p) => (
          <ProjectCard key={p.id} project={p} onDelete={() => setDeleteTarget(p)} onAssign={() => setAssignTarget(p)} />
        ))
      )}

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Account-level risks</h2>
        <RiskList orgId={orgId} projectId={null} risks={accountLevelRisks} />
      </section>
      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Account-level asks</h2>
        <AskList orgId={orgId} projectId={null} asks={accountLevelAsks} />
      </section>

      <AddProjectModal orgId={orgId} open={addOpen} onClose={() => setAddOpen(false)} onDone={refresh} />
      <ProjectAssignSlideOver project={assignTarget} people={people} onClose={() => setAssignTarget(null)} />

      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Delete project">
          <p className="text-sm text-foreground mb-4">
            Delete "{deleteTarget.name}"? This also removes its milestones, accomplishments, risks, and asks.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
            <button
              onClick={async () => { await deleteProject(deleteTarget.id); setDeleteTarget(null); refresh() }}
              className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ProjectCard({ project, onDelete, onAssign }: { project: Project; onDelete: () => void; onAssign: () => void }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: members } = useProjectMembers(project.id)
  const { data: milestones } = useMilestones(project.id)
  const { data: accomplishments } = useAccomplishments(project.id)
  const { data: risks } = useRisks(project.orgId)
  const { data: asks } = useAsks(project.orgId)
  const [expanded, setExpanded] = useState(false)

  const projectRisks = (risks ?? []).filter((r) => r.projectId === project.id)
  const projectAsks = (asks ?? []).filter((a) => a.projectId === project.id)

  async function handleMarkVerified() {
    if (!profile) return
    await markVerified('projects', project.id, profile.id)
    qc.invalidateQueries({ queryKey: ['projects', project.orgId] })
  }

  return (
    <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project.releaseNo ?? '—'} · Go-live {project.goLiveDate ? formatDate(project.goLiveDate) : '—'} · {project.liveTenants} live / {project.devUatTenants} dev-UAT tenants
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={project.health} />
          <SourceBadge source={project.source} verifiedAt={project.verifiedAt} />
          <Tooltip content="EDL/FDE/TA assignments"><button onClick={onAssign} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><UserPlus size={16} /></button></Tooltip>
          <Tooltip content="Mark verified"><button onClick={handleMarkVerified} className="text-xs font-medium text-primary hover:underline">Verify</button></Tooltip>
          <Tooltip content="Delete project"><button onClick={onDelete} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={16} /></button></Tooltip>
        </div>
      </div>
      {project.goals.length > 0 && <p className="text-sm text-muted-foreground">Goals: {project.goals.join(', ')}</p>}
      {members && members.length > 0 && (
        <p className="text-xs text-muted-foreground">Team: {members.map((m) => `${m.profileName ?? '—'} (${m.role.toUpperCase()})`).join(', ')}</p>
      )}
      <button onClick={() => setExpanded((e) => !e)} className="text-xs font-medium text-primary hover:underline">
        {expanded ? 'Hide details' : 'Show milestones, accomplishments, risks, asks'}
      </button>
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Milestones</h4>
            <MilestoneList projectId={project.id} orgId={project.orgId} milestones={milestones ?? []} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Accomplishments</h4>
            <AccomplishmentList projectId={project.id} orgId={project.orgId} accomplishments={accomplishments ?? []} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Risks</h4>
            <RiskList orgId={project.orgId} projectId={project.id} risks={projectRisks} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Asks</h4>
            <AskList orgId={project.orgId} projectId={project.id} asks={projectAsks} />
          </div>
        </div>
      )}
    </section>
  )
}

function AddProjectModal({ orgId, open, onClose, onDone }: { orgId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const { profile } = useSupabaseAuth()
  const [name, setName] = useState('')
  const [releaseNo, setReleaseNo] = useState('')
  const [goLiveDate, setGoLiveDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !name.trim()) return
    setBusy(true)
    try {
      await createProject(orgId, { name: name.trim(), releaseNo: releaseNo || null, goLiveDate: goLiveDate || null }, profile.id)
      setName(''); setReleaseNo(''); setGoLiveDate('')
      onDone()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add project">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="block text-sm font-medium text-foreground mb-1.5">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" /></div>
        <div><label className="block text-sm font-medium text-foreground mb-1.5">Release #</label><input value={releaseNo} onChange={(e) => setReleaseNo(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" /></div>
        <div><label className="block text-sm font-medium text-foreground mb-1.5">Go-live date</label><input type="date" value={goLiveDate} onChange={(e) => setGoLiveDate(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" /></div>
        <button type="submit" disabled={busy || !name.trim()} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">{busy ? 'Adding…' : 'Add project'}</button>
      </form>
    </Modal>
  )
}

function ProjectAssignSlideOver({ project, people, onClose }: { project: Project | null; people: { id: string; fullName: string | null }[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: members } = useProjectMembers(project?.id ?? null)
  const [pickProfile, setPickProfile] = useState('')
  const [pickRole, setPickRole] = useState<AssignmentRole>('fde')

  const refresh = () => qc.invalidateQueries({ queryKey: ['project-members', project?.id] })

  async function add() {
    if (!project || !pickProfile) return
    await addProjectMember(project.id, pickProfile, pickRole)
    setPickProfile('')
    refresh()
  }

  return (
    <SlideOver open={!!project} onClose={onClose} title={`Assignments — ${project?.name ?? ''}`}>
      {project && (
        <div className="space-y-4">
          {(members ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No one assigned yet.</p> : (
            <div className="space-y-2">
              {(members ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div><p className="text-sm font-medium text-foreground">{m.profileName ?? '—'}</p><p className="text-xs text-muted-foreground uppercase">{m.role}</p></div>
                  <button onClick={async () => { await removeProjectMember(m.id); refresh() }} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-3 border-t border-border">
            <select value={pickProfile} onChange={(e) => setPickProfile(e.target.value)} className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm">
              <option value="">Select person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.fullName ?? p.id}</option>)}
            </select>
            <select value={pickRole} onChange={(e) => setPickRole(e.target.value as AssignmentRole)} className="rounded-md border border-border px-2 py-1.5 text-sm">
              <option value="edl">EDL</option>
              <option value="ta">TA</option>
              <option value="fde">FDE</option>
            </select>
            <button onClick={add} disabled={!pickProfile} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">Add</button>
          </div>
        </div>
      )}
    </SlideOver>
  )
}

function MilestoneList({ projectId, orgId, milestones }: { projectId: string; orgId: string; milestones: { id: string; period: string; description: string; status: string; source: string; verifiedAt: string | null }[] }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7) + '-01')
  const [description, setDescription] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['milestones', projectId] })
  return (
    <div className="space-y-2">
      {milestones.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{m.description} <span className="text-muted-foreground">({m.period})</span> <StatusBadge status={m.status} /></span>
          <div className="flex items-center gap-2 shrink-0">
            <SourceBadge source={m.source as never} verifiedAt={m.verifiedAt} />
            <button onClick={() => deleteMilestone(m.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(e.target.value + '-01')} className="rounded-md border border-border px-2 py-1 text-xs" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Milestone…" className="flex-1 rounded-md border border-border px-2 py-1 text-xs" />
        <button
          onClick={async () => { if (!profile || !description.trim()) return; await createMilestone(projectId, orgId, { period, description: description.trim() }, profile.id); setDescription(''); refresh() }}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function AccomplishmentList({ projectId, orgId, accomplishments }: { projectId: string; orgId: string; accomplishments: { id: string; period: string; text: string; source: string; verifiedAt: string | null }[] }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7) + '-01')
  const [text, setText] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['accomplishments', projectId] })
  return (
    <div className="space-y-2">
      {accomplishments.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{a.text} <span className="text-muted-foreground">({a.period})</span></span>
          <div className="flex items-center gap-2 shrink-0">
            <SourceBadge source={a.source as never} verifiedAt={a.verifiedAt} />
            <button onClick={() => deleteAccomplishment(a.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(e.target.value + '-01')} className="rounded-md border border-border px-2 py-1 text-xs" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Accomplishment…" className="flex-1 rounded-md border border-border px-2 py-1 text-xs" />
        <button
          onClick={async () => { if (!profile || !text.trim()) return; await createAccomplishment(projectId, orgId, { period, text: text.trim() }, profile.id); setText(''); refresh() }}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function RiskList({ orgId, projectId, risks }: { orgId: string; projectId: string | null; risks: { id: string; risk: string; impact: string; severity: string; status: string; source: string; verifiedAt: string | null }[] }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const [risk, setRisk] = useState('')
  const [impact, setImpact] = useState('')
  const [severity, setSeverity] = useState<RiskSeverity>('medium')
  const refresh = () => qc.invalidateQueries({ queryKey: ['risks', orgId] })
  return (
    <div className="space-y-2">
      {risks.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{r.risk} — {r.impact} <StatusBadge status={r.severity} /> <StatusBadge status={r.status} /></span>
          <div className="flex items-center gap-2 shrink-0">
            <SourceBadge source={r.source as never} verifiedAt={r.verifiedAt} />
            <button onClick={() => deleteRisk(r.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
          </div>
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <input value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="Risk…" className="flex-1 min-w-[120px] rounded-md border border-border px-2 py-1 text-xs" />
        <input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Impact…" className="flex-1 min-w-[120px] rounded-md border border-border px-2 py-1 text-xs" />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as RiskSeverity)} className="rounded-md border border-border px-2 py-1 text-xs">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
        </select>
        <button
          onClick={async () => { if (!profile || !risk.trim() || !impact.trim()) return; await createRisk(orgId, projectId, { risk: risk.trim(), impact: impact.trim(), severity }, profile.id); setRisk(''); setImpact(''); refresh() }}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function AskList({ orgId, projectId, asks }: { orgId: string; projectId: string | null; asks: { id: string; text: string; status: string; source: string; verifiedAt: string | null }[] }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['asks', orgId] })
  return (
    <div className="space-y-2">
      {asks.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{a.text} <StatusBadge status={a.status} /></span>
          <div className="flex items-center gap-2 shrink-0">
            <SourceBadge source={a.source as never} verifiedAt={a.verifiedAt} />
            <button onClick={() => deleteAsk(a.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask / assistance required…" className="flex-1 rounded-md border border-border px-2 py-1 text-xs" />
        <button
          onClick={async () => { if (!profile || !text.trim()) return; await createAsk(orgId, projectId, { text: text.trim() }, profile.id); setText(''); refresh() }}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ── Escalations ──────────────────────────────────────────────────────────

function EscalationsTab({ orgId }: { orgId: string }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: escalations, isLoading, isError, refetch } = useEscalations(orgId)
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<RiskSeverity>('medium')
  const refresh = () => qc.invalidateQueries({ queryKey: ['escalations', orgId] })

  const columns: Column<NonNullable<typeof escalations>[number]>[] = [
    { key: 'title', header: 'Title', render: (e) => <span className="font-medium text-foreground">{e.title}</span> },
    { key: 'severity', header: 'Severity', render: (e) => <StatusBadge status={e.severity} /> },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
    { key: 'raised', header: 'Raised', render: (e) => <span className="text-muted-foreground">{formatDate(e.raisedAt)}</span> },
    { key: 'source', header: 'Source', render: (e) => <SourceBadge source={e.source} verifiedAt={e.verifiedAt} /> },
    {
      key: 'actions', header: '', width: '140px',
      render: (e) => e.status === 'resolved' || e.status === 'closed' ? null : (
        <div className="flex gap-2">
          <button onClick={async () => { await resolveEscalation(e.id, 'resolved', 'Resolved', profile?.id ?? '') ; refresh() }} className="text-xs text-primary hover:underline">Resolve</button>
          <button onClick={() => deleteEscalation(e.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
        </div>
      ),
    },
  ]

  if (isLoading) return <CardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-card p-6">
        <DataTable columns={columns} data={escalations ?? []} rowKey={(e) => e.id} emptyTitle="No escalations" />
      </div>
      <div className="bg-white rounded-xl shadow-card p-6 flex gap-2 items-end">
        <div className="flex-1"><label className="block text-xs font-medium text-muted-foreground mb-1">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-border px-2 py-1.5 text-sm" /></div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as RiskSeverity)} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </select>
        </div>
        <button
          onClick={async () => { if (!profile || !title.trim()) return; await createEscalation(orgId, { title: title.trim(), severity }, profile.id); setTitle(''); refresh() }}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Add escalation
        </button>
      </div>
    </div>
  )
}

// ── Tickets ──────────────────────────────────────────────────────────────

function TicketsTab({ orgId }: { orgId: string }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: tickets, isLoading, isError, refetch } = useTickets(orgId)
  const [externalKey, setExternalKey] = useState('')
  const [title, setTitle] = useState('')
  const [system, setSystem] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('p3')
  const refresh = () => qc.invalidateQueries({ queryKey: ['tickets', orgId] })

  const columns: Column<NonNullable<typeof tickets>[number]>[] = [
    { key: 'key', header: 'Key', render: (t) => t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{t.externalKey}</a> : <span>{t.externalKey}</span> },
    { key: 'title', header: 'Title', render: (t) => t.title },
    { key: 'priority', header: 'Priority', render: (t) => <StatusBadge status={t.priority} /> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
    { key: 'age', header: 'Opened', render: (t) => <span className="text-muted-foreground">{formatDate(t.openedAt)}</span> },
    { key: 'source', header: 'Source', render: (t) => <SourceBadge source={t.source} verifiedAt={t.verifiedAt} /> },
    { key: 'actions', header: '', width: '80px', render: (t) => <button onClick={() => deleteTicket(t.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button> },
  ]

  if (isLoading) return <CardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><Tooltip content="Coming in 7.5"><button disabled className="text-xs text-muted-foreground opacity-50 cursor-not-allowed">Refresh</button></Tooltip></div>
      <div className="bg-white rounded-xl shadow-card p-6">
        <DataTable columns={columns} data={tickets ?? []} rowKey={(t) => t.id} emptyTitle="No tickets" />
      </div>
      <div className="bg-white rounded-xl shadow-card p-6 flex gap-2 items-end flex-wrap">
        <div><label className="block text-xs font-medium text-muted-foreground mb-1">Key</label><input value={externalKey} onChange={(e) => setExternalKey(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm" /></div>
        <div className="flex-1"><label className="block text-xs font-medium text-muted-foreground mb-1">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-border px-2 py-1.5 text-sm" /></div>
        <div><label className="block text-xs font-medium text-muted-foreground mb-1">System</label><input value={system} onChange={(e) => setSystem(e.target.value)} placeholder="Zendesk" className="rounded-md border border-border px-2 py-1.5 text-sm" /></div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option><option value="p4">P4</option>
          </select>
        </div>
        <button
          onClick={async () => { if (!profile || !externalKey.trim() || !title.trim() || !system.trim()) return; await createTicket(orgId, { externalKey: externalKey.trim(), title: title.trim(), system: system.trim(), priority }, profile.id); setExternalKey(''); setTitle(''); setSystem(''); refresh() }}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Add ticket
        </button>
      </div>
    </div>
  )
}

// ── Engagements ──────────────────────────────────────────────────────────

function EngagementsTab({ orgId }: { orgId: string }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: engagements, isLoading, isError, refetch } = useEngagements(orgId)
  const [type, setType] = useState<EngagementType>('call')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [summary, setSummary] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['engagements', orgId] })

  if (isLoading) return <CardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-card p-6 space-y-3">
        {(engagements ?? []).length === 0 ? <EmptyState title="No engagements logged" /> : (
          <ul className="space-y-3">
            {(engagements ?? []).map((e) => (
              <li key={e.id} className="border-b border-border last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground capitalize">{e.type.replace(/_/g, ' ')} · {formatDate(e.engagementDate)}</span>
                  <div className="flex items-center gap-2"><SourceBadge source={e.source} verifiedAt={e.verifiedAt} /><button onClick={() => deleteEngagement(e.id).then(refresh)} className="text-xs text-muted-foreground hover:text-red-600">Remove</button></div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{e.summary}</p>
                {e.followUps && <p className="text-xs text-muted-foreground mt-1">Follow-ups: {e.followUps}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as EngagementType)} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="call">Call</option><option value="check_in">Check-in</option><option value="qbr">QBR</option><option value="ebr">EBR</option><option value="note">Note</option>
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm" />
        </div>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Summary…" className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
        <button
          onClick={async () => { if (!profile || !summary.trim()) return; await createEngagement(orgId, { type, engagementDate: date, summary: summary.trim() }, profile.id); setSummary(''); refresh() }}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Log engagement
        </button>
      </div>
    </div>
  )
}

// ── Metrics ──────────────────────────────────────────────────────────────

function MetricsTab({ orgId }: { orgId: string }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: definitions } = useMetricDefinitions()
  const { data: values, isLoading, isError, refetch } = useMetricValues(orgId)
  const [metricKey, setMetricKey] = useState('')
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7) + '-01')
  const [value, setValue] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['metric-values', orgId] })

  if (isLoading) return <CardSkeleton />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const byCategory = new Map<string, typeof definitions>()
  for (const d of definitions ?? []) {
    if (!byCategory.has(d.category)) byCategory.set(d.category, [])
    byCategory.get(d.category)!.push(d)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Tooltip content="Coming in 7.5"><button disabled className="text-xs text-muted-foreground opacity-50 cursor-not-allowed">Refresh</button></Tooltip></div>
      {Array.from(byCategory.entries()).map(([category, defs]) => (
        <section key={category} className="bg-white rounded-xl shadow-card p-6 space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{category}</h2>
          {(defs ?? []).map((d) => {
            const latest = (values ?? []).filter((v) => v.metricKey === d.key).sort((a, b) => b.period.localeCompare(a.period))[0]
            return (
              <div key={d.key} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span>{d.label} {d.unit && <span className="text-muted-foreground">({d.unit})</span>}</span>
                <span className="tabular-nums">
                  {latest ? latest.value : '—'}
                  {latest?.baselineValue != null && <span className="text-muted-foreground"> (baseline {latest.baselineValue})</span>}
                  {latest && <span className="text-muted-foreground ml-2">{latest.period}</span>}
                  {latest && <button onClick={() => deleteMetricValue(latest.id).then(refresh)} className="ml-2 text-xs text-muted-foreground hover:text-red-600">Remove</button>}
                </span>
              </div>
            )
          })}
        </section>
      ))}
      <div className="bg-white rounded-xl shadow-card p-6 flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Metric</label>
          <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm">
            <option value="">Select…</option>
            {(definitions ?? []).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-muted-foreground mb-1">Period</label><input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(e.target.value + '-01')} className="rounded-md border border-border px-2 py-1.5 text-sm" /></div>
        <div><label className="block text-xs font-medium text-muted-foreground mb-1">Value</label><input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" /></div>
        <button
          onClick={async () => { if (!profile || !metricKey || value === '') return; await upsertMetricValue(orgId, { metricKey, period, value: Number(value) }, profile.id); setValue(''); refresh() }}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Enter value
        </button>
      </div>
    </div>
  )
}
