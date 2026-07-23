import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Flag } from 'lucide-react'
import { useOnPremOrgs } from '@/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { SearchDropdown } from '@/components/SearchDropdown'
import { Tooltip } from '@/components/Tooltip'
import { FeatureFlagsPanel } from '@/components/FeatureFlagsPanel'
import { formatDate } from '@/utils/formatDate'
import type { OnPremOrg, OrgStatus, NamespaceStatus } from '@/types'

const STATUS_OPTIONS: { label: string; value: OrgStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Churned', value: 'churned' },
]

const NS_DOT: Record<NamespaceStatus, string> = {
  running: 'bg-green-500',
  degraded: 'bg-amber-400',
  down: 'bg-red-500',
}

function NamespaceDots({ namespaces }: { namespaces: OnPremOrg['namespaces'] }) {
  return (
    <div className="flex items-center gap-1">
      {namespaces.map((ns) => (
        <Tooltip key={ns.id} content={`${ns.name}: ${ns.status}`}>
          <span className={`w-2.5 h-2.5 rounded-full inline-block ${NS_DOT[ns.status]}`} />
        </Tooltip>
      ))}
    </div>
  )
}

function LicenseExpiry({ date }: { date: string }) {
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
  const expired = daysLeft < 0
  const urgent = daysLeft >= 0 && daysLeft <= 60
  return (
    <span className={expired ? 'text-red-600 font-medium' : urgent ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
      {expired
        ? `Expired ${Math.abs(daysLeft)}d ago`
        : `${formatDate(date).split(',')[0]}${urgent ? ` (${daysLeft}d)` : ''}`}
    </span>
  )
}

export function OnPremCustomersPage() {
  const { data, isLoading, isError, refetch } = useOnPremOrgs()
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
      <div>
        <h1 className="text-xl font-semibold text-foreground">On-Prem Customers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data ? `${data.length} organisations` : 'Loading…'}
        </p>
      </div>

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
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {isError && <ErrorState message="Failed to load on-prem customers" onRetry={refetch} />}

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
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Namespaces</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Clusters</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">License Expires</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Contact</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((org: OnPremOrg) => (
                  <tr key={org.id} className="h-[52px] border-b border-border last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-6">
                      <Link
                        to={`/onprem-customers/${org.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 text-muted-foreground text-xs">{org.plan.replace(/_/g, ' ')}</td>
                    <td className="px-4"><StatusBadge status={org.status} /></td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <NamespaceDots namespaces={org.namespaces} />
                        <span className="text-muted-foreground text-xs">{org.totalNamespaces}</span>
                      </div>
                    </td>
                    <td className="px-4 text-right text-muted-foreground tabular-nums">{org.totalClusters}</td>
                    <td className="px-4 text-xs"><LicenseExpiry date={org.licenseExpiresAt} /></td>
                    <td className="px-4">
                      <div>
                        <div className="font-medium text-foreground text-xs">{org.contactName}</div>
                        <div className="text-xs text-muted-foreground">{org.contactEmail}</div>
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
        orgId={flagOrgId ?? undefined}
        orgName={data?.find((o) => o.id === flagOrgId)?.name}
      />
    </div>
  )
}
