import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Flag } from 'lucide-react'
import { useCloudOrgs } from '@/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { SearchDropdown } from '@/components/SearchDropdown'
import { Tooltip } from '@/components/Tooltip'
import { FeatureFlagsPanel } from '@/components/FeatureFlagsPanel'
import { AddCustomerButton, PendingInvitesPanel } from '@/components/provisioning/AddCustomer'
import { formatNumber, formatCurrency } from '@/utils/formatNumber'
import { formatDate } from '@/utils/formatDate'
import type { CloudOrg, OrgStatus } from '@/types'

const STATUS_OPTIONS: { label: string; value: OrgStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Churned', value: 'churned' },
]

export function CloudCustomersPage() {
  const { data, isLoading, isError, refetch } = useCloudOrgs()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrgStatus | 'all'>('all')
  const [flagOrgId, setFlagOrgId] = useState<string | null>(null)

  const handleSearch = useCallback((q: string) => setQuery(q), [])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.toLowerCase()
    return data.filter((org) => {
      const matchesQuery = !q || org.name.toLowerCase().includes(q) || org.contactEmail.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || org.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [data, query, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cloud Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${data.length} organisations` : 'Loading…'}
          </p>
        </div>
        <AddCustomerButton deployment="cloud" />
      </div>

      <PendingInvitesPanel deployment="cloud" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchDropdown placeholder="Search by name or email…" onSearch={handleSearch} />
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-primary text-white'
                  : 'bg-white text-muted-foreground border border-border hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {isError && <ErrorState message="Failed to load cloud customers" onRetry={refetch} />}

      {data && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              title="No customers found"
              description="Try adjusting your search or filter to find what you're looking for."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-gray-50/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Plan</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">MRR</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">API Calls</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Users</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Created</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Contact</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((org: CloudOrg) => (
                  <tr key={org.id} className="h-[52px] border-b border-border last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-6">
                      <Link
                        to={`/cloud-customers/${org.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 text-muted-foreground capitalize">{org.plan}</td>
                    <td className="px-4"><StatusBadge status={org.status} /></td>
                    <td className="px-4 text-right font-medium tabular-nums">
                      {org.mrr > 0 ? formatCurrency(org.mrr) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 text-right text-muted-foreground tabular-nums">{formatNumber(org.apiCallsThisMonth)}</td>
                    <td className="px-4 text-right text-muted-foreground tabular-nums">{org.activeUsers}</td>
                    <td className="px-4 text-muted-foreground">{formatDate(org.createdAt).split(',')[0]}</td>
                    <td className="px-4">
                      <div className="text-muted-foreground">
                        <div className="font-medium text-foreground text-xs">{org.contactName}</div>
                        <div className="text-xs">{org.contactEmail}</div>
                      </div>
                    </td>
                    <td className="px-4">
                      <Tooltip content="Edit feature flags">
                        <button
                          onClick={() => setFlagOrgId(org.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          aria-label="Edit feature flags"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Feature flags slide-over */}
      <FeatureFlagsPanel
        open={!!flagOrgId}
        onClose={() => setFlagOrgId(null)}
        scope="org"
        entityId={flagOrgId ?? undefined}
        entityName={data?.find((o) => o.id === flagOrgId)?.name}
      />
    </div>
  )
}
