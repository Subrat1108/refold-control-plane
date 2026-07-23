import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Flag } from 'lucide-react'
import {
  useAuth,
  useCloudOrg,
  useCloudOrgMetrics,
  useCloudDetailCharts,
  useAiCredits,
} from '@/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { FeatureFlagsPanel } from '@/components/FeatureFlagsPanel'
import { Tabs, type TabItem } from '@/components/Tabs'
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

// ─── Page body (shared by /cloud-customers/:orgId and /dashboard) ────────────

export function CloudOrgDetailView({ orgId, showBack }: { orgId: string; showBack: boolean }) {
  const { role } = useAuth()
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'overview'
  const [tab, setTab] = useState(initialTab)
  const [flagsOpen, setFlagsOpen] = useState(false)

  const detail = useCloudOrg(orgId)
  const metrics = useCloudOrgMetrics(orgId)
  const charts = useCloudDetailCharts(orgId)
  const credits = useAiCredits(orgId)

  const canEditFlags = role === 'super_admin'

  return (
    <div className="space-y-6">
      {showBack && (
        <Link to="/cloud-customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to cloud customers
        </Link>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {detail.isLoading ? (
            <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          ) : detail.isError || !detail.data ? (
            <h1 className="text-xl font-semibold text-foreground">Organization</h1>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-foreground">{detail.data.name}</h1>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
                  {detail.data.plan}
                </span>
                <StatusBadge status={detail.data.status} />
              </div>
            </>
          )}
        </div>
        {canEditFlags && (
          <button
            onClick={() => setFlagsOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Flag className="w-4 h-4" /> Edit feature flags
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

      {/* Feature flags slide-over */}
      <FeatureFlagsPanel
        open={flagsOpen}
        onClose={() => setFlagsOpen(false)}
        orgId={orgId}
        orgName={detail.data?.name}
      />
    </div>
  )
}

export function CloudOrgDetailPage() {
  const { orgId } = useParams()
  if (!orgId) return null
  return <CloudOrgDetailView orgId={orgId} showBack />
}
