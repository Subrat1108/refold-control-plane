import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RouteGuard } from '@/components/RouteGuard'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { CloudCustomersPage } from '@/pages/CloudCustomersPage'
import { CloudOrgDetailPage } from '@/pages/CloudOrgDetailPage'
import { OnPremCustomersPage } from '@/pages/OnPremCustomersPage'
import { OnPremOrgDetailPage } from '@/pages/OnPremOrgDetailPage'
import { NamespaceDetailPage } from '@/pages/NamespaceDetailPage'
import { FeatureFlagsPage } from '@/pages/FeatureFlagsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { DashboardPage } from '@/pages/DashboardPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/overview" replace />,
      },
      {
        path: 'overview',
        element: (
          <RouteGuard allowedRoles={['super_admin']}>
            <OverviewPage />
          </RouteGuard>
        ),
      },
      {
        path: 'cloud-customers',
        element: (
          <RouteGuard allowedRoles={['super_admin']}>
            <CloudCustomersPage />
          </RouteGuard>
        ),
      },
      {
        path: 'cloud-customers/:orgId',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'cloud_customer_admin']}>
            <CloudOrgDetailPage />
          </RouteGuard>
        ),
      },
      {
        path: 'onprem-customers',
        element: (
          <RouteGuard allowedRoles={['super_admin']}>
            <OnPremCustomersPage />
          </RouteGuard>
        ),
      },
      {
        path: 'onprem-customers/:orgId',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'onprem_customer_admin']}>
            <OnPremOrgDetailPage />
          </RouteGuard>
        ),
      },
      {
        path: 'onprem-customers/:orgId/namespaces/:namespaceId',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'onprem_customer_admin']}>
            <NamespaceDetailPage />
          </RouteGuard>
        ),
      },
      {
        path: 'feature-flags',
        element: (
          <RouteGuard allowedRoles={['super_admin']}>
            <FeatureFlagsPage />
          </RouteGuard>
        ),
      },
      {
        path: 'settings',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'cloud_customer_admin', 'onprem_customer_admin']}>
            <SettingsPage />
          </RouteGuard>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <RouteGuard allowedRoles={['cloud_customer_admin']}>
            <DashboardPage />
          </RouteGuard>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/overview" replace />,
  },
])
