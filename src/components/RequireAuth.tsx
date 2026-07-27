import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthGate } from '@/hooks/useAuthGate'

// Redirects to the password gate when the localStorage key is absent (§ 11.4).
export function RequireAuth({ children }: { children: ReactNode }) {
  const { authed } = useAuthGate()
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}
