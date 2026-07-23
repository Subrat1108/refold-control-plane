import { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { AccessDenied } from '@/components/AccessDenied'
import type { UserRole } from '@/types'

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
