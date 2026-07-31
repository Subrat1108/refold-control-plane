import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus, ShieldCheck, Ban, RotateCcw } from 'lucide-react'
import { useSuperAdmins, useSubRoles } from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { Modal } from '@/components/Modal'
import { SlideOver } from '@/components/SlideOver'
import { Tooltip } from '@/components/Tooltip'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { formatDate } from '@/utils/formatDate'
import { inviteSuperAdmin, assignSubRole, setUserStatus } from '@/lib/provisioning'
import type { ManagedUser } from '@/types'

// Phase 6.4a — super-admin user management (ADMIN portal only). Lists internal
// super-admins; invite a new one, change their (system) sub-role, disable/enable.
// All writes go through the provisioning Edge Function (super_admin + AAL2 gated).
export function SuperAdminsPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useSuperAdmins()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editUser, setEditUser] = useState<ManagedUser | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['super-admins'] })

  async function toggleStatus(user: ManagedUser) {
    setBusyId(user.id)
    try {
      await setUserStatus(user.id, user.status === 'disabled' ? 'active' : 'disabled')
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusyId(null)
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
    { key: 'subRole', header: 'Sub-role', render: (u) => u.subRoleName ?? <span className="text-muted-foreground">—</span> },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'created', header: 'Created', render: (u) => <span className="text-muted-foreground">{formatDate(u.createdAt)}</span> },
    {
      key: 'actions',
      header: '',
      width: '96px',
      render: (u) => (
        <div className="flex items-center gap-1 justify-end">
          <Tooltip content="Change sub-role">
            <button onClick={() => setEditUser(u)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
              <ShieldCheck size={16} />
            </button>
          </Tooltip>
          <Tooltip content={u.status === 'disabled' ? 'Enable user' : 'Disable user'}>
            <button
              onClick={() => toggleStatus(u)}
              disabled={busyId === u.id}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {u.status === 'disabled' ? <RotateCcw size={16} /> : <Ban size={16} />}
            </button>
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Super Admins</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Refold internal team members and their access.</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <UserPlus size={16} /> Invite super admin
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? (
          <CardSkeleton />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
            rowKey={(u) => u.id}
            emptyTitle="No super admins"
            emptyDescription="Invite your first internal team member."
          />
        )}
      </div>

      <InviteSuperAdminModal open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={refresh} />
      <ChangeSubRoleSlideOver user={editUser} onClose={() => setEditUser(null)} onDone={refresh} />
    </div>
  )
}

function InviteSuperAdminModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { data: subRoles } = useSubRoles('super_admin')
  const systemRoles = (subRoles ?? []).filter((r) => r.isSystem)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [subRoleId, setSubRoleId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  function reset() {
    setEmail(''); setFullName(''); setSubRoleId(''); setError(''); setSent(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await inviteSuperAdmin({ email: email.trim(), fullName: fullName.trim() || undefined, subRoleId: subRoleId || null })
      setSent(email.trim())
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Invite super admin">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">Invitation sent to <span className="font-medium">{sent}</span>. They’ll set a password via the emailed link.</p>
          <button onClick={() => { reset(); onClose() }} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} placeholder="name@refold.internal" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full name <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Priya Sharma" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Sub-role</label>
            <select value={subRoleId} onChange={(e) => setSubRoleId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">No sub-role</option>
              {systemRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy || !email} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}
    </Modal>
  )
}

function ChangeSubRoleSlideOver({ user, onClose, onDone }: { user: ManagedUser | null; onClose: () => void; onDone: () => void }) {
  const { data: subRoles } = useSubRoles('super_admin')
  const systemRoles = (subRoles ?? []).filter((r) => r.isSystem)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(subRoleId: string | null) {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      await assignSubRole(user.id, subRoleId)
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sub-role')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOver open={!!user} onClose={onClose} title="Change sub-role">
      {user && (
        <div className="space-y-4">
          <div>
            <div className="font-medium text-foreground">{user.fullName ?? user.email}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => pick(null)}
              disabled={busy}
              className={`w-full text-left rounded-md border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${user.subRoleId === null ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
            >
              No sub-role
            </button>
            {systemRoles.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r.id)}
                disabled={busy}
                className={`w-full text-left rounded-md border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${user.subRoleId === r.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
              >
                <div className="font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-muted-foreground">{Object.keys(r.permissions).filter((k) => r.permissions[k]).join(', ') || 'no flags'}</div>
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </SlideOver>
  )
}
