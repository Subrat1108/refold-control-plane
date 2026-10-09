import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import {
  usePeopleDirectory,
  usePersonRoles,
  usePersonActivity,
  useAccountsRaw,
  addRole,
  endRole,
  useActionItems,
  updateActionItem,
  useRecentEntriesForPerson,
  type PersonRow,
} from '@/hooks'
import { setReportsTo } from '@/lib/provisioning'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { SlideOver } from '@/components/SlideOver'
import { Tooltip } from '@/components/Tooltip'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { formatDate } from '@/utils/formatDate'
import type { AssignmentRole } from '@/types'

const ROLE_LABELS: Record<AssignmentRole, string> = { edl: 'EDL', ta: 'TA', fde: 'FDE' }

// Equal-admins model: every admin is a peer. This is just a directory —
// who reports to whom (optional, UX only, never permissions) and who holds
// which per-account role (record-keeping only). No titles, no teams.
export function PeoplePage() {
  const { data: people, isLoading, isError, refetch } = usePeopleDirectory()
  const [rolesTarget, setRolesTarget] = useState<PersonRow | null>(null)

  const columns: Column<PersonRow>[] = [
    { key: 'name', header: 'Name', render: (p) => <span className="font-medium text-foreground">{p.fullName ?? p.email}</span> },
    { key: 'email', header: 'Email', render: (p) => <span className="text-muted-foreground">{p.email}</span> },
    { key: 'reportsTo', header: 'Reports to', render: (p) => <ReportsToCell person={p} people={people ?? []} /> },
    { key: 'roles', header: 'Active roles', render: (p) => <span className="tabular-nums text-muted-foreground">{p.activeRoleCount}</span> },
    {
      key: 'actions',
      header: '',
      width: '120px',
      render: (p) => (
        <Tooltip content="Manage account roles">
          <button onClick={() => setRolesTarget(p)} className="text-xs font-medium text-primary hover:underline">Manage roles</button>
        </Tooltip>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">People</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Every admin, who (optionally) reports to whom, and their account roles.</p>
      </div>
      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
          <DataTable columns={columns} data={people ?? []} rowKey={(p) => p.id} emptyTitle="No people yet" />
        )}
      </div>
      <RolesSlideOver person={rolesTarget} onClose={() => setRolesTarget(null)} />
    </div>
  )
}

function ReportsToCell({ person, people }: { person: PersonRow; people: PersonRow[] }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setBusy(true)
    try {
      await setReportsTo(person.id, e.target.value || null)
      qc.invalidateQueries({ queryKey: ['people-directory'] })
      qc.invalidateQueries({ queryKey: ['has-reports'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <select
      value={person.reportsTo ?? ''}
      onChange={handleChange}
      disabled={busy}
      className="rounded-md border border-border px-2 py-1 text-sm bg-white disabled:opacity-50"
    >
      <option value="">—</option>
      {people.filter((p) => p.id !== person.id).map((p) => (
        <option key={p.id} value={p.id}>{p.fullName ?? p.email}</option>
      ))}
    </select>
  )
}

function RolesSlideOver({ person, onClose }: { person: PersonRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: roles, isLoading } = usePersonRoles(person?.id ?? null)
  const { data: accounts } = useAccountsRaw()
  const { data: activity } = usePersonActivity(person?.id ?? null)
  const { data: openItems } = useActionItems({ ownerProfileId: person?.id, status: 'open' })
  const { data: recentEntries } = useRecentEntriesForPerson(person?.id ?? null)
  const [addOpen, setAddOpen] = useState(false)
  const [pickOrg, setPickOrg] = useState('')
  const [pickRole, setPickRole] = useState<AssignmentRole>('fde')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['person-roles', person?.id] })
    qc.invalidateQueries({ queryKey: ['people-directory'] })
  }

  const active = (roles ?? []).filter((r) => !r.endedAt)
  const ended = (roles ?? []).filter((r) => r.endedAt)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!person || !pickOrg) return
    setBusy(true)
    setError('')
    try {
      await addRole(pickOrg, person.id, pickRole)
      setAddOpen(false)
      setPickOrg('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add role')
    } finally {
      setBusy(false)
    }
  }

  async function handleEnd(id: string) {
    await endRole(id)
    refresh()
  }

  return (
    <SlideOver open={!!person} onClose={() => { onClose(); setAddOpen(false); setError('') }} title={`Account roles — ${person?.fullName ?? person?.email ?? ''}`}>
      {person && (
        <div className="space-y-4">
          {isLoading ? <CardSkeleton /> : (
            <div className="space-y-2">
              {active.length === 0 && <p className="text-sm text-muted-foreground">No active roles.</p>}
              {active.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.accountName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground uppercase">{ROLE_LABELS[r.role]}</p>
                  </div>
                  <Tooltip content="End this role">
                    <button onClick={() => handleEnd(r.id)} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600">
                      <X size={16} />
                    </button>
                  </Tooltip>
                </div>
              ))}
              {ended.length > 0 && (
                <div className="pt-3 border-t border-border space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">History</p>
                  {ended.map((r) => (
                    <p key={r.id} className="text-xs text-muted-foreground">
                      {r.accountName ?? '—'} · {ROLE_LABELS[r.role]} <StatusBadge status="ended" className="ml-1" />
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-border space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Open action items</p>
            {(openItems ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
              (openItems ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{item.description}{item.dueDate && <span className="text-muted-foreground"> (due {item.dueDate})</span>}</span>
                  <button onClick={() => updateActionItem(item.id, { status: 'done' }).then(() => qc.invalidateQueries({ queryKey: ['action-items'] }))} className="text-xs text-primary hover:underline shrink-0">Mark done</button>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-border space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Recent standup entries</p>
            {(recentEntries ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
              (recentEntries ?? []).map((e) => (
                <p key={e.id} className="text-xs text-muted-foreground">
                  <span className="text-foreground">{e.standupDate}</span>{e.yesterday ? ` — ${e.yesterday}` : ''}
                </p>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-border space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Recent activity</p>
            {(activity ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
              (activity ?? []).map((a) => (
                <p key={a.id} className="text-xs text-muted-foreground">
                  {a.action.replace(/_/g, ' ')} {a.recordTable?.replace(/_/g, ' ')} · {formatDate(a.createdAt)}
                </p>
              ))
            )}
          </div>

          {addOpen ? (
            <form onSubmit={handleAdd} className="space-y-3 pt-3 border-t border-border">
              <select value={pickOrg} onChange={(e) => setPickOrg(e.target.value)} className="w-full rounded-md border border-border px-2 py-1.5 text-sm">
                <option value="">Select account…</option>
                {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={pickRole} onChange={(e) => setPickRole(e.target.value as AssignmentRole)} className="w-full rounded-md border border-border px-2 py-1.5 text-sm">
                <option value="edl">EDL</option>
                <option value="ta">TA</option>
                <option value="fde">FDE</option>
              </select>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setAddOpen(false)} className="flex-1 rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={busy || !pickOrg} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">{busy ? 'Adding…' : 'Add role'}</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAddOpen(true)} className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted pt-3">
              <Plus size={16} /> Add a role
            </button>
          )}
        </div>
      )}
    </SlideOver>
  )
}
