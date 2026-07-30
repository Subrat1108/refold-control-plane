import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import type { AuthContextValue } from '@/types'

// Compat shim (D-033): the existing 5.x pages/guards consume { user, role }.
// Identity now comes from Supabase; this maps it to the old shape. Consumers
// only render inside RequireAuth, so user/role are guaranteed non-null here.
export function useAuth(): AuthContextValue {
  const { user, role } = useSupabaseAuth()
  if (!user || !role) {
    throw new Error('useAuth: no authenticated profile (must render within RequireAuth)')
  }
  return { user, role }
}
