import { Link } from 'react-router-dom'
import { useAuth, useCloudOrg, useOnPremOrg } from '@/hooks'
import { ErrorState } from '@/components/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/utils/formatDate'

// Stage 3 — Settings is where configuration lives.
//
// Everything that used to sit behind a collapsed "Admin" disclosure in the
// sidebar — feature flags, users & roles, the team directory, ingest tokens,
// sync status — is a section here instead. An admin looking for
// configuration opens Settings; they should not have to know it was filed
// under a separate group.
const ADMIN_SECTIONS: { to: string; label: string; description: string }[] = [
  { to: '/admin-users', label: 'Users & roles', description: 'Invite super admins, assign sub-roles, disable accounts.' },
  { to: '/people', label: 'People', description: 'The CS team directory — who is on which account, role history, activity.' },
  { to: '/feature-flags', label: 'Feature flags', description: 'Global and per-account flags. Not connected to storage yet.' },
  { to: '/ingest-tokens', label: 'Ingest tokens', description: 'Mint and revoke the tokens the sync runner posts with.' },
  { to: '/sync-status', label: 'Sync status', description: 'Recent runs, the kill switch, day range, and accounts finding nothing.' },
]

export function SettingsPage() {
  const { user, role } = useAuth()
  const isCloud = role === 'cloud_customer_admin'
  const isOnPrem = role === 'onprem_customer_admin'
  const isSuperAdmin = role === 'super_admin'

  return (
    <div className="space-y-6 max-w-2xl">
      {isSuperAdmin && (
        <div className="bg-white rounded-lg shadow-card p-6">
          <h2 className="text-base font-semibold mb-1">Administration</h2>
          <p className="text-sm text-muted-foreground mb-4">Everything that used to sit under the Admin group in the sidebar.</p>
          <ul className="divide-y divide-border">
            {ADMIN_SECTIONS.map((sec) => (
              <li key={sec.to} className="py-3 first:pt-0 last:pb-0">
                <Link to={sec.to} className="text-sm font-medium text-primary hover:underline">{sec.label}</Link>
                <p className="text-xs text-muted-foreground mt-0.5">{sec.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Account settings (all roles) */}
      <div className="bg-white rounded-lg shadow-card p-6">
        <h2 className="text-base font-semibold mb-4">Account Settings</h2>
        <div className="space-y-0 text-sm">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={<span className="capitalize">{role.replace(/_/g, ' ')}</span>} last />
        </div>
      </div>

      {/* Org profile (customer admins only, read-only) */}
      {isCloud && user.orgId && <CloudOrgProfile orgId={user.orgId} />}
      {isOnPrem && user.orgId && <OnPremOrgProfile orgId={user.orgId} />}
    </div>
  )
}

function CloudOrgProfile({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useCloudOrg(orgId)

  return (
    <ProfileCard loading={isLoading} error={isError || !data} onRetry={refetch}>
      {data && (
        <>
          <Row label="Organization" value={data.name} />
          <Row label="Plan" value={<span className="capitalize">{data.plan}</span>} />
          <Row label="Contact" value={data.contactName} />
          <Row label="Contact email" value={data.contactEmail} />
          <Row label="Customer since" value={formatDate(data.createdAt).split(',')[0]} last />
        </>
      )}
    </ProfileCard>
  )
}

function OnPremOrgProfile({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, refetch } = useOnPremOrg(orgId)

  return (
    <ProfileCard loading={isLoading} error={isError || !data} onRetry={refetch}>
      {data && (
        <>
          <Row label="Organization" value={data.name} />
          <Row label="Plan" value={<span className="capitalize">{data.plan.replace(/_/g, ' ')}</span>} />
          <Row label="Status" value={<StatusBadge status={data.status} />} />
          <Row label="Contact" value={data.contactName} />
          <Row label="Contact email" value={data.contactEmail} />
          <Row label="Namespaces" value={`${data.totalNamespaces} across ${data.totalClusters} cluster${data.totalClusters === 1 ? '' : 's'}`} />
          <Row label="License expires" value={formatDate(data.licenseExpiresAt).split(',')[0]} last />
        </>
      )}
    </ProfileCard>
  )
}

function ProfileCard({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean
  error: boolean
  onRetry: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Organization Profile</h2>
        <span className="text-xs text-muted-foreground">Read-only</span>
      </div>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load organization profile" onRetry={onRetry} />
      ) : (
        <div className="space-y-0 text-sm">{children}</div>
      )}
    </div>
  )
}

function Row({ label, value, last = false }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-3 ${last ? '' : 'border-b border-border'}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
