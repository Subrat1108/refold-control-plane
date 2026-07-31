import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth } from '@/components/RequireAuth'
import { RouteError } from '@/components/RouteError'
import { LoginPage } from '@/pages/LoginPage'
import { AcceptInvitePage } from '@/pages/AcceptInvitePage'
import { adminRoutes } from '@/portals/admin/routes'
import { cloudRoutes } from '@/portals/cloud/routes'
import { onpremRoutes } from '@/portals/onprem/routes'

// Select this build's routes off the inlined VITE_PORTAL literal so Rollup
// dead-code-eliminates the other portals' route modules + their pages
// (build-spec-v2 § 3). /login is present in every portal.
const portal = import.meta.env.VITE_PORTAL
const portalChildren: RouteObject[] =
  portal === 'cloud' ? cloudRoutes : portal === 'onprem' ? onpremRoutes : adminRoutes

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
  {
    // Invite-accept / set-password. Present in every portal, outside RequireAuth
    // so the newly-invited (still `invited`, possibly wrong-portal, pre-MFA) user
    // can set a password without being bounced (Phase 6.4a).
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
    children: portalChildren,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
