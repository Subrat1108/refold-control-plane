import { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AccessDenied } from '@/components/AccessDenied'

// Reusable org-scoping guard for routes with an :orgId param. Customer-admin
// roles may only reach their own org; super_admin is unscoped. Supersedes the
// interim inline check in NamespaceDetailPage (see D-014 / D-012).
export function OrgScopeGuard({ children }: { children: ReactNode }) {
  const { role, user } = useAuth()
  const { orgId } = useParams()

  const scoped = role === 'cloud_customer_admin' || role === 'onprem_customer_admin'
  if (scoped && orgId && orgId !== user.orgId) {
    return <AccessDenied message="This resource belongs to another organization." />
  }

  return <>{children}</>
}
