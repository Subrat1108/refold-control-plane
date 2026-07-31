// Phase 6.4a — thin client wrapper over the `provisioning` Edge Function.
// The function holds the service-role key and enforces super_admin + AAL2 itself
// (D-025/D-029). The browser only ever sends the user's bearer (attached by
// supabase.functions.invoke) plus an action payload.
import { supabase } from '@/lib/supabase'

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('provisioning', {
    body: { ...body, redirectTo: `${window.location.origin}/accept-invite` },
  })
  if (error) {
    // Edge Function non-2xx: surface the JSON `error` message when present.
    // supabase-js wraps it in FunctionsHttpError with a readable context.
    let message = error.message
    try {
      const ctx = await (error as { context?: Response }).context?.json()
      if (ctx?.error) message = ctx.error
    } catch {
      /* keep the generic message */
    }
    throw new Error(message)
  }
  return data as T
}

export interface ProvisionOrgInput {
  deploymentType: 'cloud' | 'on_premise'
  name: string
  plan?: string
  ownerEmail: string
  ownerName?: string
}

export function provisionOrg(input: ProvisionOrgInput) {
  return invoke<{ ok: true; orgId: string; ownerId: string; ownerEmail: string }>({
    action: 'provision_org',
    ...input,
  })
}

export interface InviteSuperAdminInput {
  email: string
  fullName?: string
  subRoleId?: string | null
}

export function inviteSuperAdmin(input: InviteSuperAdminInput) {
  return invoke<{ ok: true; userId: string; email: string }>({
    action: 'invite_super_admin',
    ...input,
  })
}

export function assignSubRole(userId: string, subRoleId: string | null) {
  return invoke<{ ok: true }>({ action: 'assign_sub_role', userId, subRoleId })
}

export function setUserStatus(userId: string, status: 'active' | 'disabled') {
  return invoke<{ ok: true }>({ action: 'set_user_status', userId, status })
}

export function acceptInvite() {
  return invoke<{ ok: true; alreadyActive?: boolean }>({ action: 'accept_invite' })
}
