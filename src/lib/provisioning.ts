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

// profiles.reports_to is only writable via this action (D-043 column-grant
// lockdown blocks any direct client UPDATE on it). Optional, UX-only.
export function setReportsTo(userId: string, reportsTo: string | null) {
  return invoke<{ ok: true }>({ action: 'set_reports_to', userId, reportsTo })
}

// 7.4 — ingest_tokens grants no insert/update to `authenticated` at all; the
// plaintext only ever exists in this one response, never stored.
export function createIngestToken(label: string, expiresAt: string, allowedOrgIds: string[] | null) {
  return invoke<{ id: string; token: string }>({ action: 'create_ingest_token', label, expiresAt, allowedOrgIds })
}

export function revokeIngestToken(tokenId: string) {
  return invoke<{ ok: true }>({ action: 'revoke_ingest_token', tokenId })
}

// 7.5-pre2 Session 2 — "account match needed." One action, four decisions;
// each releases every held record blocked on this resolution through the
// same dedupe tree `ingest` uses for a fresh sighting.
export interface ResolveAccountInput {
  resolutionId: string
  decision: 'map_existing' | 'map_tenant' | 'create_account' | 'ignore'
  orgId?: string
  tenantId?: string
  newTenantName?: string
  name?: string
  segmentId?: string | null
  deploymentModel?: string | null
  deploymentType?: string
  lifecycleStage?: string
  sourceType?: string
}

export function resolveAccountProposal(input: ResolveAccountInput) {
  return invoke<{ ok: true; decision: string; orgId?: string; tenantId?: string | null; releasedCount: number }>({ action: 'resolve_account_proposal', ...input })
}

// 7.5-pre2 Session 5 — the Sync Status screen's settings form + backfill
// trigger. sync_settings grants no direct authenticated write at all (same
// shape as ingest_tokens); enqueue_backfill is a thin wrapper over the SQL
// function of the same name, still gated through this super_admin + AAL2
// lane like every other privileged write.
export interface SyncSettingsPatch {
  kill_switch?: boolean
  daily_run_at_utc?: string
  max_units_per_run?: number
  max_units_per_day?: number
  max_tokens_per_unit?: number
  internal_email_domains?: string[]
  discovery_channel_patterns?: string[]
}

export function updateSyncSettings(patch: SyncSettingsPatch) {
  return invoke<{ ok: true }>({ action: 'update_sync_settings', ...patch })
}

// "Run sync now" — queues exactly what the nightly job would.
export function enqueueFullSync(windowDays?: number, maxUnits?: number) {
  return invoke<{ enqueued: number }>({ action: 'enqueue_full_sync', windowDays, maxUnits })
}

export function enqueueBackfill(orgIds: string[] | null) {
  return invoke<{ enqueued: number }>({ action: 'enqueue_backfill', orgIds })
}

export function acceptInvite() {
  return invoke<{ ok: true; alreadyActive?: boolean }>({ action: 'accept_invite' })
}

// ── owner lane (6.4b) — customer owners managing their own org ─────────────────
export interface OwnerInviteUserInput {
  email: string
  fullName?: string
  subRoleId?: string | null
}

export function ownerInviteUser(input: OwnerInviteUserInput) {
  return invoke<{ ok: true; userId: string; email: string }>({
    action: 'owner_invite_user',
    ...input,
  })
}

export function ownerAssignSubRole(userId: string, subRoleId: string | null) {
  return invoke<{ ok: true }>({ action: 'owner_assign_sub_role', userId, subRoleId })
}

export function ownerSetUserStatus(userId: string, status: 'active' | 'disabled') {
  return invoke<{ ok: true }>({ action: 'owner_set_user_status', userId, status })
}
