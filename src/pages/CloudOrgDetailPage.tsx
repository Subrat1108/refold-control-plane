import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Flag } from 'lucide-react'
import {
  useAuth,
  useCloudOrg,
  useCloudOrgMetrics,
  useAiCredits,
} from '@/hooks'
import { StatCard } from '@/components/StatCard'
import { LineChart } from '@/components/LineChart'
import { BarChart } from '@/components/BarChart'
import { DonutChart } from '@/components/DonutChart'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { ProgressBar } from '@/components/ProgressBar'
import { ErrorState } from '@/components/ErrorState'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, type TabItem } from '@/components/Tabs'
import { formatDate } from '@/utils/formatDate'
import { formatNumber, formatPercent } from '@/utils/formatNumber'
import type { Connector, WorkflowSummary } from '@/types'

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'usage', label: 'Usage' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'connectors', label: 'Connectors' },
]

function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  if (ms < 1_000) return `${ms}ms`
  return `${(ms / 1_000).toFixed(1)}s`
}

// ─── Shared section chrome ──────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  )
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  )
}

// ─── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ orgId }: { orgId: string }) {
  const metrics = useCloudOrgMetrics(orgId)
  const detail = useCloudOrg(orgId)
  const credits = useAiCredits(orgId)

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      {metrics.isLoading || credits.isLoading ? (
        <CardsSkeleton count={4} />
      ) : metrics.isError || !metrics.data || credits.isError || !credits.data ? (
        <ErrorState message="Failed to load overview metrics" onRetry={() => { metrics.refetch(); credits.refetch() }} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Active Tenants" value={formatNumber(metrics.data.activeTenants)} />
          <StatCard label="Executions Today" value={formatNumber(metrics.data.executionsToday)} />
          <StatCard label="Success Rate" value={formatPercent(metrics.data.successRate, 1)} />
          <div className="bg-white rounded-lg shadow-card p-6">
            <span className="text-sm text-muted-foreground font-medium">AI Credits Used</span>
            <div className="text-2xl font-semibold text-foreground mt-2">
              {formatNumber(credits.data.used)} / {formatNumber(credits.data.limit)}
            </div>
            <ProgressBar value={credits.data.used} max={credits.data.limit} className="mt-3" />
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {detail.isLoading ? (
          <>
            <ChartCard title="Workflow Executions — Last 30 Days"><div className="h-[200px] bg-gray-100 rounded animate-pulse" /></ChartCard>
            <ChartCard title="Errors by Type"><div className="h-[200px] bg-gray-100 rounded animate-pulse" /></ChartCard>
          </>
        ) : detail.isError || !detail.data ? (
          <div className="xl:col-span-2"><ErrorState message="Failed to load charts" onRetry={detail.refetch} /></div>
        ) : (
          <>
            <ChartCard title="Workflow Executions — Last 30 Days">
              <LineChart data={detail.data.workflowExecutionsTrend} color="#6366F1" />
            </ChartCard>
            <ChartCard title="Errors by Type">
              <DonutChart data={detail.data.errorBreakdown} />
            </ChartCard>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tenants tab ─────────────────────────────────────────────────────────────

function TenantsTab({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useCloudOrgMetrics(orgId)

  if (isLoading) return <TabLoading cards={3} />
  if (isError || !data) return <ErrorState message="Failed to load tenant metrics" onRetry={refetch} />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard label="Total Tenants" value={formatNumber(data.tenants.total)} />
        <StatCard label="Active Tenants" value={formatNumber(data.tenants.active)} />
        <StatCard label="New This Month" value={data.tenants.newThisMonth} />
      </div>
      <ChartCard title="Tenant Growth — Last 6 Months">
        <BarChart data={data.tenantGrowth} color="#6366F1" />
      </ChartCard>
    </div>
  )
}

// ─── Usage tab ───────────────────────────────────────────────────────────────

function UsageTab({ orgId }: { orgId: string }) {
  const metrics = useCloudOrgMetrics(orgId)
  const detail = useCloudOrg(orgId)

  return (
    <div className="space-y-6">
      {metrics.isLoading ? (
        <TabLoading cards={3} chart={false} />
      ) : metrics.isError || !metrics.data ? (
        <ErrorState message="Failed to load usage metrics" onRetry={metrics.refetch} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <StatCard label="API Calls (This Month)" value={formatNumber(metrics.data.apiCallsThisMonth)} />
          <div className="bg-white rounded-lg shadow-card p-6">
            <span className="text-sm text-muted-foreground font-medium">Storage Used</span>
            <div className="text-2xl font-semibold text-foreground mt-2">
              {metrics.data.storageUsedGb} / {metrics.data.storageLimitGb} GB
            </div>
            <ProgressBar value={metrics.data.storageUsedGb} max={metrics.data.storageLimitGb} className="mt-3" />
          </div>
          <StatCard label="Active Users" value={formatNumber(metrics.data.activeUsers)} />
        </div>
      )}

      {detail.isLoading ? (
        <ChartCard title="API Call Volume — Last 30 Days"><div className="h-[200px] bg-gray-100 rounded animate-pulse" /></ChartCard>
      ) : detail.isError || !detail.data ? (
        <ErrorState message="Failed to load API volume" onRetry={detail.refetch} />
      ) : (
        <ChartCard title="API Call Volume — Last 30 Days">
          <LineChart data={detail.data.apiCallsTrend} color="#10b981" />
        </ChartCard>
      )}
    </div>
  )
}

// ─── Workflows tab ───────────────────────────────────────────────────────────

const WORKFLOW_COLUMNS: Column<WorkflowSummary>[] = [
  { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'lastRun', header: 'Last Run', render: (r) => <span className="text-muted-foreground">{formatDate(r.lastRun)}</span> },
  { key: 'executions7d', header: 'Executions (7d)', render: (r) => <span className="text-muted-foreground">{formatNumber(r.executions7d)}</span> },
  { key: 'successRate', header: 'Success Rate', render: (r) => (r.status === 'paused' ? <span className="text-muted-foreground">—</span> : formatPercent(r.successRate, 1)) },
  { key: 'avgDuration', header: 'Avg Duration', render: (r) => <span className="text-muted-foreground">{formatDuration(r.avgDurationMs)}</span> },
]

function WorkflowsTab({ orgId }: { orgId: string }) {
  const metrics = useCloudOrgMetrics(orgId)
  const detail = useCloudOrg(orgId)

  return (
    <div className="space-y-6">
      {metrics.isLoading ? (
        <CardsSkeleton count={4} />
      ) : metrics.isError || !metrics.data ? (
        <ErrorState message="Failed to load workflow metrics" onRetry={metrics.refetch} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Workflows" value={formatNumber(metrics.data.workflows.total)} />
          <StatCard label="Active" value={formatNumber(metrics.data.workflows.active)} />
          <StatCard label="Executions Today" value={formatNumber(metrics.data.workflows.executionsToday)} />
          <StatCard label="Avg Execution Time" value={formatDuration(metrics.data.workflows.avgExecutionMs)} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {detail.isLoading ? (
          <>
            <ChartCard title="Execution Volume — Last 30 Days"><div className="h-[200px] bg-gray-100 rounded animate-pulse" /></ChartCard>
            <ChartCard title="Errors by Type"><div className="h-[200px] bg-gray-100 rounded animate-pulse" /></ChartCard>
          </>
        ) : detail.isError || !detail.data ? (
          <div className="xl:col-span-2"><ErrorState message="Failed to load workflow charts" onRetry={detail.refetch} /></div>
        ) : (
          <>
            <ChartCard title="Execution Volume — Last 30 Days">
              <LineChart data={detail.data.workflowExecutionsTrend} color="#6366F1" />
            </ChartCard>
            <ChartCard title="Errors by Type">
              <BarChart data={detail.data.errorBreakdown.map((e) => ({ label: e.type, value: e.count }))} color="#ef4444" horizontal />
            </ChartCard>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Workflows</h3>
        {metrics.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[52px] bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : metrics.isError || !metrics.data ? (
          <ErrorState message="Failed to load workflows" onRetry={metrics.refetch} />
        ) : (
          <DataTable
            columns={WORKFLOW_COLUMNS}
            data={metrics.data.workflowList}
            rowKey={(r) => r.id}
            emptyTitle="No workflows"
            emptyDescription="This organization has no workflows yet."
          />
        )}
      </div>
    </div>
  )
}

// ─── Connectors tab ──────────────────────────────────────────────────────────

function ConnectorCard({ connector }: { connector: Connector }) {
  const errorHigh = connector.errorRate > 5
  return (
    <div className="bg-white rounded-lg shadow-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-medium text-foreground">{connector.name}</div>
          <div className="text-xs text-muted-foreground">{connector.type}</div>
        </div>
        <StatusBadge status={connector.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Calls Today</div>
          <div className="font-medium text-foreground">{formatNumber(connector.callsToday)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Error Rate</div>
          <div className={errorHigh ? 'font-medium text-red-600' : 'font-medium text-foreground'}>
            {formatPercent(connector.errorRate, 1)}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-4">Last activity: {formatDate(connector.lastActivity)}</div>
    </div>
  )
}

function ConnectorsTab({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useCloudOrgMetrics(orgId)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    )
  }
  if (isError || !data) return <ErrorState message="Failed to load connectors" onRetry={refetch} />
  if (data.connectors.length === 0) {
    return <EmptyState title="No connectors" description="This organization hasn't configured any connectors." />
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {data.connectors.map((c) => <ConnectorCard key={c.id} connector={c} />)}
    </div>
  )
}

// ─── Shared small loading block ──────────────────────────────────────────────

function TabLoading({ cards, chart = true }: { cards: number; chart?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: cards }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
      {chart && <div className="bg-white rounded-lg shadow-card p-6"><div className="h-[200px] bg-gray-100 rounded animate-pulse" /></div>}
    </div>
  )
}

// ─── Page body (shared by /cloud-customers/:orgId and /dashboard) ────────────

export function CloudOrgDetailView({ orgId, showBack }: { orgId: string; showBack: boolean }) {
  const { role } = useAuth()
  const [tab, setTab] = useState('overview')
  const [flagsOpen, setFlagsOpen] = useState(false)
  const detail = useCloudOrg(orgId)

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

      {tab === 'overview' && <OverviewTab orgId={orgId} />}
      {tab === 'tenants' && <TenantsTab orgId={orgId} />}
      {tab === 'usage' && <UsageTab orgId={orgId} />}
      {tab === 'workflows' && <WorkflowsTab orgId={orgId} />}
      {tab === 'connectors' && <ConnectorsTab orgId={orgId} />}

      {/* Feature flags slide-over placeholder — wired up in 5.9 */}
      {flagsOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 flex justify-end" onClick={() => setFlagsOpen(false)}>
          <div className="w-[400px] bg-white h-full shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-muted-foreground">Feature flags panel — coming in 5.9</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function CloudOrgDetailPage() {
  const { orgId } = useParams()
  if (!orgId) return null
  return <CloudOrgDetailView orgId={orgId} showBack />
}
