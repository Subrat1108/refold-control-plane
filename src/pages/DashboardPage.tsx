import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth, useOnPremOrgDetail } from '@/hooks'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { CloudOrgDetailView } from './CloudOrgDetailPage'
import type { OnPremNamespaceRow } from '@/types'

export function DashboardPage() {
  const { role, user } = useAuth()

  if (!user.orgId) {
    return <EmptyState title="No organization" description="This account is not linked to an organization." />
  }

  if (role === 'onprem_customer_admin') {
    return <OnPremDashboard orgId={user.orgId} />
  }

  // cloud_customer_admin home view reuses the cloud org detail page.
  return <CloudOrgDetailView orgId={user.orgId} showBack={false} />
}

// ─── On-prem customer dashboard: a summary card per owned namespace ──────────

function OnPremDashboard({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useOnPremOrgDetail(orgId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your Refold namespaces at a glance</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : isError || !data ? (
        <ErrorState message="Failed to load namespaces" onRetry={refetch} />
      ) : data.clusters.flatMap((c) => c.namespaces).length === 0 ? (
        <EmptyState title="No namespaces" description="No Refold installations have been provisioned yet." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.clusters.flatMap((c) => c.namespaces).map((ns) => (
            <NamespaceCard key={ns.id} orgId={orgId} ns={ns} />
          ))}
        </div>
      )}
    </div>
  )
}

function NamespaceCard({ orgId, ns }: { orgId: string; ns: OnPremNamespaceRow }) {
  return (
    <div className="bg-white rounded-lg shadow-card p-6 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{ns.name}</div>
          <div className="text-xs text-muted-foreground font-mono truncate">{ns.clusterName}</div>
        </div>
        <StatusBadge status={ns.status} />
      </div>

      <div className="flex items-center gap-2 mt-4 text-sm">
        <span className="text-muted-foreground">Version</span>
        <span className="font-mono text-foreground">v{ns.version}</span>
      </div>

      <Link
        to={`/onprem-customers/${orgId}/namespaces/${ns.id}`}
        className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors"
      >
        View <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
