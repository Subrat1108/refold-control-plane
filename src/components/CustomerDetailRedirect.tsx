// Stage 2a — an account has ONE page.
//
// /cloud-customers/:orgId and /onprem-customers/:orgId used to be the
// "admin panel" half of an account, separate from its CS half at
// /accounts/:orgId. For the internal team those are now one page, so a
// super admin landing on an old link is sent to the merged one rather than
// shown half the picture.
//
// Customer owners are NOT redirected: their portals are frozen (kept
// working, no new work) and /accounts is super-admin only, so sending them
// there would hand them an Access denied page instead of their own view.
import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useSupabaseAuth } from '@/hooks'

export function CustomerDetailRedirect({ children }: { children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>()
  const { profile } = useSupabaseAuth()

  if (profile?.accountType === 'super_admin' && orgId) {
    return <Navigate to={`/accounts/${orgId}`} replace />
  }
  return <>{children}</>
}
