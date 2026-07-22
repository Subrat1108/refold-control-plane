import { useAuth } from '@/hooks'
import { EmptyState } from '@/components/EmptyState'
import { CloudOrgDetailView } from './CloudOrgDetailPage'

export function DashboardPage() {
  const { user } = useAuth()

  if (!user.orgId) {
    return <EmptyState title="No organization" description="This account is not linked to an organization." />
  }

  // cloud_customer_admin home view reuses the org detail page, scoped to their org.
  return <CloudOrgDetailView orgId={user.orgId} showBack={false} />
}
