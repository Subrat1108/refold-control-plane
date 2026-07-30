import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import { MfaStepUp } from '@/lib/auth/MfaStepUp'

// Real auth gate (Phase 6, replaces the placeholder password gate D-023/D-031):
// requires a Supabase session; super_admins must additionally reach AAL2 via MFA
// before the app renders (matches the RLS is_aal2() gate).
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

  if (needsMfa) return <MfaStepUp />

  return <>{children}</>
}
