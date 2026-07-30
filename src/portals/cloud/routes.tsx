import { Navigate, type RouteObject } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { SettingsPage } from '@/pages/SettingsPage'

// cloud_customer_admin portal. The dashboard renders the customer's own org
// detail inline, so no /cloud-customers/:orgId route is needed here.
export const cloudRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'settings', element: <SettingsPage /> },
]
