import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth } from '@/components/RequireAuth'
import { RouteGuard } from '@/components/RouteGuard'
import { RouteError } from '@/components/RouteError'
import { OrgScopeGuard } from '@/components/OrgScopeGuard'
import { IndexRedirect } from '@/components/IndexRedirect'
import { LoginPage } from '@/pages/LoginPage'
import { AcceptInvitePage } from '@/pages/AcceptInvitePage'
import { OverviewPage } from '@/pages/OverviewPage'
import { CloudCustomersPage } from '@/pages/CloudCustomersPage'
import { CloudOrgDetailPage } from '@/pages/CloudOrgDetailPage'
import { OnPremCustomersPage } from '@/pages/OnPremCustomersPage'
import { OnPremOrgDetailPage } from '@/pages/OnPremOrgDetailPage'
import { NamespacesPage } from '@/pages/NamespacesPage'
import { NamespaceDetailPage } from '@/pages/NamespaceDetailPage'
import { NamespaceOrgDetailPage } from '@/pages/NamespaceOrgDetailPage'
import { FeatureFlagsPage } from '@/pages/FeatureFlagsPage'
import { SuperAdminsPage } from '@/pages/SuperAdminsPage'
import { PeoplePage } from '@/pages/PeoplePage'
import { StandupsPage } from '@/pages/StandupsPage'
import { StandupDetailPage } from '@/pages/StandupDetailPage'
import { HomePage } from '@/pages/HomePage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { AccountDetailPage } from '@/pages/AccountDetailPage'
import { ApprovalsPage } from '@/pages/ApprovalsPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { OrgUsersPage } from '@/pages/OrgUsersPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SettingsPage } from '@/pages/SettingsPage'

// R1 (D-048): one app, one login. After auth, land on the role's home route
// (IndexRedirect). The VITE_PORTAL split (D-026/D-035) is retired — all routes
// coexist and are role-guarded per-route (RouteGuard → AccessDenied), never a
// silent redirect.
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
  {
    // Invite-accept / set-password — outside RequireAuth so a still-`invited`,
    // pre-MFA user can set a password without being bounced (Phase 6.4a).
    path: '/accept-invite',
    element: <AcceptInvitePage />,
    errorElement: <RouteError />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <IndexRedirect /> },
      {
        path: 'overview',
        element: <RouteGuard allowedRoles={['super_admin']}><OverviewPage /></RouteGuard>,
      },
      {
        // 7.2b — Portfolio board + coverage tab, the account list.
        path: 'portfolio',
        element: <RouteGuard allowedRoles={['super_admin']}><PortfolioPage /></RouteGuard>,
      },
      {
        // 7.2b — Account 360 (6 tabs).
        path: 'accounts/:orgId',
        element: <RouteGuard allowedRoles={['super_admin']}><AccountDetailPage /></RouteGuard>,
      },
      {
        path: 'cloud-customers',
        element: <RouteGuard allowedRoles={['super_admin']}><CloudCustomersPage /></RouteGuard>,
      },
      {
        path: 'cloud-customers/:orgId',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'cloud_customer_admin']}>
            <OrgScopeGuard><CloudOrgDetailPage /></OrgScopeGuard>
          </RouteGuard>
        ),
      },
      {
        path: 'onprem-customers',
        element: <RouteGuard allowedRoles={['super_admin']}><OnPremCustomersPage /></RouteGuard>,
      },
      {
        path: 'onprem-customers/:orgId',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'onprem_customer_admin']}>
            <OrgScopeGuard><OnPremOrgDetailPage /></OrgScopeGuard>
          </RouteGuard>
        ),
      },
      {
        path: 'onprem-customers/:orgId/namespaces/:namespaceId',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'onprem_customer_admin']}>
            <OrgScopeGuard><NamespaceDetailPage /></OrgScopeGuard>
          </RouteGuard>
        ),
      },
      {
        // R2 (D-051): the org within a namespace — metric tabs. Distinct inner
        // param :nsOrgId (never :orgId, which is the top customer).
        path: 'onprem-customers/:orgId/namespaces/:namespaceId/orgs/:nsOrgId',
        element: (
          <RouteGuard allowedRoles={['super_admin', 'onprem_customer_admin']}>
            <OrgScopeGuard><NamespaceOrgDetailPage /></OrgScopeGuard>
          </RouteGuard>
        ),
      },
      {
        path: 'feature-flags',
        element: <RouteGuard allowedRoles={['super_admin']}><FeatureFlagsPage /></RouteGuard>,
      },
      {
        path: 'admin-users',
        element: <RouteGuard allowedRoles={['super_admin']}><SuperAdminsPage /></RouteGuard>,
      },
      {
        // Equal-admins model — directory of admins, reports_to, account roles.
        path: 'people',
        element: <RouteGuard allowedRoles={['super_admin']}><PeoplePage /></RouteGuard>,
      },
      {
        // Equal-admins model Part 3 — anyone hosts, D-085.
        path: 'standups',
        element: <RouteGuard allowedRoles={['super_admin']}><StandupsPage /></RouteGuard>,
      },
      {
        path: 'standups/:id',
        element: <RouteGuard allowedRoles={['super_admin']}><StandupDetailPage /></RouteGuard>,
      },
      {
        path: 'home',
        element: <RouteGuard allowedRoles={['super_admin']}><HomePage /></RouteGuard>,
      },
      {
        // 7.3 — Approvals inbox + audit log screen.
        path: 'approvals',
        element: <RouteGuard allowedRoles={['super_admin']}><ApprovalsPage /></RouteGuard>,
      },
      {
        path: 'audit-log',
        element: <RouteGuard allowedRoles={['super_admin']}><AuditLogPage /></RouteGuard>,
      },
      {
        path: 'dashboard',
        element: (
          <RouteGuard allowedRoles={['cloud_customer_admin', 'onprem_customer_admin']}>
            <DashboardPage />
          </RouteGuard>
        ),
      },
      {
        path: 'namespaces',
        element: <RouteGuard allowedRoles={['onprem_customer_admin']}><NamespacesPage /></RouteGuard>,
      },
      {
        path: 'users',
        element: (
          <RouteGuard allowedRoles={['cloud_customer_admin', 'onprem_customer_admin']}>
            <OrgUsersPage />
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
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
