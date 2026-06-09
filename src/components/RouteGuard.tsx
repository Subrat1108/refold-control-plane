import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

interface RouteGuardProps {
  allowedRoles: UserRole[]
  children: ReactNode
}

export function RouteGuard({ allowedRoles, children }: RouteGuardProps) {
  const { role } = useAuth()
  const navigate = useNavigate()

  if (!allowedRoles.includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          Your current role doesn't have permission to view this page.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Go back
        </button>
      </div>
    )
  }

  return <>{children}</>
}
