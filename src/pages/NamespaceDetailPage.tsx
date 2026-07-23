import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpCircle, ChevronLeft, Eye, EyeOff, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  useNamespaceDetail,
  useNamespaceMetrics,
  useNamespaceCharts,
  useAiCredits,
} from '@/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Tabs, type TabItem } from '@/components/Tabs'
import { Modal } from '@/components/Modal'
import { Tooltip } from '@/components/Tooltip'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import {
  OverviewTab,
  TenantsTab,
  UsageTab,
  WorkflowsTab,
  ConnectorsTab,
} from '@/components/detail/DetailTabs'
import { isUpgradeAvailable } from '@/utils/semver'
import type { EnvVar, NamespaceDetail, QueryLike } from '@/types'

const SECRET_MASK = '●●●●●●'

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'usage', label: 'Usage' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'env', label: 'Environment Variables' },
]

export function NamespaceDetailPage() {
  const { orgId, namespaceId } = useParams()
  const nsId = namespaceId ?? ''

  const [tab, setTab] = useState('overview')
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  // Header version lives in local state so a confirmed upgrade reflects
  // immediately (D-009 — ephemeral, not persisted to the mock layer).
  const [version, setVersion] = useState<string | null>(null)

  const detail = useNamespaceDetail(nsId)
  const metrics = useNamespaceMetrics(nsId)
  const charts = useNamespaceCharts(nsId)
  const credits = useAiCredits(nsId)

  useEffect(() => {
    if (detail.data && version === null) setVersion(detail.data.version)
  }, [detail.data, version])

  if (detail.isLoading) return <PageSkeleton />
  if (detail.isError || !detail.data) return <ErrorState message="Failed to load namespace" onRetry={detail.refetch} />

  const ns = detail.data
  // Cross-org access is enforced at the route level by OrgScopeGuard (D-014).

  const currentVersion = version ?? ns.version
  const canUpgrade = isUpgradeAvailable(currentVersion, ns.latestVersion)

  function confirmUpgrade() {
    setVersion(ns.latestVersion)
    setUpgradeOpen(false)
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
            <StatusBadge status={ns.status} />
          </div>
        </div>
        {canUpgrade && (
          <button
            onClick={() => setUpgradeOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <ArrowUpCircle className="w-4 h-4" /> Upgrade available
          </button>
        )}
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab metrics={metrics} charts={charts} credits={credits} />}
      {tab === 'tenants' && <TenantsTab metrics={metrics} />}
      {tab === 'usage' && <UsageTab metrics={metrics} charts={charts} />}
      {tab === 'workflows' && <WorkflowsTab metrics={metrics} charts={charts} />}
      {tab === 'connectors' && <ConnectorsTab metrics={metrics} />}
      {tab === 'env' && <EnvVarsTab detail={detail} />}

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
    </div>
  )
}

// ─── Environment Variables tab ───────────────────────────────────────────────

type FormMode = { type: 'idle' } | { type: 'add' } | { type: 'edit'; id: string }

function EnvVarsTab({ detail }: { detail: QueryLike<NamespaceDetail> }) {
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-card p-6 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-24 mb-4" />
            <div className="h-7 bg-gray-200 rounded w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
