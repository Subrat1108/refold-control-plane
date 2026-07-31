import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import {
  useNamespaceOrg,
  useNamespaceOrgMetrics,
  useNamespaceOrgCharts,
  useAiCredits,
} from '@/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Tabs, type TabItem } from '@/components/Tabs'
import { ErrorState } from '@/components/ErrorState'
import {
  OverviewTab,
  TenantsTab,
  UsageTab,
  WorkflowsTab,
  ConnectorsTab,
} from '@/components/detail/DetailTabs'

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'usage', label: 'Usage' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'connectors', label: 'Connectors' },
]

// R2 (D-051): the org WITHIN a namespace. Tenants + all metrics are scoped here
// (not the namespace), rendered via the shared DetailTabs — same sections the
// cloud org detail uses, just fed the namespace-org's data.
export function NamespaceOrgDetailPage() {
  const { orgId, namespaceId, nsOrgId } = useParams()
  const id = nsOrgId ?? ''
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'overview'
  const [tab, setTab] = useState(initialTab)

  const org = useNamespaceOrg(id)
  const metrics = useNamespaceOrgMetrics(id)
  const charts = useNamespaceOrgCharts(id)
  const credits = useAiCredits(id)

  if (org.isError) return <ErrorState message="Failed to load organization" onRetry={org.refetch} />

  return (
    <div className="space-y-6">
      <Link
        to={`/onprem-customers/${orgId}/namespaces/${namespaceId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to namespace
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">{org.data?.name ?? 'Organization'}</h1>
        <div className="flex items-center gap-2 mt-1.5">
          {org.data?.plan && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
              {org.data.plan}
            </span>
          )}
          {org.data && <StatusBadge status={org.data.status} />}
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab metrics={metrics} charts={charts} credits={credits} />}
      {tab === 'tenants' && <TenantsTab metrics={metrics} />}
      {tab === 'usage' && <UsageTab metrics={metrics} charts={charts} />}
      {tab === 'workflows' && <WorkflowsTab metrics={metrics} charts={charts} />}
      {tab === 'connectors' && <ConnectorsTab metrics={metrics} />}
    </div>
  )
}
