import type { AccountType, UserRole } from '@/types'

// One repo, three portals (build-spec-v2 § 3). VITE_PORTAL selects which shell +
// routes + nav ship. account_type ↔ portal ↔ UserRole are 1:1.
export type Portal = 'admin' | 'cloud' | 'onprem'

const PORTAL_ACCOUNT: Record<Portal, AccountType> = {
  admin: 'super_admin',
  cloud: 'cloud_customer',
  onprem: 'onprem_customer',
}

const PORTAL_ROLE_MAP: Record<Portal, UserRole> = {
  admin: 'super_admin',
  cloud: 'cloud_customer_admin',
  onprem: 'onprem_customer_admin',
}

export const PORTAL_NAMES: Record<Portal, string> = {
  admin: 'Admin Portal',
  cloud: 'Cloud Portal',
  onprem: 'On-Prem Portal',
}

function resolvePortal(): Portal {
  const v = import.meta.env.VITE_PORTAL
  if (v === undefined || v === '') {
    console.warn('VITE_PORTAL not set — defaulting to "admin" (set it in .env; see .env.example)')
    return 'admin'
  }
  if (v === 'admin' || v === 'cloud' || v === 'onprem') return v
  throw new Error(`Invalid VITE_PORTAL: "${v}". Expected one of: admin | cloud | onprem.`)
}

export const PORTAL: Portal = resolvePortal()
export const PORTAL_ACCOUNT_TYPE: AccountType = PORTAL_ACCOUNT[PORTAL]
export const PORTAL_ROLE: UserRole = PORTAL_ROLE_MAP[PORTAL]
export const PORTAL_NAME: string = PORTAL_NAMES[PORTAL]

// Which portal a given account_type belongs to — used by the wrong-portal guard.
export function portalForAccountType(accountType: AccountType): Portal {
  return (Object.keys(PORTAL_ACCOUNT) as Portal[]).find((p) => PORTAL_ACCOUNT[p] === accountType) ?? 'admin'
}
