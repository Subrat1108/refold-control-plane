import { Navigate, type RouteObject } from 'react-router-dom'
import { OrgScopeGuard } from '@/components/OrgScopeGuard'
import { OverviewPage } from '@/pages/OverviewPage'
import { CloudCustomersPage } from '@/pages/CloudCustomersPage'
import { CloudOrgDetailPage } from '@/pages/CloudOrgDetailPage'
import { OnPremCustomersPage } from '@/pages/OnPremCustomersPage'
import { OnPremOrgDetailPage } from '@/pages/OnPremOrgDetailPage'
import { NamespaceDetailPage } from '@/pages/NamespaceDetailPage'
import { FeatureFlagsPage } from '@/pages/FeatureFlagsPage'
import { SettingsPage } from '@/pages/SettingsPage'

// super_admin portal. Role gating is handled by the portal↔account_type guard in
// RequireAuth; OrgScopeGuard stays on :orgId routes as defense-in-depth (D-028).
export const adminRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/overview" replace /> },
  { path: 'overview', element: <OverviewPage /> },
  { path: 'cloud-customers', element: <CloudCustomersPage /> },
  { path: 'cloud-customers/:orgId', element: <OrgScopeGuard><CloudOrgDetailPage /></OrgScopeGuard> },
  { path: 'onprem-customers', element: <OnPremCustomersPage /> },
  { path: 'onprem-customers/:orgId', element: <OrgScopeGuard><OnPremOrgDetailPage /></OrgScopeGuard> },
  { path: 'onprem-customers/:orgId/namespaces/:namespaceId', element: <OrgScopeGuard><NamespaceDetailPage /></OrgScopeGuard> },
  { path: 'feature-flags', element: <FeatureFlagsPage /> },
  { path: 'settings', element: <SettingsPage /> },
]
