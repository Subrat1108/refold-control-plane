import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { homeRoute } from '@/config/navigation'

// R1 (D-048): the "/" landing redirect. One login for everyone; after auth we
// send each user to their role's home view via homeRoute(role) — super_admin →
// /overview, cloud → /dashboard, onprem → /namespaces. No portal selection.
export function IndexRedirect() {
  const { role } = useAuth()
  return <Navigate to={homeRoute(role)} replace />
}
