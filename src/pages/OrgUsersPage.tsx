import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus, ShieldCheck, Ban, RotateCcw, Plus, Pencil } from 'lucide-react'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import {
  useOrgUsers,
  useSubRoles,
  createOrgSubRole,
  updateOrgSubRole,
} from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { Modal } from '@/components/Modal'
import { SlideOver } from '@/components/SlideOver'
import { Tooltip } from '@/components/Tooltip'
import { Toggle } from '@/components/Toggle'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { AccessDenied } from '@/components/AccessDenied'
import { formatDate } from '@/utils/formatDate'
import { ownerInviteUser, ownerAssignSubRole, ownerSetUserStatus } from '@/lib/provisioning'
import type { AccountType, ManagedUser, SubRole } from '@/types'

// Customer-owner user management (CLOUD + ONPREM portals — 6.4b). Owners manage
// users and sub-roles WITHIN their own org only; all writes go through the
// provisioning Edge Function (owner + AAL2 lane) or RLS-gated direct writes
// (org sub-roles). Members never reach this page (owner-gated below + nav-gated).
export function OrgUsersPage() {
  const { profile } = useSupabaseAuth()

  // Owner-only. Members in the customer portals are redirected here by nav but
  // must not manage users — show Access Denied rather than a broken page.
  if (!profile || profile.role !== 'owner') {
    return <AccessDenied message="Only the organization owner can manage users." />
  }

  return <OrgUsersInner accountType={profile.accountType} orgId={profile.orgId} selfId={profile.id} />
}

function OrgUsersInner({ accountType, orgId, selfId }: { accountType: AccountType; orgId: string; selfId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useOrgUsers()
  const { data: subRoles } = useSubRoles(accountType)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editUser, setEditUser] = useState<ManagedUser | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const assignable = useMemo(
    () => (subRoles ?? []).filter((r) => r.isSystem || r.orgId === orgId),
    [subRoles, orgId],
  )
  const refresh = () => qc.invalidateQueries({ queryKey: ['org-users'] })

  async function toggleStatus(user: ManagedUser) {
    setBusyId(user.id)
    try {
      await ownerSetUserStatus(user.id, user.status === 'disabled' ? 'active' : 'disabled')
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
    { key: 'role', header: 'Role', render: (u) => <span className="capitalize text-muted-foreground">{u.role}</span> },
    { key: 'subRole', header: 'Sub-role', render: (u) => u.subRoleName ?? <span className="text-muted-foreground">—</span> },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'created', header: 'Joined', render: (u) => <span className="text-muted-foreground">{formatDate(u.createdAt)}</span> },
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
          {u.id !== selfId && (
            <Tooltip content={u.status === 'disabled' ? 'Enable user' : 'Disable user'}>
              <button
                onClick={() => toggleStatus(u)}
                disabled={busyId === u.id}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {u.status === 'disabled' ? <RotateCcw size={16} /> : <Ban size={16} />}
              </button>
            </Tooltip>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage the people in your organization and their access.</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <UserPlus size={16} /> Invite user
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
            emptyTitle="No users yet"
            emptyDescription="Invite your first teammate."
          />
        )}
      </div>

      <OrgSubRolesEditor accountType={accountType} orgId={orgId} />

      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} assignable={assignable} onDone={refresh} />
      <ChangeSubRoleSlideOver user={editUser} assignable={assignable} onClose={() => setEditUser(null)} onDone={refresh} />
    </div>
  )
}

function InviteUserModal({
  open,
  onClose,
  assignable,
  onDone,
}: {
  open: boolean
  onClose: () => void
  assignable: SubRole[]
  onDone: () => void
}) {
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
      await ownerInviteUser({ email: email.trim(), fullName: fullName.trim() || undefined, subRoleId: subRoleId || null })
      setSent(email.trim())
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Invite user">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">Invitation sent to <span className="font-medium">{sent}</span>. They’ll set a password via the emailed link.</p>
          <button onClick={() => { reset(); onClose() }} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} placeholder="teammate@company.com" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full name <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Lee" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Sub-role</label>
            <select value={subRoleId} onChange={(e) => setSubRoleId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">No sub-role</option>
              {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isSystem ? '' : ' (custom)'}</option>)}
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

function ChangeSubRoleSlideOver({
  user,
  assignable,
  onClose,
  onDone,
}: {
  user: ManagedUser | null
  assignable: SubRole[]
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(subRoleId: string | null) {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      await ownerAssignSubRole(user.id, subRoleId)
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
            {assignable.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r.id)}
                disabled={busy}
                className={`w-full text-left rounded-md border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${user.subRoleId === r.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
              >
                <div className="font-medium text-foreground">{r.name}{r.isSystem ? '' : ' (custom)'}</div>
                <div className="text-xs text-muted-foreground">{permsLabel(r.permissions)}</div>
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </SlideOver>
  )
}

// ── org sub-role editor ───────────────────────────────────────────────────────
const PERMISSION_FLAGS: { key: string; label: string }[] = [
  { key: 'read', label: 'Read' },
  { key: 'export', label: 'Export data' },
  { key: 'manage_users', label: 'Manage users' },
  { key: 'manage_org', label: 'Manage org settings' },
]

function permsLabel(p: Record<string, boolean>): string {
  const on = Object.keys(p).filter((k) => p[k])
  return on.length ? on.join(', ') : 'no flags'
}

function OrgSubRolesEditor({ accountType, orgId }: { accountType: AccountType; orgId: string }) {
  const qc = useQueryClient()
  const { data: subRoles, isLoading } = useSubRoles(accountType)
  const [editing, setEditing] = useState<SubRole | 'new' | null>(null)

  const orgRoles = useMemo(
    () => (subRoles ?? []).filter((r) => !r.isSystem && r.orgId === orgId),
    [subRoles, orgId],
  )
  const refresh = () => qc.invalidateQueries({ queryKey: ['sub-roles', accountType] })

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Custom sub-roles</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Roles you define for your org, in addition to the built-in ones.</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
          <Plus size={14} /> New sub-role
        </button>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : orgRoles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No custom sub-roles yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {orgRoles.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-muted-foreground">{permsLabel(r.permissions)}</div>
              </div>
              <Tooltip content="Edit sub-role">
                <button onClick={() => setEditing(r)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                  <Pencil size={15} />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      <SubRoleEditorModal
        target={editing}
        accountType={accountType}
        orgId={orgId}
        onClose={() => setEditing(null)}
        onDone={refresh}
      />
    </div>
  )
}

function SubRoleEditorModal({
  target,
  accountType,
  orgId,
  onClose,
  onDone,
}: {
  target: SubRole | 'new' | null
  accountType: AccountType
  orgId: string
  onClose: () => void
  onDone: () => void
}) {
  const isNew = target === 'new'
  const existing = target && target !== 'new' ? target : null
  const [name, setName] = useState('')
  const [perms, setPerms] = useState<Record<string, boolean>>({ read: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [seededFor, setSeededFor] = useState<string | null>(null)

  // Seed form when the target changes (id for existing, 'new' sentinel for create).
  const seedKey = existing?.id ?? (isNew ? 'new' : null)
  if (seedKey && seedKey !== seededFor) {
    setSeededFor(seedKey)
    setName(existing?.name ?? '')
    setPerms(existing?.permissions ?? { read: true })
    setError('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (existing) {
        await updateOrgSubRole(existing.id, { name: name.trim(), permissions: perms })
      } else {
        await createOrgSubRole({ accountType, orgId, name: name.trim(), permissions: perms })
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
    <Modal open={!!target} onClose={() => { setSeededFor(null); onClose() }} title={existing ? 'Edit sub-role' : 'New sub-role'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="e.g. Finance" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div>
          <span className="block text-sm font-medium text-foreground mb-2">Permissions</span>
          <div className="space-y-2.5">
            {PERMISSION_FLAGS.map((f) => (
              <Toggle
                key={f.key}
                id={`perm-${f.key}`}
                label={f.label}
                checked={!!perms[f.key]}
                onCheckedChange={(v) => setPerms((p) => ({ ...p, [f.key]: v }))}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create sub-role'}
        </button>
      </form>
    </Modal>
  )
}
