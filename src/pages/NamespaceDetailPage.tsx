import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpCircle, ChevronLeft, Eye, EyeOff, Lock, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useNamespaceDetail, useNamespaceOrgs } from '@/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { DataTable, type Column } from '@/components/DataTable'
import { Modal } from '@/components/Modal'
import { Tooltip } from '@/components/Tooltip'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { formatNumber } from '@/utils/formatNumber'
import { isUpgradeAvailable } from '@/utils/semver'
import type { EnvVar, NamespaceDetail, NamespaceOrg, NamespaceStatus, QueryLike } from '@/types'

const SECRET_MASK = '●●●●●●'

// R2 (D-049/D-051): a namespace hosts multiple orgs. This page shows the
// namespace header + actions (upgrade, decommission), the list of orgs within
// (metrics live on the org — click through), and namespace-level env vars.
export function NamespaceDetailPage() {
  const { orgId, namespaceId } = useParams()
  const nsId = namespaceId ?? ''

  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [decommOpen, setDecommOpen] = useState(false)
  // Header version + status live in local state so a confirmed upgrade /
  // decommission reflects immediately (D-009 — ephemeral, not persisted).
  const [version, setVersion] = useState<string | null>(null)
  const [status, setStatus] = useState<NamespaceStatus | null>(null)

  const detail = useNamespaceDetail(nsId)

  useEffect(() => {
    if (detail.data && version === null) setVersion(detail.data.version)
    if (detail.data && status === null) setStatus(detail.data.status)
  }, [detail.data, version, status])

  if (detail.isLoading) return <PageSkeleton />
  if (detail.isError || !detail.data) return <ErrorState message="Failed to load namespace" onRetry={detail.refetch} />

  const ns = detail.data
  const currentVersion = version ?? ns.version
  const currentStatus = status ?? ns.status
  const decommissioned = currentStatus === 'decommissioned'
  const canUpgrade = !decommissioned && isUpgradeAvailable(currentVersion, ns.latestVersion)

  function confirmUpgrade() {
    setVersion(ns.latestVersion)
    setUpgradeOpen(false)
  }
  function confirmDecommission() {
    setStatus('decommissioned')
    setDecommOpen(false)
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/onprem-customers/${orgId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to organization
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{ns.name}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-sm text-muted-foreground font-mono">{ns.clusterName}</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 font-mono">
              v{currentVersion}
            </span>
            <StatusBadge status={currentStatus} />
          </div>
        </div>
        {!decommissioned && (
          <div className="flex items-center gap-2">
            {canUpgrade && (
              <button
                onClick={() => setUpgradeOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                <ArrowUpCircle className="w-4 h-4" /> Upgrade available
              </button>
            )}
            <button
              onClick={() => setDecommOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              <Power className="w-4 h-4" /> Decommission
            </button>
          </div>
        )}
      </div>

      {/* Organizations within this namespace (metrics live here) */}
      <OrgsSection nsId={nsId} orgId={orgId ?? ''} namespaceId={nsId} />

      {/* Environment Variables (namespace-level) */}
      <EnvVarsSection detail={detail} />

      {/* Upgrade confirmation */}
      <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title={`Upgrade ${ns.name}`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono px-2 py-1 rounded bg-gray-100 text-foreground">{currentVersion}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-mono px-2 py-1 rounded bg-indigo-50 text-indigo-700">{ns.latestVersion}</span>
          </div>
          <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
            This will restart the namespace. Confirm to proceed.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setUpgradeOpen(false)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={confirmUpgrade} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
              Confirm upgrade
            </button>
          </div>
        </div>
      </Modal>

      {/* Decommission confirmation */}
      <Modal open={decommOpen} onClose={() => setDecommOpen(false)} title={`Decommission ${ns.name}`}>
        <div className="space-y-4">
          <p className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">
            Decommissioning this namespace stops all of its orgs. This is a destructive action.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDecommOpen(false)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={confirmDecommission} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
              Decommission
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Organizations section (reuses the DataTable in the customer-list style) ──

function OrgsSection({ nsId, orgId, namespaceId }: { nsId: string; orgId: string; namespaceId: string }) {
  const { data, isLoading, isError, refetch } = useNamespaceOrgs(nsId)

  const columns: Column<NamespaceOrg>[] = [
    {
      key: 'name',
      header: 'Organization',
      render: (o) => (
        <Link
          to={`/onprem-customers/${orgId}/namespaces/${namespaceId}/orgs/${o.id}`}
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          {o.name}
        </Link>
      ),
    },
    { key: 'plan', header: 'Plan', render: (o) => <span className="text-muted-foreground capitalize">{o.plan ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'tenants', header: 'Tenants', render: (o) => <span className="tabular-nums text-muted-foreground">{formatNumber(o.tenants)}</span> },
    { key: 'users', header: 'Users', render: (o) => <span className="tabular-nums text-muted-foreground">{formatNumber(o.activeUsers)}</span> },
    {
      key: 'contact',
      header: 'Contact',
      render: (o) => (
        <div className="text-muted-foreground">
          <div className="font-medium text-foreground text-xs">{o.contactName ?? '—'}</div>
          <div className="text-xs">{o.contactEmail ?? ''}</div>
        </div>
      ),
    },
  ]

  return (
    <div className="bg-white rounded-lg shadow-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">Organizations</h3>
      {isLoading ? (
        <CardSkeleton />
      ) : isError ? (
        <ErrorState message="Failed to load organizations" onRetry={refetch} />
      ) : (
        <DataTable
          columns={columns}
          data={data ?? []}
          rowKey={(o) => o.id}
          emptyTitle="No organizations"
          emptyDescription="This namespace has no organizations yet."
        />
      )}
    </div>
  )
}

// ─── Environment Variables section (namespace-level) ─────────────────────────

type FormMode = { type: 'idle' } | { type: 'add' } | { type: 'edit'; id: string }

function EnvVarsSection({ detail }: { detail: QueryLike<NamespaceDetail> }) {
  const [rows, setRows] = useState<EnvVar[] | null>(null)
  const [mode, setMode] = useState<FormMode>({ type: 'idle' })
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState<EnvVar | null>(null)

  useEffect(() => {
    if (detail.data && rows === null) setRows(detail.data.envVars)
  }, [detail.data, rows])

  if (detail.isLoading || rows === null) {
    return (
      <div className="bg-white rounded-lg shadow-card p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[52px] bg-gray-100 rounded animate-pulse" />)}
      </div>
    )
  }
  if (detail.isError) return <ErrorState message="Failed to load environment variables" onRetry={detail.refetch} />

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAdd(v: { key: string; value: string; isSecret: boolean }) {
    const now = new Date().toISOString()
    setRows((prev) => [
      { id: `ev_new_${Date.now()}`, key: v.key.trim(), value: v.value, isSecret: v.isSecret, updatedAt: now },
      ...(prev ?? []),
    ])
    setMode({ type: 'idle' })
  }

  function handleEditSave(id: string, v: { key: string; value: string; isSecret: boolean }) {
    setRows((prev) =>
      (prev ?? []).map((r) =>
        r.id === id ? { ...r, key: v.key.trim(), value: v.value, isSecret: v.isSecret, updatedAt: new Date().toISOString() } : r
      )
    )
    setMode({ type: 'idle' })
  }

  function handleDelete() {
    if (!deleteTarget) return
    setRows((prev) => (prev ?? []).filter((r) => r.id !== deleteTarget.id))
    setRevealed((prev) => {
      const next = new Set(prev)
      next.delete(deleteTarget.id)
      return next
    })
    setDeleteTarget(null)
  }

  const isAdding = mode.type === 'add'
  const showEmpty = rows.length === 0 && !isAdding

  return (
    <div className="bg-white rounded-lg shadow-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Environment Variables</h3>
        <button
          onClick={() => setMode({ type: 'add' })}
          disabled={isAdding}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Add variable
        </button>
      </div>

      {showEmpty ? (
        <EmptyState title="No environment variables" description="Add a variable to configure this namespace." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Key</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Value</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Secret</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isAdding && <EnvVarFormRow onSave={handleAdd} onCancel={() => setMode({ type: 'idle' })} />}
              {rows.map((row) =>
                mode.type === 'edit' && mode.id === row.id ? (
                  <EnvVarFormRow
                    key={row.id}
                    initial={row}
                    onSave={(v) => handleEditSave(row.id, v)}
                    onCancel={() => setMode({ type: 'idle' })}
                  />
                ) : (
                  <tr key={row.id} className="h-[52px] border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 font-mono text-foreground">{row.key}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">
                          {row.isSecret && !revealed.has(row.id) ? SECRET_MASK : row.value}
                        </span>
                        {row.isSecret && (
                          <Tooltip content={revealed.has(row.id) ? 'Hide value' : 'Show value'}>
                            <button
                              onClick={() => toggleReveal(row.id)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                              aria-label={revealed.has(row.id) ? 'Hide value' : 'Show value'}
                            >
                              {revealed.has(row.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-4">
                      {row.isSecret ? (
                        <Lock className="w-4 h-4 text-amber-600" aria-label="Secret" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4">
                      <div className="flex items-center gap-1">
                        <Tooltip content="Edit">
                          <button
                            onClick={() => setMode({ type: 'edit', id: row.id })}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                            aria-label="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Delete">
                          <button
                            onClick={() => setDeleteTarget(row)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete variable">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Delete <span className="font-mono font-medium">{deleteTarget.key}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function EnvVarFormRow({
  initial,
  onSave,
  onCancel,
}: {
  initial?: EnvVar
  onSave: (v: { key: string; value: string; isSecret: boolean }) => void
  onCancel: () => void
}) {
  const [key, setKey] = useState(initial?.key ?? '')
  const [value, setValue] = useState(initial?.value ?? '')
  const [isSecret, setIsSecret] = useState(initial?.isSecret ?? false)
  const canSave = key.trim().length > 0

  const inputCls = 'w-full rounded-md border border-border px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <tr className="border-b border-border last:border-0 bg-indigo-50/30">
      <td className="px-4 py-2 align-top">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="KEY" className={inputCls} />
      </td>
      <td className="px-4 py-2 align-top">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className={inputCls} />
      </td>
      <td className="px-4 py-2 align-top">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} className="rounded border-border" />
          Secret
        </label>
      </td>
      <td className="px-4 py-2 align-top">
        <div className="flex items-center gap-2">
          <button
            onClick={() => canSave && onSave({ key, value, isSecret })}
            disabled={!canSave}
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button onClick={onCancel} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
      <div className="bg-white rounded-lg shadow-card p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[52px] bg-gray-100 rounded animate-pulse" />)}
      </div>
    </div>
  )
}
