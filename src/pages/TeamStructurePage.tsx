import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users as UsersIcon, X } from 'lucide-react'
import {
  useSuperAdmins,
  useTeams,
  useTeamMemberIds,
  useAssignableAccounts,
  useAccountAssignments,
  useScopedAccountIds,
  useScope,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  addAccountAssignment,
  setAccountAssignmentPrimary,
  removeAccountAssignment,
} from '@/hooks'
import { setTitle } from '@/lib/provisioning'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { Modal } from '@/components/Modal'
import { SlideOver } from '@/components/SlideOver'
import { Tooltip } from '@/components/Tooltip'
import { Toggle } from '@/components/Toggle'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { SavedViewsMenu } from '@/components/SavedViewsMenu'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import type { AssignmentRole, ManagedUser, ProfileTitle, SavedView, TeamSummary } from '@/types'
import type { AccountListRow } from '@/hooks'

const TITLE_LABELS: Record<ProfileTitle, string> = {
  head_of_cs: 'Head of CS',
  edl: 'EDL',
  ta: 'TA',
  fde: 'FDE',
}
const ROLE_LABELS: Record<AssignmentRole, string> = { edl: 'EDL', ta: 'TA', fde: 'FDE' }

// Phase 7.2a — super_admin only. Sets titles, teams, and account assignments
// for the CS team; the Accounts list is the proof surface for ScopeSwitcher +
// SavedViewsMenu, which every 7.2b list screen will reuse. Project-member
// assignment UI is deferred to 7.2b's Account 360 Projects tab.
export function TeamStructurePage() {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Team Structure</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Titles, teams, and account assignments for the CS team.</p>
      </div>
      <PeopleSection />
      <TeamsSection />
      <AccountsSection />
    </div>
  )
}

// ─── People ───────────────────────────────────────────────────────────────────

function PeopleSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useSuperAdmins()
  const [editUser, setEditUser] = useState<ManagedUser | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: ['super-admins'] })

  async function pick(title: ProfileTitle | null) {
    if (!editUser) return
    setBusy(true)
    setError('')
    try {
      await setTitle(editUser.id, title)
      await refresh()
      setEditUser(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set title')
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<ManagedUser>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div>
          <div className="font-medium text-foreground">{u.fullName ?? '—'}</div>
          <div className="text-xs text-muted-foreground">{u.email}</div>
        </div>
      ),
    },
    { key: 'title', header: 'Title', render: (u) => (u.title ? TITLE_LABELS[u.title] : <span className="text-muted-foreground">—</span>) },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    {
      key: 'actions',
      header: '',
      width: '64px',
      render: (u) => (
        <Tooltip content="Set title">
          <button onClick={() => setEditUser(u)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
            <ShieldCheck size={16} />
          </button>
        </Tooltip>
      ),
    },
  ]

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">People</h2>
      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
          <DataTable columns={columns} data={data ?? []} rowKey={(u) => u.id} emptyTitle="No people" emptyDescription="Invite super admins from the Super Admins page first." />
        )}
      </div>

      <SlideOver open={!!editUser} onClose={() => { setEditUser(null); setError('') }} title="Set title">
        {editUser && (
          <div className="space-y-4">
            <div>
              <div className="font-medium text-foreground">{editUser.fullName ?? editUser.email}</div>
              <div className="text-xs text-muted-foreground">{editUser.email}</div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => pick(null)}
                disabled={busy}
                className={`w-full text-left rounded-md border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${editUser.title === null ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
              >
                No title
              </button>
              {(Object.keys(TITLE_LABELS) as ProfileTitle[]).map((t) => (
                <button
                  key={t}
                  onClick={() => pick(t)}
                  disabled={busy}
                  className={`w-full text-left rounded-md border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${editUser.title === t ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
                >
                  {TITLE_LABELS[t]}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </SlideOver>
    </section>
  )
}

// ─── Teams ────────────────────────────────────────────────────────────────────

function TeamsSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useTeams()
  const { data: people } = useSuperAdmins()
  const [editTeam, setEditTeam] = useState<TeamSummary | 'new' | null>(null)
  const [membersTeam, setMembersTeam] = useState<TeamSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamSummary | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['teams'] })

  const columns: Column<TeamSummary>[] = [
    { key: 'name', header: 'Team', render: (t) => <span className="font-medium text-foreground">{t.name}</span> },
    { key: 'lead', header: 'Lead', render: (t) => t.leadName ?? <span className="text-muted-foreground">—</span> },
    { key: 'members', header: 'Members', render: (t) => <span className="tabular-nums text-muted-foreground">{t.memberCount}</span> },
    {
      key: 'actions',
      header: '',
      width: '120px',
      render: (t) => (
        <div className="flex items-center gap-1 justify-end">
          <Tooltip content="Manage members">
            <button onClick={() => setMembersTeam(t)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
              <UsersIcon size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Edit team">
            <button onClick={() => setEditTeam(t)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
              <Pencil size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Delete team">
            <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600">
              <Trash2 size={16} />
            </button>
          </Tooltip>
        </div>
      ),
    },
  ]

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteTeam(deleteTarget.id)
    await refresh()
    setDeleteTarget(null)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Teams</h2>
        <button
          onClick={() => setEditTeam('new')}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> New team
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
          <DataTable columns={columns} data={data ?? []} rowKey={(t) => t.id} emptyTitle="No teams" emptyDescription="Create the first team." />
        )}
      </div>

      <TeamEditModal target={editTeam} people={people ?? []} onClose={() => setEditTeam(null)} onDone={refresh} />
      <TeamMembersSlideOver team={membersTeam} people={people ?? []} onClose={() => setMembersTeam(null)} onDone={refresh} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete ${deleteTarget?.name ?? ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-foreground">Delete this team? Its members keep their account/project assignments — only team membership and lead are removed.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50">Cancel</button>
            <button onClick={handleDelete} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">Delete</button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function TeamEditModal({ target, people, onClose, onDone }: { target: TeamSummary | 'new' | null; people: ManagedUser[]; onClose: () => void; onDone: () => void }) {
  const isNew = target === 'new'
  const existing = target && target !== 'new' ? target : null
  const [name, setName] = useState('')
  const [leadId, setLeadId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [seededFor, setSeededFor] = useState<string | null>(null)

  const seedKey = existing?.id ?? (isNew ? 'new' : null)
  if (seedKey && seedKey !== seededFor) {
    setSeededFor(seedKey)
    setName(existing?.name ?? '')
    setLeadId(existing?.leadProfileId ?? '')
    setError('')
  }

  const leadCandidates = people.filter((p) => p.title === 'edl' || p.title === 'ta')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (existing) {
        await updateTeam(existing.id, { name: name.trim(), leadProfileId: leadId || null })
      } else {
        await createTeam(name.trim(), leadId || null)
      }
      onDone()
      setSeededFor(null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!target} onClose={() => { setSeededFor(null); onClose() }} title={existing ? 'Edit team' : 'New team'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="e.g. Enterprise Pod" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Lead (EDL or TA)</label>
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            <option value="">No lead</option>
            {leadCandidates.map((p) => <option key={p.id} value={p.id}>{p.fullName ?? p.email} ({TITLE_LABELS[p.title!]})</option>)}
          </select>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create team'}
        </button>
      </form>
    </Modal>
  )
}

function TeamMembersSlideOver({ team, people, onClose, onDone }: { team: TeamSummary | null; people: ManagedUser[]; onClose: () => void; onDone: () => void }) {
  const { data: memberIds } = useTeamMemberIds(team?.id ?? null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const memberSet = useMemo(() => new Set(memberIds ?? []), [memberIds])

  async function toggle(profileId: string, isMember: boolean) {
    if (!team) return
    setBusyId(profileId)
    try {
      if (isMember) await removeTeamMember(team.id, profileId)
      else await addTeamMember(team.id, profileId)
      onDone()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SlideOver open={!!team} onClose={onClose} title={`Members — ${team?.name ?? ''}`}>
      {team && (
        <div className="space-y-2">
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No people to add yet.</p>
          ) : (
            people.map((p) => {
              const isMember = memberSet.has(p.id)
              return (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">{p.fullName ?? p.email}</div>
                    <div className="text-xs text-muted-foreground">{p.title ? TITLE_LABELS[p.title] : '—'}</div>
                  </div>
                  <button
                    onClick={() => toggle(p.id, isMember)}
                    disabled={busyId === p.id}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${isMember ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                  >
                    {isMember ? 'Remove' : 'Add'}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}
    </SlideOver>
  )
}

// ─── Accounts (ScopeSwitcher + SavedViewsMenu proof surface) ───────────────────

const PAGE = 'team-structure-accounts'

function AccountsSection() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useAssignableAccounts()
  const { data: people } = useSuperAdmins()
  const { scope, scopeTarget, setScope } = useScope(PAGE)
  const { data: scopedIds } = useScopedAccountIds(scope, scopeTarget)
  const [filters] = useState<Record<string, unknown>>({})
  const [assignTarget, setAssignTarget] = useState<AccountListRow | null>(null)

  const refreshAccounts = () => qc.invalidateQueries({ queryKey: ['assignable-accounts'] })

  const filtered = useMemo(() => {
    if (!data) return []
    if (scopedIds === null || scopedIds === undefined) return data // "everyone" or not yet resolved
    const allowed = new Set(scopedIds)
    return data.filter((a) => allowed.has(a.id))
  }, [data, scopedIds])

  function applyView(v: SavedView) {
    setScope(v.scope, v.scopeTarget)
  }

  const columns: Column<AccountListRow>[] = [
    { key: 'name', header: 'Account', render: (a) => <span className="font-medium text-foreground">{a.name}</span> },
    { key: 'deployment', header: 'Deployment', render: (a) => <span className="text-muted-foreground capitalize">{a.deploymentType.replace(/_/g, ' ')}</span> },
    { key: 'health', header: 'Health', render: (a) => <StatusBadge status={a.health} /> },
    { key: 'assignments', header: 'Assignments', render: (a) => <span className="tabular-nums text-muted-foreground">{a.assignmentCount}</span> },
    {
      key: 'actions',
      header: '',
      width: '64px',
      render: (a) => (
        <Tooltip content="Manage assignments">
          <button onClick={() => setAssignTarget(a)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
            <UserPlus size={16} />
          </button>
        </Tooltip>
      ),
    },
  ]

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
        <div className="flex items-center gap-2">
          <ScopeSwitcher scope={scope} scopeTarget={scopeTarget} onChange={setScope} />
          <SavedViewsMenu page={PAGE} currentScope={scope} currentScopeTarget={scopeTarget} currentFilters={filters} onApply={applyView} />
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
          <DataTable columns={columns} data={filtered} rowKey={(a) => a.id} emptyTitle="No accounts in this scope" emptyDescription="Try a different scope, or assign yourself to an account." />
        )}
      </div>

      <AccountAssignmentsSlideOver account={assignTarget} people={people ?? []} onClose={() => setAssignTarget(null)} onDone={refreshAccounts} />
    </section>
  )
}

function AccountAssignmentsSlideOver({ account, people, onClose, onDone }: { account: AccountListRow | null; people: ManagedUser[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const { data: assignments, isLoading } = useAccountAssignments(account?.id ?? null)
  const [addOpen, setAddOpen] = useState(false)
  const [pickProfile, setPickProfile] = useState('')
  const [pickRole, setPickRole] = useState<AssignmentRole>('fde')
  const [pickPrimary, setPickPrimary] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['account-assignments', account?.id] })
    onDone()
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!account || !pickProfile) return
    setBusy(true)
    setError('')
    try {
      await addAccountAssignment(account.id, pickProfile, pickRole, pickPrimary)
      refresh()
      setAddOpen(false)
      setPickProfile('')
      setPickPrimary(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setBusy(false)
    }
  }

  async function togglePrimary(id: string, isPrimary: boolean) {
    await setAccountAssignmentPrimary(id, !isPrimary)
    refresh()
  }

  async function remove(id: string) {
    await removeAccountAssignment(id)
    refresh()
  }

  return (
    <SlideOver open={!!account} onClose={() => { onClose(); setAddOpen(false); setError('') }} title={`Assignments — ${account?.name ?? ''}`}>
      {account && (
        <div className="space-y-4">
          {isLoading ? (
            <CardSkeleton />
          ) : (assignments ?? []).length === 0 && !addOpen ? (
            <p className="text-sm text-muted-foreground">No one assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {(assignments ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">{a.profileName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{ROLE_LABELS[a.role]}{a.isPrimary ? ' · primary' : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip content={a.isPrimary ? 'Unset primary' : 'Set as primary'}>
                      <button onClick={() => togglePrimary(a.id, a.isPrimary)} className={`text-xs font-medium px-2 py-1 rounded ${a.isPrimary ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                        Primary
                      </button>
                    </Tooltip>
                    <Tooltip content="Remove">
                      <button onClick={() => remove(a.id)} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600">
                        <X size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <Plus size={16} /> Assign someone
            </button>
          ) : (
            <form onSubmit={handleAdd} className="space-y-3 rounded-md border border-border p-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Person</label>
                <select value={pickProfile} onChange={(e) => setPickProfile(e.target.value)} className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm bg-white">
                  <option value="">Select…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.fullName ?? p.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Role</label>
                <select value={pickRole} onChange={(e) => setPickRole(e.target.value as AssignmentRole)} className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm bg-white">
                  <option value="edl">EDL</option>
                  <option value="ta">TA</option>
                  <option value="fde">FDE</option>
                </select>
              </div>
              <Toggle id="pick-primary" label="Primary for this role" checked={pickPrimary} onCheckedChange={setPickPrimary} />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !pickProfile} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">
                  {busy ? 'Assigning…' : 'Assign'}
                </button>
                <button type="button" onClick={() => setAddOpen(false)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </SlideOver>
  )
}
