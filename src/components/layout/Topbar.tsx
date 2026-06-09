import { useLocation } from 'react-router-dom'
import { SearchDropdown } from '@/components/SearchDropdown'

const ROUTE_TITLES: Record<string, string> = {
  '/overview': 'Overview',
  '/cloud-customers': 'Cloud Customers',
  '/onprem-customers': 'On-Prem Customers',
  '/feature-flags': 'Feature Flags',
  '/settings': 'Settings',
  '/dashboard': 'Dashboard',
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

  return (
    <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-border flex-shrink-0">
      <h1 className="text-base font-semibold text-foreground">{getTitle(pathname)}</h1>
      <SearchDropdown placeholder="Search anything..." />
    </header>
  )
}
