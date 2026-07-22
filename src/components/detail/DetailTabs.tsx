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
import { formatDate } from '@/utils/formatDate'
import { formatNumber, formatPercent } from '@/utils/formatNumber'
import type {
  AiCredits,
  Connector,
  DetailCharts,
  DetailMetrics,
  QueryLike,
  WorkflowSummary,
} from '@/types'

// These five sections are shared verbatim by the cloud org detail page (5.5)
// and the namespace detail page (5.7). They are purely presentational: each
// container passes the query objects (scoped by org id or namespace id), and
// each section owns its own skeleton + inline error/retry (D-003).

function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  if (ms < 1_000) return `${ms}ms`
  return `${(ms / 1_000).toFixed(1)}s`
}

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

function ChartSkeleton({ title }: { title: string }) {
  return <ChartCard title={title}><div className="h-[200px] bg-gray-100 rounded animate-pulse" /></ChartCard>
}

// ─── Overview ────────────────────────────────────────────────────────────────

export function OverviewTab({
  metrics,
  charts,
  credits,
}: {
  metrics: QueryLike<DetailMetrics>
  charts: QueryLike<DetailCharts>
  credits: QueryLike<AiCredits>
}) {
  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {charts.isLoading ? (
          <>
            <ChartSkeleton title="Workflow Executions — Last 30 Days" />
            <ChartSkeleton title="Errors by Type" />
          </>
        ) : charts.isError || !charts.data ? (
          <div className="xl:col-span-2"><ErrorState message="Failed to load charts" onRetry={charts.refetch} /></div>
        ) : (
          <>
            <ChartCard title="Workflow Executions — Last 30 Days">
              <LineChart data={charts.data.executionsTrend} color="#6366F1" />
            </ChartCard>
            <ChartCard title="Errors by Type">
              <DonutChart data={charts.data.errorBreakdown} />
            </ChartCard>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export function TenantsTab({ metrics }: { metrics: QueryLike<DetailMetrics> }) {
  if (metrics.isLoading) return <TabLoading cards={3} />
  if (metrics.isError || !metrics.data) return <ErrorState message="Failed to load tenant metrics" onRetry={metrics.refetch} />
  const data = metrics.data

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

// ─── Usage ───────────────────────────────────────────────────────────────────

export function UsageTab({
  metrics,
  charts,
}: {
  metrics: QueryLike<DetailMetrics>
  charts: QueryLike<DetailCharts>
}) {
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

      {charts.isLoading ? (
        <ChartSkeleton title="API Call Volume — Last 30 Days" />
      ) : charts.isError || !charts.data ? (
        <ErrorState message="Failed to load API volume" onRetry={charts.refetch} />
      ) : (
        <ChartCard title="API Call Volume — Last 30 Days">
          <LineChart data={charts.data.apiCallsTrend} color="#10b981" />
        </ChartCard>
      )}
    </div>
  )
}

// ─── Workflows ───────────────────────────────────────────────────────────────

const WORKFLOW_COLUMNS: Column<WorkflowSummary>[] = [
  { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'lastRun', header: 'Last Run', render: (r) => <span className="text-muted-foreground">{formatDate(r.lastRun)}</span> },
  { key: 'executions7d', header: 'Executions (7d)', render: (r) => <span className="text-muted-foreground">{formatNumber(r.executions7d)}</span> },
  { key: 'successRate', header: 'Success Rate', render: (r) => (r.status === 'paused' ? <span className="text-muted-foreground">—</span> : formatPercent(r.successRate, 1)) },
  { key: 'avgDuration', header: 'Avg Duration', render: (r) => <span className="text-muted-foreground">{formatDuration(r.avgDurationMs)}</span> },
]

export function WorkflowsTab({
  metrics,
  charts,
}: {
  metrics: QueryLike<DetailMetrics>
  charts: QueryLike<DetailCharts>
}) {
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
        {charts.isLoading ? (
          <>
            <ChartSkeleton title="Execution Volume — Last 30 Days" />
            <ChartSkeleton title="Errors by Type" />
          </>
        ) : charts.isError || !charts.data ? (
          <div className="xl:col-span-2"><ErrorState message="Failed to load workflow charts" onRetry={charts.refetch} /></div>
        ) : (
          <>
            <ChartCard title="Execution Volume — Last 30 Days">
              <LineChart data={charts.data.executionsTrend} color="#6366F1" />
            </ChartCard>
            <ChartCard title="Errors by Type">
              <BarChart data={charts.data.errorBreakdown.map((e) => ({ label: e.type, value: e.count }))} color="#ef4444" horizontal />
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
            emptyDescription="Nothing has been configured here yet."
          />
        )}
      </div>
    </div>
  )
}

// ─── Connectors ──────────────────────────────────────────────────────────────

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

export function ConnectorsTab({ metrics }: { metrics: QueryLike<DetailMetrics> }) {
  if (metrics.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    )
  }
  if (metrics.isError || !metrics.data) return <ErrorState message="Failed to load connectors" onRetry={metrics.refetch} />
  if (metrics.data.connectors.length === 0) {
    return <EmptyState title="No connectors" description="No connectors have been configured here yet." />
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {metrics.data.connectors.map((c) => <ConnectorCard key={c.id} connector={c} />)}
    </div>
  )
}
