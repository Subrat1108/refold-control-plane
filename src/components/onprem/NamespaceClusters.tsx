import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowUpCircle, Check, KeyRound, Plus } from 'lucide-react'
import { useOnPremOrgDetail } from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { Modal } from '@/components/Modal'
import { SlideOver } from '@/components/SlideOver'
import { Tooltip } from '@/components/Tooltip'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { formatDate } from '@/utils/formatDate'
import { isUpgradeAvailable } from '@/utils/semver'
import type { OnPremNamespaceRow } from '@/types'

interface ClusterGroup {
  clusterId: string
  clusterName: string
  namespaces: OnPremNamespaceRow[]
}

function groupByCluster(namespaces: OnPremNamespaceRow[]): ClusterGroup[] {
  const map = new Map<string, ClusterGroup>()
  for (const ns of namespaces) {
    const existing = map.get(ns.clusterId)
    if (existing) existing.namespaces.push(ns)
    else map.set(ns.clusterId, { clusterId: ns.clusterId, clusterName: ns.clusterName, namespaces: [ns] })
  }
  return Array.from(map.values())
}

// Per-cluster namespace tables + their interactions (upgrade, edit env vars,
// add namespace). Shared by the on-prem org detail page (5.6) and the on-prem
// customer's Namespaces view (5.8). All mutations are component-local (D-009).
export function NamespaceClusters({
  orgId,
  heading,
  showAdd = false,
}: {
  orgId: string
  heading?: string
  showAdd?: boolean
}) {
  const { data, isLoading, isError, refetch } = useOnPremOrgDetail(orgId)

  const [namespaces, setNamespaces] = useState<OnPremNamespaceRow[] | null>(null)
  useEffect(() => {
    if (data && namespaces === null) setNamespaces(data.namespaces)
  }, [data, namespaces])

  const [upgradeTarget, setUpgradeTarget] = useState<OnPremNamespaceRow | null>(null)
  const [envVarsTarget, setEnvVarsTarget] = useState<OnPremNamespaceRow | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const list = useMemo(() => namespaces ?? data?.namespaces ?? [], [namespaces, data])
  const clusters = useMemo(() => groupByCluster(list), [list])
  const latestVersion = data?.latestVersion ?? ''

  function handleUpgradeConfirm() {
    if (!upgradeTarget) return
    setNamespaces((prev) => (prev ?? []).map((n) => (n.id === upgradeTarget.id ? { ...n, version: latestVersion } : n)))
    setUpgradeTarget(null)
  }

  function handleAddNamespace(ns: OnPremNamespaceRow) {
    setNamespaces((prev) => [...(prev ?? []), ns])
    setAddOpen(false)
  }

  const showBar = !!heading || showAdd

  return (
    <div className="space-y-6">
      {showBar && (
        <div className="flex items-center justify-between">
          {heading ? <h2 className="text-sm font-semibold text-foreground">{heading}</h2> : <span />}
          {showAdd && (
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add namespace
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <TablesSkeleton />
      ) : isError || !data ? (
        <ErrorState message="Failed to load namespaces" onRetry={refetch} />
      ) : clusters.length === 0 ? (
        <EmptyState title="No namespaces" description="No namespaces have been provisioned yet." />
      ) : (
        clusters.map((cluster) => (
          <div key={cluster.clusterId} className="bg-white rounded-lg shadow-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 font-mono">{cluster.clusterName}</h3>
            <DataTable
              columns={makeColumns(orgId, latestVersion, setUpgradeTarget, setEnvVarsTarget)}
              data={cluster.namespaces}
              rowKey={(n) => n.id}
            />
          </div>
        ))
      )}

      {/* Upgrade confirmation modal */}
      <Modal open={!!upgradeTarget} onClose={() => setUpgradeTarget(null)} title={`Upgrade ${upgradeTarget?.name ?? ''}`}>
        {upgradeTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-mono px-2 py-1 rounded bg-gray-100 text-foreground">{upgradeTarget.version}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono px-2 py-1 rounded bg-indigo-50 text-indigo-700">{latestVersion}</span>
            </div>
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              This will restart the namespace. Confirm to proceed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setUpgradeTarget(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleUpgradeConfirm} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
                Confirm upgrade
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit env vars slide-over — real panel wired up in 5.7's namespace page */}
      <SlideOver open={!!envVarsTarget} onClose={() => setEnvVarsTarget(null)} title={`Environment variables — ${envVarsTarget?.name ?? ''}`}>
        <p className="text-sm text-muted-foreground">
          Manage environment variables from the namespace detail page.
        </p>
      </SlideOver>

      {/* Add namespace slide-over */}
      <AddNamespaceSlideOver
        open={addOpen}
        onClose={() => setAddOpen(false)}
        orgId={orgId}
        clusters={clusters}
        latestVersion={latestVersion}
        onAdd={handleAddNamespace}
      />
    </div>
  )
}

function makeColumns(
  orgId: string,
  latestVersion: string,
  onUpgrade: (ns: OnPremNamespaceRow) => void,
  onEditEnv: (ns: OnPremNamespaceRow) => void
): Column<OnPremNamespaceRow>[] {
  return [
    { key: 'name', header: 'Namespace', render: (n) => <span className="font-medium text-foreground">{n.name}</span> },
    { key: 'status', header: 'Status', render: (n) => <StatusBadge status={n.status} /> },
    { key: 'version', header: 'Refold Version', render: (n) => <span className="font-mono text-muted-foreground">{n.version}</span> },
    {
      key: 'upgrade',
      header: 'Upgrade Available',
      render: (n) =>
        isUpgradeAvailable(n.version, latestVersion) ? (
          <span className="font-mono text-amber-700">→ {latestVersion}</span>
        ) : (
          <Check className="w-4 h-4 text-green-600" aria-label="Up to date" />
        ),
    },
    { key: 'created', header: 'Created', render: (n) => <span className="text-muted-foreground">{formatDate(n.createdAt).split(',')[0]}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (n) => {
        const canUpgrade = isUpgradeAvailable(n.version, latestVersion)
        return (
          <div className="flex items-center gap-1">
            <Tooltip content="View metrics">
              <Link
                to={`/onprem-customers/${orgId}/namespaces/${n.id}`}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                aria-label="View metrics"
              >
                <Activity className="w-4 h-4" />
              </Link>
            </Tooltip>
            <Tooltip content="Edit env vars">
              <button
                onClick={() => onEditEnv(n)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                aria-label="Edit env vars"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content={canUpgrade ? 'Upgrade' : 'Up to date'}>
              <button
                onClick={() => canUpgrade && onUpgrade(n)}
                disabled={!canUpgrade}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                aria-label="Upgrade"
              >
                <ArrowUpCircle className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        )
      },
    },
  ]
}

const NEW_CLUSTER = '__new__'

function AddNamespaceSlideOver({
  open,
  onClose,
  orgId,
  clusters,
  latestVersion,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  orgId: string
  clusters: ClusterGroup[]
  latestVersion: string
  onAdd: (ns: OnPremNamespaceRow) => void
}) {
  const [name, setName] = useState('')
  const [clusterChoice, setClusterChoice] = useState('')
  const [newClusterName, setNewClusterName] = useState('')
  const [version, setVersion] = useState(latestVersion)

  useEffect(() => {
    if (open) {
      setName('')
      setClusterChoice(clusters[0]?.clusterId ?? NEW_CLUSTER)
      setNewClusterName('')
      setVersion(latestVersion)
    }
  }, [open, clusters, latestVersion])

  const isNewCluster = clusterChoice === NEW_CLUSTER
  const canSubmit =
    name.trim().length > 0 && version.trim().length > 0 && (!isNewCluster || newClusterName.trim().length > 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const now = new Date().toISOString()
    const clusterId = isNewCluster ? `cls_new_${Date.now()}` : clusterChoice
    const clusterName = isNewCluster
      ? newClusterName.trim()
      : clusters.find((c) => c.clusterId === clusterChoice)?.clusterName ?? newClusterName.trim()

    onAdd({
      id: `ns_new_${Date.now()}`,
      name: name.trim(),
      orgId,
      clusterId,
      clusterName,
      status: 'running',
      version: version.trim(),
      lastSeen: now,
      activeWorkflows: 0,
      executionsToday: 0,
      createdAt: now,
    })
  }

  return (
    <SlideOver open={open} onClose={onClose} title="Add namespace">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Namespace name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="production" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Cluster</label>
          <select value={clusterChoice} onChange={(e) => setClusterChoice(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            {clusters.map((c) => (
              <option key={c.clusterId} value={c.clusterId}>{c.clusterName}</option>
            ))}
            <option value={NEW_CLUSTER}>New cluster…</option>
          </select>
        </div>

        {isNewCluster && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">New cluster name</label>
            <input value={newClusterName} onChange={(e) => setNewClusterName(e.target.value)} placeholder="frankfurt-prod-cluster" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Initial Refold version</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors">Cancel</button>
          <button type="submit" disabled={!canSubmit} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Add namespace</button>
        </div>
      </form>
    </SlideOver>
  )
}

function TablesSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-card p-6 space-y-3">
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-4" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[52px] bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}
