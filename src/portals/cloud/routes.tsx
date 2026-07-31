import { Navigate, type RouteObject } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { OrgUsersPage } from '@/pages/OrgUsersPage'
import { SettingsPage } from '@/pages/SettingsPage'

// cloud_customer_admin portal. The dashboard renders the customer's own org
// detail inline, so no /cloud-customers/:orgId route is needed here. /users is
// owner-gated inside the page (6.4b).
export const cloudRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'users', element: <OrgUsersPage /> },
  { path: 'settings', element: <SettingsPage /> },
]
