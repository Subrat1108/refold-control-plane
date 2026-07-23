import { useLocation } from 'react-router-dom'
import { SearchDropdown } from '@/components/SearchDropdown'
import { useAuth, useCloudOrg, useOnPremOrg } from '@/hooks'

const ROUTE_TITLES: Record<string, string> = {
  '/overview': 'Overview',
  '/cloud-customers': 'Cloud Customers',
  '/onprem-customers': 'On-Prem Customers',
  '/feature-flags': 'Feature Flags',
  '/settings': 'Settings',
  '/dashboard': 'Dashboard',
  '/namespaces': 'Namespaces',
}

function getTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname]
  if (pathname.startsWith('/cloud-customers/')) return 'Cloud Org Detail'
  if (pathname.match(/\/onprem-customers\/[^/]+\/namespaces\//)) return 'Namespace Detail'
  if (pathname.startsWith('/onprem-customers/')) return 'On-Prem Org Detail'
  return 'Admin Panel'
}

export function Topbar() {
  const { pathname } = useLocation()
  const { role, user } = useAuth()

  // Customer admins see their organization name; both hooks are always called
  // for stable order, each enabled only when it applies to the current role.
  const cloudOrg = useCloudOrg(role === 'cloud_customer_admin' ? user.orgId ?? '' : '')
  const onPremOrg = useOnPremOrg(role === 'onprem_customer_admin' ? user.orgId ?? '' : '')

  const orgName =
    role === 'cloud_customer_admin' ? cloudOrg.data?.name
    : role === 'onprem_customer_admin' ? onPremOrg.data?.name
    : undefined

  const title = orgName ?? getTitle(pathname)

  return (
    <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-border flex-shrink-0">
      <h1 className="text-base font-semibold text-foreground">{title}</h1>
      {/* Global search spans all orgs — super_admin only, so a customer admin
          can't surface other orgs' data (full search is 5.11). */}
      {role === 'super_admin' && <SearchDropdown placeholder="Search anything..." />}
    </header>
  )
}
