// Stage 2b — a tenant's own page.
//
// A tenant is one signup on an account: one Refold org/workspace (D-149).
// It gets its own page because the CS team tracks metrics and records per
// tenant as well as per account — an on-prem customer's amex-prod namespace
// is a different conversation from their mt-perf one, even though both roll
// up to Naehas.
//
// Where the old mock admin panel showed invented charts here, this shows
// what is genuinely known and says plainly where real figures are missing.
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useAccount, useTenants, useMetricValues, useMetricDefinitions } from '@/hooks'
import { MetricEntry } from '@/components/MetricEntry'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { formatDate } from '@/utils/formatDate'

export function TenantDetailPage() {
  const { orgId, tenantId } = useParams<{ orgId: string; tenantId: string }>()
  const { data: account, isLoading: accountLoading, isError, refetch } = useAccount(orgId ?? null)
  const { data: tenants, isLoading: tenantsLoading } = useTenants(orgId ?? null)

  if (accountLoading || tenantsLoading) return <div className="p-6"><CardSkeleton /></div>
  if (isError) return <div className="p-6"><ErrorState onRetry={() => refetch()} /></div>

  const tenant = (tenants ?? []).find((t) => t.id === tenantId)
  if (!account || !tenant) {
    return (
      <div className="p-6">
        <EmptyState title="Tenant not found" description="It may have been renamed, moved to another account, or removed." />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link to={`/accounts/${account.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft size={16} /> {account.name}
        </Link>
        <h1 className="text-xl font-semibold text-foreground mt-1">{tenant.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          One signup on {account.name} — a Refold org/workspace. Added {formatDate(tenant.createdAt)}.
        </p>
      </div>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Where it runs</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            ['Cluster', tenant.clusterName],
            ['Namespace', tenant.namespaceName],
            ['Refold org id', tenant.refoldOrgId],
            ['Linked account id', tenant.linkedAccountId],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="text-foreground mt-0.5">
                {value ? <code className="font-mono text-xs">{value}</code> : <span className="text-muted-foreground">not recorded</span>}
              </dd>
            </div>
          ))}
        </dl>
        {tenant.notes && <p className="text-xs text-muted-foreground pt-1 border-t border-border">{tenant.notes}</p>}
        <p className="text-xs text-muted-foreground">
          Edit these from the account&apos;s Deployment tab — including which account this tenant belongs to.
        </p>
      </section>

      {/* Stage 2c — a tenant's figures are its own, and for an air-gapped
          installation this is the only way they can arrive at all. */}
      <MetricEntry orgId={account.id} tenantId={tenant.id} scopeLabel={`${tenant.name} (tenant of ${account.name})`} />

      <section className="bg-white rounded-xl shadow-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Recorded metrics</h2>
        <TenantMetrics orgId={account.id} tenantId={tenant.id} />
      </section>
    </div>
  )
}

function TenantMetrics({ orgId, tenantId }: { orgId: string; tenantId: string }) {
  const { data: values, isLoading } = useMetricValues(orgId)
  const { data: definitions } = useMetricDefinitions()
  if (isLoading) return <CardSkeleton />

  const mine = (values ?? []).filter((v) => v.tenantId === tenantId)
  if (!mine.length) {
    return <EmptyState title="Nothing recorded yet" description="Use Add details above — by hand, or from a csv or json file." />
  }
  const label = new Map((definitions ?? []).map((d) => [d.key, d.label]))
  return (
    <ul className="text-sm divide-y divide-border">
      {mine.sort((a, b) => b.period.localeCompare(a.period)).map((v) => (
        <li key={v.id} className="flex items-center justify-between py-2">
          <span>{label.get(v.metricKey) ?? v.metricKey}</span>
          <span className="tabular-nums">
            {v.value}
            {v.baselineValue != null && <span className="text-muted-foreground"> (baseline {v.baselineValue})</span>}
            <span className="text-muted-foreground ml-2">{v.period.slice(0, 7)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
