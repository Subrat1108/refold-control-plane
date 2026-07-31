import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpCircle, Check, Plus, Power } from 'lucide-react'
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
import type { Cluster, OnPremClusterGroup, OnPremNamespaceRow } from '@/types'

// R2 (D-050/D-052): per-cluster namespace tables. Clusters and namespaces are
// decommissionable (confirm modal → ephemeral local status, D-009). Namespace
// rows link to the namespace detail (which lists the orgs within). Shared by the
// on-prem org detail page and the on-prem customer's own Namespaces view.
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

  // Local, ephemeral copy so upgrade / add / decommission reflect immediately
  // without mutating the mock layer (D-009).
  const [groups, setGroups] = useState<OnPremClusterGroup[] | null>(null)
  useEffect(() => {
    if (data && groups === null) setGroups(data.clusters)
  }, [data, groups])

  const [upgradeTarget, setUpgradeTarget] = useState<OnPremNamespaceRow | null>(null)
  const [decommTarget, setDecommTarget] = useState<
    { type: 'cluster' | 'namespace'; id: string; name: string } | null
  >(null)
  const [addOpen, setAddOpen] = useState(false)

  const list = useMemo(() => groups ?? data?.clusters ?? [], [groups, data])
  const latestVersion = data?.latestVersion ?? ''

  function handleUpgradeConfirm() {
    if (!upgradeTarget) return
    setGroups((prev) =>
      (prev ?? []).map((g) => ({
        ...g,
        namespaces: g.namespaces.map((n) => (n.id === upgradeTarget.id ? { ...n, version: latestVersion } : n)),
      })),
    )
    setUpgradeTarget(null)
  }

  function handleDecommissionConfirm() {
    if (!decommTarget) return
    setGroups((prev) =>
      (prev ?? []).map((g) => {
        if (decommTarget.type === 'cluster' && g.cluster.id === decommTarget.id) {
          // Decommissioning a cluster decommissions its namespaces too.
          return {
            cluster: { ...g.cluster, status: 'decommissioned' as const },
            namespaces: g.namespaces.map((n) => ({ ...n, status: 'decommissioned' as const })),
          }
        }
        if (decommTarget.type === 'namespace') {
          return { ...g, namespaces: g.namespaces.map((n) => (n.id === decommTarget.id ? { ...n, status: 'decommissioned' as const } : n)) }
        }
        return g
      }),
    )
    setDecommTarget(null)
  }

  function handleAddNamespace(ns: OnPremNamespaceRow, cluster: Cluster) {
    setGroups((prev) => {
      const groupsNow = prev ?? []
      const existing = groupsNow.find((g) => g.cluster.id === cluster.id)
      if (existing) {
        return groupsNow.map((g) => (g.cluster.id === cluster.id ? { ...g, namespaces: [...g.namespaces, ns] } : g))
      }
      return [...groupsNow, { cluster, namespaces: [ns] }]
    })
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
        <ErrorState message="Failed to load clusters" onRetry={refetch} />
      ) : list.length === 0 ? (
        <EmptyState title="No clusters" description="No clusters have been provisioned yet." />
      ) : (
        list.map((group) => {
          const decommissioned = group.cluster.status === 'decommissioned'
          return (
            <div key={group.cluster.id} className="bg-white rounded-lg shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-semibold text-foreground font-mono">{group.cluster.name}</h3>
                  {group.cluster.region && <span className="text-xs text-muted-foreground">{group.cluster.region}</span>}
                  {decommissioned && <StatusBadge status="decommissioned" />}
                </div>
                {!decommissioned && (
                  <Tooltip content="Decommission cluster">
                    <button
                      onClick={() => setDecommTarget({ type: 'cluster', id: group.cluster.id, name: group.cluster.name })}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                    >
                      <Power className="w-3.5 h-3.5" /> Decommission
                    </button>
                  </Tooltip>
                )}
              </div>
              <DataTable
                columns={makeColumns(orgId, latestVersion, setUpgradeTarget, (n) => setDecommTarget({ type: 'namespace', id: n.id, name: n.name }))}
                data={group.namespaces}
                rowKey={(n) => n.id}
                emptyTitle="No namespaces"
                emptyDescription="This cluster has no namespaces."
              />
            </div>
          )
        })
      )}

      {/* Upgrade confirmation */}
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

      {/* Decommission confirmation (cluster or namespace) */}
      <Modal open={!!decommTarget} onClose={() => setDecommTarget(null)} title={`Decommission ${decommTarget?.name ?? ''}`}>
        {decommTarget && (
          <div className="space-y-4">
            <p className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">
              {decommTarget.type === 'cluster'
                ? 'Decommissioning this cluster will also decommission all of its namespaces. This is a destructive action.'
                : 'Decommissioning this namespace stops all of its orgs. This is a destructive action.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDecommTarget(null)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDecommissionConfirm} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                Decommission
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add namespace slide-over */}
      <AddNamespaceSlideOver
        open={addOpen}
        onClose={() => setAddOpen(false)}
        orgId={orgId}
        groups={list}
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
  onDecommission: (ns: OnPremNamespaceRow) => void,
): Column<OnPremNamespaceRow>[] {
  return [
    {
      key: 'name',
      header: 'Namespace',
      render: (n) =>
        n.status === 'decommissioned' ? (
          <span className="font-medium text-muted-foreground line-through">{n.name}</span>
        ) : (
          <Link to={`/onprem-customers/${orgId}/namespaces/${n.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
            {n.name}
          </Link>
        ),
    },
    { key: 'status', header: 'Status', render: (n) => <StatusBadge status={n.status} /> },
    { key: 'version', header: 'Refold Version', render: (n) => <span className="font-mono text-muted-foreground">{n.version}</span> },
    {
      key: 'upgrade',
      header: 'Upgrade Available',
      render: (n) =>
        n.status === 'decommissioned' ? (
          <span className="text-muted-foreground">—</span>
        ) : isUpgradeAvailable(n.version, latestVersion) ? (
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
        const decommissioned = n.status === 'decommissioned'
        const canUpgrade = !decommissioned && isUpgradeAvailable(n.version, latestVersion)
        return (
          <div className="flex items-center gap-1">
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
            <Tooltip content={decommissioned ? 'Decommissioned' : 'Decommission namespace'}>
              <button
                onClick={() => !decommissioned && onDecommission(n)}
                disabled={decommissioned}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                aria-label="Decommission namespace"
              >
                <Power className="w-4 h-4" />
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
  groups,
  latestVersion,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  orgId: string
  groups: OnPremClusterGroup[]
  latestVersion: string
  onAdd: (ns: OnPremNamespaceRow, cluster: Cluster) => void
}) {
  // Only active clusters can take new namespaces.
  const activeGroups = groups.filter((g) => g.cluster.status === 'active')
  const [name, setName] = useState('')
  const [clusterChoice, setClusterChoice] = useState('')
  const [newClusterName, setNewClusterName] = useState('')
  const [version, setVersion] = useState(latestVersion)

  useEffect(() => {
    if (open) {
      setName('')
      setClusterChoice(activeGroups[0]?.cluster.id ?? NEW_CLUSTER)
      setNewClusterName('')
      setVersion(latestVersion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, latestVersion])

  const isNewCluster = clusterChoice === NEW_CLUSTER
  const canSubmit =
    name.trim().length > 0 && version.trim().length > 0 && (!isNewCluster || newClusterName.trim().length > 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const now = new Date().toISOString()
    const cluster: Cluster = isNewCluster
      ? { id: `cls_new_${Date.now()}`, customerOrgId: orgId, name: newClusterName.trim(), status: 'active', createdAt: now }
      : activeGroups.find((g) => g.cluster.id === clusterChoice)!.cluster

    onAdd(
      {
        id: `ns_new_${Date.now()}`,
        name: name.trim(),
        orgId,
        clusterId: cluster.id,
        clusterName: cluster.name,
        status: 'running',
        version: version.trim(),
        lastSeen: now,
        activeWorkflows: 0,
        executionsToday: 0,
        createdAt: now,
      },
      cluster,
    )
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
            {activeGroups.map((g) => (
              <option key={g.cluster.id} value={g.cluster.id}>{g.cluster.name}</option>
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
