import { createContext, useState, ReactNode } from 'react'
import type { UserRole, AuthUser, AuthContextValue } from '@/types'

const MOCK_USERS: Record<UserRole, AuthUser> = {
  super_admin: {
    id: 'usr_sa_001',
    name: 'Priya Sharma',
    email: 'priya@refold.la',
    role: 'super_admin',
  },
  cloud_customer_admin: {
    id: 'usr_ca_001',
    name: 'Marcus Chen',
    email: 'marcus@prismanalytics.io',
    role: 'cloud_customer_admin',
    orgId: 'org_cloud_001',
  },
  onprem_customer_admin: {
    id: 'usr_oa_001',
    name: 'Yuki Tanaka',
    email: 'infra@meridian-labs.jp',
    role: 'onprem_customer_admin',
    orgId: 'org_onprem_001',
  },
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>('super_admin')

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole)
  }

  const value: AuthContextValue = {
    user: MOCK_USERS[role],
    role,
    setRole,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
