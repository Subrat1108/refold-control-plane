import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import { MfaStepUp } from '@/lib/auth/MfaStepUp'
import { WrongPortal } from '@/lib/auth/WrongPortal'
import { PORTAL, portalForAccountType } from '@/config/portal'

// Real auth gate (Phase 6, replaces the placeholder password gate D-023/D-031):
// requires a Supabase session; blocks users whose account_type doesn't match
// this portal (§ 6); super_admins must reach AAL2 via MFA before the app renders
// (matches the RLS is_aal2() gate, D-034).
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session, profile, needsMfa } = useSupabaseAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" role="status" aria-label="Loading" />
      </div>
    )
  }

  if (!session || !profile) return <Navigate to="/login" replace />

  // Portal ↔ account_type match (D-035): a cloud user hitting the admin portal
  // is stopped here, never allowed in.
  const expectedPortal = portalForAccountType(profile.accountType)
  if (expectedPortal !== PORTAL) return <WrongPortal correctPortal={expectedPortal} />

  if (needsMfa) return <MfaStepUp />

  return <>{children}</>
}
