import { useParams } from 'react-router-dom'
import { useOnPremOrgDetail } from '@/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorState } from '@/components/ErrorState'
import { NamespaceClusters } from '@/components/onprem/NamespaceClusters'

export function OnPremOrgDetailPage() {
  const { orgId } = useParams()
  const id = orgId ?? ''
  const { data, isLoading, isError, refetch } = useOnPremOrgDetail(id)

  if (isLoading) return <HeaderSkeleton />
  if (isError || !data) return <ErrorState message="Failed to load organization" onRetry={refetch} />

  const { org, clusters } = data
  const clusterCount = clusters.length
  const namespaceCount = clusters.reduce((sum, c) => sum + c.namespaces.length, 0)

  return (
    <div className="space-y-6">
      {/* Org header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{org.name}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
              {org.plan.replace(/_/g, ' ')}
            </span>
            <StatusBadge status={org.status} />
            <span className="text-sm text-muted-foreground">
              {namespaceCount} namespace{namespaceCount === 1 ? '' : 's'} across {clusterCount} cluster{clusterCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      <NamespaceClusters orgId={id} heading="Cluster & Namespace Overview" showAdd />
    </div>
  )
}

function HeaderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
      <div className="bg-white rounded-lg shadow-card p-6 space-y-3">
        <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[52px] bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  )
}
