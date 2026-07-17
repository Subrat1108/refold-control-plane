import { Link } from 'react-router-dom'
import {
  useOverviewStats,
  useCloudOrgs,
  useOnPremOrgs,
} from '@/hooks'
import { StatCard } from '@/components/StatCard'
import { LineChart } from '@/components/LineChart'
import { StatusBadge } from '@/components/StatusBadge'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { formatNumber, formatCurrency } from '@/utils/formatNumber'
import { formatDate } from '@/utils/formatDate'
import type { CloudOrg, OnPremOrg } from '@/types'

// ─── Stat row ────────────────────────────────────────────────────────────────

function StatsRow() {
  const { data, isLoading, isError, refetch } = useOverviewStats()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    )
  }
  if (isError || !data) {
    return <ErrorState message="Failed to load overview stats" onRetry={refetch} />
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
      <StatCard label="Cloud Orgs" value={data.totalCloudOrgs} />
      <StatCard label="On-Prem Orgs" value={data.totalOnPremOrgs} />
      <StatCard label="Active Users" value={formatNumber(data.totalActiveUsers)} />
      <StatCard label="API Calls Today" value={formatNumber(data.totalApiCallsToday)} />
      <StatCard label="MRR" value={formatCurrency(data.mrr)} />
      <StatCard
        label="Degraded / Down"
        value={data.degradedOrDownCount}
        subtext={data.degradedOrDownCount > 0 ? 'Needs attention' : 'All systems healthy'}
        className={data.degradedOrDownCount > 0 ? 'border border-amber-300' : ''}
      />
    </div>
  )
}

// ─── Trend charts ─────────────────────────────────────────────────────────────

function TrendCharts() {
  const { data, isLoading, isError, refetch } = useOverviewStats()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-card p-6 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-32 mb-6" />
            <div className="h-[180px] bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (isError || !data) {
    return <ErrorState message="Failed to load trend data" onRetry={refetch} />
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">API Calls — Last 30 Days</h3>
        <LineChart data={data.apiCallsTrend} color="#6366F1" height={180} />
      </div>
      <div className="bg-white rounded-lg shadow-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Cloud Org Growth — Last 30 Days</h3>
        <LineChart data={data.cloudOrgsTrend} color="#10b981" height={180} />
      </div>
    </div>
  )
}

// ─── Cloud orgs table ─────────────────────────────────────────────────────────

function CloudOrgsTable() {
  const { data, isLoading, isError, refetch } = useCloudOrgs()

  return (
    <div className="bg-white rounded-lg shadow-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">Cloud Customers</h3>
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[52px] bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}
      {isError && <ErrorState message="Failed to load cloud orgs" onRetry={refetch} />}
      {data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground pb-3">Name</th>
              <th className="text-left text-xs font-medium text-muted-foreground pb-3">Plan</th>
              <th className="text-left text-xs font-medium text-muted-foreground pb-3">Status</th>
              <th className="text-right text-xs font-medium text-muted-foreground pb-3">MRR</th>
              <th className="text-right text-xs font-medium text-muted-foreground pb-3">API Calls</th>
              <th className="text-right text-xs font-medium text-muted-foreground pb-3">Users</th>
            </tr>
          </thead>
          <tbody>
            {data.map((org: CloudOrg) => (
              <tr key={org.id} className="h-[52px] border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
                <td>
                  <Link to={`/cloud-customers/${org.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {org.name}
                  </Link>
                </td>
                <td className="text-muted-foreground capitalize">{org.plan}</td>
                <td><StatusBadge status={org.status} /></td>
                <td className="text-right font-medium">{org.mrr > 0 ? formatCurrency(org.mrr) : '—'}</td>
                <td className="text-right text-muted-foreground">{formatNumber(org.apiCallsThisMonth)}</td>
                <td className="text-right text-muted-foreground">{org.activeUsers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── On-prem orgs table ───────────────────────────────────────────────────────

function OnPremOrgsTable() {
  const { data, isLoading, isError, refetch } = useOnPremOrgs()

  return (
    <div className="bg-white rounded-lg shadow-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">On-Prem Customers</h3>
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[52px] bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}
      {isError && <ErrorState message="Failed to load on-prem orgs" onRetry={refetch} />}
      {data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground pb-3">Name</th>
              <th className="text-left text-xs font-medium text-muted-foreground pb-3">Plan</th>
              <th className="text-left text-xs font-medium text-muted-foreground pb-3">Status</th>
              <th className="text-right text-xs font-medium text-muted-foreground pb-3">Namespaces</th>
              <th className="text-right text-xs font-medium text-muted-foreground pb-3">Clusters</th>
              <th className="text-left text-xs font-medium text-muted-foreground pb-3 pl-4">License Expires</th>
            </tr>
          </thead>
          <tbody>
            {data.map((org: OnPremOrg) => (
              <tr key={org.id} className="h-[52px] border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
                <td>
                  <Link to={`/onprem-customers/${org.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {org.name}
                  </Link>
                </td>
                <td className="text-muted-foreground text-xs">{org.plan.replace(/_/g, ' ')}</td>
                <td><StatusBadge status={org.status} /></td>
                <td className="text-right text-muted-foreground">{org.totalNamespaces}</td>
                <td className="text-right text-muted-foreground">{org.totalClusters}</td>
                <td className="pl-4">
                  <LicenseExpiry date={org.licenseExpiresAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LicenseExpiry({ date }: { date: string }) {
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
  const expired = daysLeft < 0
  const urgent = daysLeft >= 0 && daysLeft <= 60

  return (
    <span className={expired ? 'text-red-600 font-medium' : urgent ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
      {expired ? `Expired ${Math.abs(daysLeft)}d ago` : formatDate(date).split(',')[0]}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">All customers, all deployments</p>
      </div>

      <StatsRow />
      <TrendCharts />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CloudOrgsTable />
        <OnPremOrgsTable />
      </div>
    </div>
  )
}
