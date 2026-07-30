import { Navigate, type RouteObject } from 'react-router-dom'
import { OrgScopeGuard } from '@/components/OrgScopeGuard'
import { DashboardPage } from '@/pages/DashboardPage'
import { NamespacesPage } from '@/pages/NamespacesPage'
import { NamespaceDetailPage } from '@/pages/NamespaceDetailPage'
import { OnPremOrgDetailPage } from '@/pages/OnPremOrgDetailPage'
import { SettingsPage } from '@/pages/SettingsPage'

// onprem_customer_admin portal. Includes the org + namespace detail routes
// (D-036) so the Dashboard/Namespaces "View" links and namespace-detail's
// "back to organization" resolve; both OrgScopeGuard-scoped to their own org.
export const onpremRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'namespaces', element: <NamespacesPage /> },
  { path: 'onprem-customers/:orgId', element: <OrgScopeGuard><OnPremOrgDetailPage /></OrgScopeGuard> },
  { path: 'onprem-customers/:orgId/namespaces/:namespaceId', element: <OrgScopeGuard><NamespaceDetailPage /></OrgScopeGuard> },
  { path: 'settings', element: <SettingsPage /> },
]
