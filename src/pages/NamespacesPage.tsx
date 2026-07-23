import { useAuth } from '@/hooks'
import { EmptyState } from '@/components/EmptyState'
import { NamespaceClusters } from '@/components/onprem/NamespaceClusters'

// On-prem customer admin's Namespaces view: the 5.6 cluster/namespace tables
// scoped to their own org, without the org-level page framing.
export function NamespacesPage() {
  const { user } = useAuth()

  if (!user.orgId) {
    return <EmptyState title="No organization" description="This account is not linked to an organization." />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Namespaces</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your Refold installations across all clusters</p>
      </div>
      <NamespaceClusters orgId={user.orgId} showAdd />
    </div>
  )
}
