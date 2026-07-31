import { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { AccessDenied } from '@/components/AccessDenied'
import type { UserRole } from '@/types'

// Per-route role protection (R1, D-048). Now that all routes live in one app
// again, a user hitting a route not permitted for their role gets the shared
// AccessDenied page — never a silent redirect. OrgScopeGuard (D-028) still wraps
// :orgId routes as the org-scoping guarantee (with RLS the real backstop).
interface RouteGuardProps {
  allowedRoles: UserRole[]
  children: ReactNode
}

export function RouteGuard({ allowedRoles, children }: RouteGuardProps) {
  const { role } = useAuth()

  if (!allowedRoles.includes(role)) {
    return <AccessDenied message="Your current role doesn't have permission to view this page." />
  }

  return <>{children}</>
}
