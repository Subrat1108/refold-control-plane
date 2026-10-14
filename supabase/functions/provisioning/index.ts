// Phase 6.4a — Provisioning Edge Function (build-spec-v2 §§ 7, 10).
//
// This function is the ONLY holder of the service-role key (injected locally as
// SUPABASE_SERVICE_ROLE_KEY; never shipped to any frontend — D-025/§10). Because
// the service-role client BYPASSES RLS, the function MUST itself verify that the
// caller is a super_admin AND at AAL2 before doing anything (D-029/D-034). RLS is
// not the gate here — this code is.
//
// Two authz lanes share one loaded caller context:
//   super_admin lane (6.4a, super_admin + AAL2):
//     provision_org      — create a customer org + invite its owner
//     invite_super_admin — invite an internal super-admin user + assign a sub-role
//     assign_sub_role    — change a user's sub_role_id
//     set_user_status    — disable/enable a user (profile status + auth ban)
//   owner lane (6.4b, customer owner + AAL2, OWN ORG ONLY — D-044):
//     owner_invite_user     — invite a member into the owner's org (+ sub-role)
//     owner_assign_sub_role — change a member's customer sub-role (own org)
//     owner_set_user_status — disable/enable a user in the owner's org
//   self-service:
//     accept_invite      — (self) flip an invited user's status to active
// Every action writes an audit_log row carrying org_id (D-032). Owner actions can
// only ever touch the caller's own org / own customer type, never super-admins.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { TARGET_TABLE, REQUIRED_FIELDS, NEEDS_PROJECT, filterKnownFields, resolveProject, resolveOwner, decideAndFile, type DecideCtx } from '../_shared/dedupe.ts'

const ACTION_ITEM_PRIORITIES = ['p0', 'high', 'medium', 'low']
const ACTION_ITEM_STATUSES = ['open', 'in_progress', 'blocked', 'done']
const ENGAGEMENT_TYPES = ['call', 'check_in', 'qbr', 'ebr', 'note']

const INTERNAL_ORG_ID = '00000000-0000-0000-0000-000000000001'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Read the `aal` claim off the caller's JWT without a network round-trip.
function jwtAal(token: string): string {
  try {
    const payload = token.split('.')[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(decoded).aal as string) ?? 'aal1'
  } catch {
    return 'aal1'
  }
}

interface Caller {
  id: string
  accountType: string
  role: string
  orgId: string
  aal: string
  service: SupabaseClient
}

// Identify the caller (session + their own profile), or return 401. Does NOT
// enforce super_admin/owner/AAL2 — that is each action's guard (below), so the
// same loaded context serves both the super-admin lane and the owner lane.
async function loadCaller(req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization bearer token' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Invalid or expired session' }, 401)

  // The caller reads their own profile under RLS (own row is always visible).
  const { data: prof } = await caller
    .from('profiles')
    .select('account_type, role, org_id')
    .eq('id', userData.user.id)
    .single()
  if (!prof) return json({ error: 'Profile not found' }, 403)

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return {
    id: userData.user.id,
    accountType: prof.account_type,
    role: prof.role,
    orgId: prof.org_id,
    aal: jwtAal(token), // service-role bypasses RLS is_aal2(), so enforce in-code
    service,
  }
}

// super_admin lane (6.4a) — unchanged authz.
function requireSuperAdminAal2(caller: Caller): Response | null {
  if (caller.accountType !== 'super_admin') return json({ error: 'Forbidden: super_admin required' }, 403)
  if (caller.aal !== 'aal2') return json({ error: 'Forbidden: AAL2 (MFA) required' }, 403)
  return null
}

// owner lane (6.4b) — a customer owner acting ONLY within their own org. May not
// be a super_admin path, may not create super-admins, must be AAL2.
function requireOwnerAal2(caller: Caller): Response | null {
  const isCustomer = caller.accountType === 'cloud_customer' || caller.accountType === 'onprem_customer'
  if (caller.role !== 'owner' || !isCustomer) return json({ error: 'Forbidden: customer owner required' }, 403)
  if (caller.aal !== 'aal2') return json({ error: 'Forbidden: AAL2 (MFA) required' }, 403)
  return null
}

// A sub_role is assignable by an owner only when it targets the owner's own
// customer type and is either a system sub-role (org_id null) or their own org's.
async function ownerSubRoleValid(
  svc: SupabaseClient,
  subRoleId: string,
  accountType: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await svc.from('sub_roles').select('account_type, org_id').eq('id', subRoleId).single()
  if (!data || data.account_type !== accountType) return false
  return data.org_id === null || data.org_id === orgId
}

// record_table stores plural table names (matching the generic trigger's
// TG_TABLE_NAME and the audit_log_select RLS policy's ANY(...) check), but
// call sites pass the singular entity name — map here so they don't have to.
const RECORD_TABLE_MAP: Record<string, string> = {
  organization: 'organizations',
  profile: 'profiles',
}

async function writeAudit(
  svc: SupabaseClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  orgId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await svc.from('audit_log').insert({
    actor_id: actorId,
    action,
    record_table: RECORD_TABLE_MAP[targetType] ?? targetType,
    record_id: targetId,
    org_id: orgId,
    metadata,
  })
}

// ── provision_org ─────────────────────────────────────────────────────────────
async function provisionOrg(caller: Caller, body: Record<string, unknown>, redirectTo: string) {
  const deploymentType = body.deploymentType as string
  const name = (body.name as string)?.trim()
  const plan = (body.plan as string)?.trim() || null
  const ownerEmail = (body.ownerEmail as string)?.trim().toLowerCase()
  const ownerName = (body.ownerName as string)?.trim() || null

  if (deploymentType !== 'cloud' && deploymentType !== 'on_premise') {
    return json({ error: 'deploymentType must be cloud or on_premise' }, 400)
  }
  if (!name || !ownerEmail) return json({ error: 'name and ownerEmail are required' }, 400)

  const svc = caller.service
  const accountType = deploymentType === 'cloud' ? 'cloud_customer' : 'onprem_customer'

  // 1. org
  const { data: org, error: orgErr } = await svc
    .from('organizations')
    .insert({ name, deployment_type: deploymentType, plan, status: 'active' })
    .select('id')
    .single()
  if (orgErr || !org) return json({ error: `Failed to create org: ${orgErr?.message}` }, 400)

  // 2. invite the owner (creates auth.users in `invited` state + sends the email)
  const { data: invited, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(ownerEmail, {
    redirectTo,
    data: { full_name: ownerName },
  })
  if (inviteErr || !invited.user) {
    // roll back the org so a failed invite doesn't leak an orphan org
    await svc.from('organizations').delete().eq('id', org.id)
    return json({ error: `Failed to invite owner: ${inviteErr?.message}` }, 400)
  }

  // 3. owner profile (status invited)
  const { error: profErr } = await svc.from('profiles').insert({
    id: invited.user.id,
    email: ownerEmail,
    full_name: ownerName,
    org_id: org.id,
    account_type: accountType,
    role: 'owner',
    status: 'invited',
    created_by: caller.id,
  })
  if (profErr) return json({ error: `Failed to create owner profile: ${profErr.message}` }, 400)

  // 4. invitation record (intent/metadata — §4)
  await svc.from('invitations').insert({
    email: ownerEmail,
    org_id: org.id,
    account_type: accountType,
    role: 'owner',
    invited_by: caller.id,
    status: 'pending',
  })

  await writeAudit(svc, caller.id, 'provision_org', 'organization', org.id, org.id, {
    name,
    deployment_type: deploymentType,
    owner_email: ownerEmail,
  })

  return json({ ok: true, orgId: org.id, ownerId: invited.user.id, ownerEmail })
}

// ── invite_super_admin ────────────────────────────────────────────────────────
async function inviteSuperAdmin(caller: Caller, body: Record<string, unknown>, redirectTo: string) {
  const email = (body.email as string)?.trim().toLowerCase()
  const fullName = (body.fullName as string)?.trim() || null
  const subRoleId = (body.subRoleId as string) || null
  if (!email) return json({ error: 'email is required' }, 400)

  const svc = caller.service

  const { data: invited, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  })
  if (inviteErr || !invited.user) {
    return json({ error: `Failed to invite: ${inviteErr?.message}` }, 400)
  }

  const { error: profErr } = await svc.from('profiles').insert({
    id: invited.user.id,
    email,
    full_name: fullName,
    org_id: INTERNAL_ORG_ID,
    account_type: 'super_admin',
    role: 'member',
    sub_role_id: subRoleId,
    status: 'invited',
    created_by: caller.id,
  })
  if (profErr) return json({ error: `Failed to create profile: ${profErr.message}` }, 400)

  await svc.from('invitations').insert({
    email,
    org_id: INTERNAL_ORG_ID,
    account_type: 'super_admin',
    role: 'member',
    sub_role_id: subRoleId,
    invited_by: caller.id,
    status: 'pending',
  })

  await writeAudit(svc, caller.id, 'invite_super_admin', 'profile', invited.user.id, INTERNAL_ORG_ID, {
    email,
    sub_role_id: subRoleId,
  })

  return json({ ok: true, userId: invited.user.id, email })
}

// ── assign_sub_role ───────────────────────────────────────────────────────────
async function assignSubRole(caller: Caller, body: Record<string, unknown>) {
  const userId = body.userId as string
  const subRoleId = (body.subRoleId as string) || null
  if (!userId) return json({ error: 'userId is required' }, 400)

  const svc = caller.service
  const { data: target } = await svc.from('profiles').select('org_id').eq('id', userId).single()
  const { error } = await svc.from('profiles').update({ sub_role_id: subRoleId }).eq('id', userId)
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'assign_sub_role', 'profile', userId, target?.org_id ?? null, {
    sub_role_id: subRoleId,
  })
  return json({ ok: true })
}

// ── set_reports_to (equal-admins model) ───────────────────────────────────────
// profiles.reports_to is only writable here: D-043's column-grant lockdown
// already restricts `authenticated` direct UPDATEs to full_name alone, so
// this service-role write (which bypasses column grants) is the only path
// in. Optional, UX-only convenience — never grants or implies permissions.
async function setReportsTo(caller: Caller, body: Record<string, unknown>) {
  const userId = body.userId as string
  const reportsTo = (body.reportsTo as string) || null
  if (!userId) return json({ error: 'userId is required' }, 400)

  const svc = caller.service
  const { data: target } = await svc.from('profiles').select('org_id, account_type').eq('id', userId).single()
  if (!target || target.account_type !== 'super_admin') {
    return json({ error: 'reports_to can only be set on a super_admin profile' }, 400)
  }

  // The DB trigger (prevent_reports_to_cycle) rejects a self-reference or a
  // deeper cycle by raising inside the transaction — its message surfaces
  // here as a normal 400.
  const { error } = await svc.from('profiles').update({ reports_to: reportsTo }).eq('id', userId)
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'set_reports_to', 'profile', userId, target.org_id ?? null, { reportsTo })
  return json({ ok: true })
}

// ── ingest tokens (7.4) ────────────────────────────────────────────────────────
// The only two ways an ingest_tokens row is ever written — the table itself
// grants no insert/update to `authenticated` at all. The plaintext token
// exists only in this function's memory and in create_ingest_token's one
// response; only its SHA-256 hash is ever persisted. Never pass the plaintext
// to writeAudit (metadata carries only id/label).

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const MAX_TOKEN_TTL_DAYS = 365

async function createIngestToken(caller: Caller, body: Record<string, unknown>) {
  const label = (body.label as string)?.trim()
  const expiresAt = body.expiresAt as string
  const allowedOrgIds = (body.allowedOrgIds as string[] | undefined) ?? null
  if (!label) return json({ error: 'label is required' }, 400)
  if (!expiresAt) return json({ error: 'expiresAt is required' }, 400)

  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return json({ error: 'expiresAt must be a valid date' }, 400)
  const maxExpiry = new Date(Date.now() + MAX_TOKEN_TTL_DAYS * 86_400_000)
  if (expiry > maxExpiry) return json({ error: `expiresAt must be at most ${MAX_TOKEN_TTL_DAYS} days out` }, 400)
  if (expiry <= new Date()) return json({ error: 'expiresAt must be in the future' }, 400)

  const plaintext = `cshub_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`
  const tokenHash = await sha256Hex(plaintext)

  const svc = caller.service
  const { data: row, error } = await svc
    .from('ingest_tokens')
    .insert({ label, token_hash: tokenHash, allowed_org_ids: allowedOrgIds, created_by: caller.id, expires_at: expiry.toISOString() })
    .select('id')
    .single()
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'create_ingest_token', 'ingest_tokens', row.id, null, { label })
  return json({ id: row.id, token: plaintext })
}

async function revokeIngestToken(caller: Caller, body: Record<string, unknown>) {
  const tokenId = body.tokenId as string
  if (!tokenId) return json({ error: 'tokenId is required' }, 400)

  const svc = caller.service
  const { data: target } = await svc.from('ingest_tokens').select('label').eq('id', tokenId).single()
  const { error } = await svc.from('ingest_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', tokenId)
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'revoke_ingest_token', 'ingest_tokens', tokenId, null, { label: target?.label ?? null })
  return json({ ok: true })
}

// ── update_sync_settings (7.5-pre2 Session 5) — the Sync Status screen's
// kill switch / cron time / caps form. sync_settings is a singleton row
// with no direct authenticated write policy at all (same shape as
// ingest_tokens) — this action is the only way to change it.
const SYNC_SETTINGS_FIELDS = ['kill_switch', 'daily_run_at_utc', 'max_units_per_run', 'max_units_per_day', 'max_tokens_per_unit', 'probe_token_budget', 'internal_email_domains', 'discovery_channel_patterns'] as const

async function updateSyncSettings(caller: Caller, body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}
  for (const field of SYNC_SETTINGS_FIELDS) {
    if (body[field] !== undefined) patch[field] = body[field]
  }
  if (Object.keys(patch).length === 0) return json({ error: 'no recognized settings fields were provided' }, 400)

  const svc = caller.service
  patch.updated_by = caller.id
  patch.updated_at = new Date().toISOString()
  const { error } = await svc.from('sync_settings').update(patch).eq('singleton', true)
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'update_sync_settings', 'sync_settings', null, null, patch)
  return json({ ok: true })
}

// ── enqueue_backfill (7.5-pre2 Session 5) — the Sync Status screen's "Run
// backfill" button. Thin wrapper over the SQL function of the same name
// (service_role-only EXECUTE) so the privileged write still goes through
// the same super_admin + AAL2 gate every other provisioning action does.
// "Run sync now" — the SAME work the nightly job does (every account ×
// every record type, plus one discovery sweep), just triggered by a human.
// Before this, the only manual trigger ran the sweep alone, so it silently
// did half the job the moment real accounts existed.
async function enqueueFullSync(caller: Caller, body: Record<string, unknown>) {
  const svc = caller.service
  const maxUnits = typeof body.maxUnits === 'number' ? body.maxUnits : null
  // The operator's chosen day range rides along on every queued unit.
  const windowDays = typeof body.windowDays === 'number' && body.windowDays > 0 ? Math.min(body.windowDays, 365) : null
  const { data, error } = await svc.rpc('enqueue_all_units', { p_mode: 'scoped', p_max_units: maxUnits, p_window_days: windowDays })
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'enqueue_full_sync', 'sync_queue', null, null, { enqueued: data, window_days: windowDays })
  return json({ enqueued: data })
}

async function enqueueBackfill(caller: Caller, body: Record<string, unknown>) {
  const orgIds = (body.orgIds as string[] | undefined) ?? null
  const svc = caller.service
  const { data, error } = await svc.rpc('enqueue_backfill', { p_org_ids: orgIds })
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'enqueue_backfill', 'sync_queue', null, null, { org_ids: orgIds, enqueued: data })
  return json({ enqueued: data })
}

// ── resolve_account_proposal (7.5-pre2 Session 2) ──────────────────────────────
// A human decides what an unresolved account/tenant identifier actually is.
// Four decisions: map_existing (an existing account), map_tenant (a tenant
// of an existing account, creating the tenant if needed), create_account (a
// brand-new account), or ignore (not a customer). On the first three, the
// observed identifier is saved to account_sources so it resolves instantly
// next time, and every held record blocked on this resolution is released
// through the SAME decideAndFile dedupe tree `ingest` uses (_shared/
// dedupe.ts) — never a second copy of that logic. On ignore, held records
// are discarded (rejected, logged) and the identifier joins sync_learnings'
// ignore list so it never re-proposes itself.

// 7.5-pre2 — move ONE record to a different account.
//
// Until now a held record's account was decided entirely by its resolution:
// you saw "1 record waiting" and nothing else, so "ignore" silently binned a
// record that might belong somewhere real. The session owner hit exactly
// that: CFIHOS is not a company, it is an implementation Octave is running,
// and its engagement belonged to Octave -- which no decision could express.
//
// Two shapes, one lane:
//   - a HELD record is released through the same `decideAndFile` tree a
//     resolution uses, so dedupe and validation behave identically;
//   - a PENDING record is simply re-pointed, which is how a confident but
//     wrong attribution gets corrected before approval.
async function reassignProposal(caller: Caller, body: Record<string, unknown>) {
  const proposalId = body.proposalId as string
  const orgId = body.orgId as string
  if (!proposalId || !orgId) return json({ error: 'proposalId and orgId are required' }, 400)

  const svc = caller.service
  const { data: proposal } = await svc.from('proposals').select('*').eq('id', proposalId).maybeSingle()
  if (!proposal) return json({ error: 'proposal not found' }, 404)
  if (!['held', 'pending'].includes(proposal.status)) {
    return json({ error: `only a held or pending proposal can be moved (this one is ${proposal.status})` }, 400)
  }

  const { data: org } = await svc.from('organizations').select('id, name').eq('id', orgId).maybeSingle()
  if (!org) return json({ error: 'the target account does not exist' }, 400)

  // A tenant, when given, must belong to the target account -- otherwise a
  // record could be filed under a tenant of some other customer.
  const tenantId = (body.tenantId as string) || null
  if (tenantId) {
    const { data: tenant } = await svc.from('tenants').select('id').eq('id', tenantId).eq('org_id', orgId).maybeSingle()
    if (!tenant) return json({ error: 'that tenant does not belong to the target account' }, 400)
  }

  // ── a normal pending record: just re-point it ────────────────────────
  if (proposal.status === 'pending') {
    const payload = { ...(proposal.payload as Record<string, unknown>), tenant_id: tenantId }
    const { error } = await svc.from('proposals').update({ org_id: orgId, payload }).eq('id', proposalId)
    if (error) return json({ error: error.message }, 400)
    await writeAudit(svc, caller.id, 'reassign_proposal', 'proposals', proposalId, orgId, { from: proposal.org_id, to: orgId, tenantId })
    return json({ ok: true, moved: 1, orgId, tenantId, resolutionClosed: false })
  }

  // ── a held record: release it onto the chosen account ────────────────
  const heldPayload = proposal.payload as { recordType: string; rawData: Record<string, unknown>; rawProjectRef?: string | null; rawType?: string | null }
  const recordType = heldPayload.recordType
  const targetTable = TARGET_TABLE[recordType]
  if (!targetTable) return json({ error: `unknown record type ${recordType}` }, 400)

  const { data, stripped } = filterKnownFields(recordType, heldPayload.rawData ?? {})
  for (const field of REQUIRED_FIELDS[recordType] ?? []) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return json({ error: `this record cannot be filed: missing required field "${field}"` }, 400)
    }
  }

  // tenant_id / project_id are merged INTO `data` -- decideAndFile takes
  // them that way, not as separate arguments (same as the release loop in
  // resolve_account_proposal below).
  const needsProject = NEEDS_PROJECT[recordType]
  let projectId: string | null = null
  if (heldPayload.rawProjectRef) {
    const proj = await resolveProject(svc, orgId, heldPayload.rawProjectRef)
    if (proj) projectId = proj.id
  }
  // A record type that REQUIRES a project cannot be filed under an account
  // where no matching project exists -- say so instead of silently dropping
  // it, since the whole point of this action is that nothing goes missing.
  if (needsProject === 'required' && !projectId) {
    return json({ error: `a ${recordType} needs a project, and ${heldPayload.rawProjectRef ? `"${heldPayload.rawProjectRef}"` : 'none was named'} matches no project under ${org.name}. Create the project on that account first.` }, 400)
  }
  if (projectId) data.project_id = projectId
  if (tenantId) data.tenant_id = tenantId

  const ctxForDedupe: DecideCtx = {
    source: proposal.source,
    triggeredBy: proposal.triggered_by,
    runId: proposal.run_id,
    tokenId: proposal.ingest_token_id,
    proposedBy: proposal.proposed_by,
  }
  const result = await decideAndFile(
    svc,
    {
      recordType,
      targetTable,
      orgId,
      operation: proposal.operation,
      data,
      sourceRef: proposal.source_ref ?? undefined,
      evidenceUrl: proposal.evidence_url,
      evidenceExcerpt: proposal.evidence_excerpt,
      confidence: proposal.confidence,
    },
    ctxForDedupe,
    stripped.length ? stripped : undefined,
  )

  await svc.from('proposals').update({ status: 'superseded', decided_by: caller.id, decided_at: new Date().toISOString(), reason: `moved to ${org.name}` }).eq('id', proposalId)

  // Remember the identifier, if asked and if this record came from a
  // resolution that knows what the identifier was.
  const resolutionId = proposal.blocked_by_resolution_id as string | null
  let remembered = false
  if (body.rememberIdentifier === true && resolutionId) {
    const { data: res } = await svc.from('proposals').select('payload').eq('id', resolutionId).maybeSingle()
    const observed = (res?.payload as { observedName?: string } | null)?.observedName
    if (observed) {
      const { error: srcErr } = await svc.from('account_sources').insert({
        org_id: orgId, tenant_id: tenantId, source_type: (body.sourceType as string) || 'name_variant', value: observed, created_by: caller.id,
      })
      // A duplicate identifier is not a failure -- it already points here.
      if (!srcErr) {
        remembered = true
        await svc.from('sync_learnings').insert({
          kind: 'alias_map', org_id: orgId, tenant_id: tenantId,
          content: { identifier: observed, resolvedOrgId: orgId, resolvedTenantId: tenantId },
          source_decision_ids: [resolutionId], created_by: caller.id,
        })
      }
    }
  }

  // If that was the last record waiting on its resolution, close it --
  // otherwise the Accounts section keeps an item with nothing behind it.
  let resolutionClosed = false
  if (resolutionId) {
    const { count } = await svc.from('proposals').select('id', { count: 'exact', head: true }).eq('blocked_by_resolution_id', resolutionId).eq('status', 'held')
    if (!count) {
      await svc.from('proposals').update({
        status: 'approved', decided_by: caller.id, decided_at: new Date().toISOString(),
        target_id: orgId, reason: 'records reassigned to an existing account',
      }).eq('id', resolutionId)
      resolutionClosed = true
    }
  }

  await writeAudit(svc, caller.id, 'reassign_proposal', 'proposals', proposalId, orgId, { to: orgId, tenantId, remembered, resolutionClosed, outcome: (result as { status?: string })?.status })
  return json({ ok: true, moved: 1, orgId, tenantId, remembered, resolutionClosed, outcome: (result as { status?: string })?.status })
}

async function resolveAccountProposal(caller: Caller, body: Record<string, unknown>) {
  const resolutionId = body.resolutionId as string
  const decision = body.decision as string
  if (!resolutionId || !['map_existing', 'map_tenant', 'create_account', 'ignore'].includes(decision)) {
    return json({ error: 'resolutionId and a valid decision are required' }, 400)
  }

  const svc = caller.service
  const { data: resolution } = await svc.from('proposals').select('*').eq('id', resolutionId).eq('target_table', 'account_resolution').maybeSingle()
  if (!resolution) return json({ error: 'resolution proposal not found' }, 404)
  if (resolution.status !== 'pending') return json({ error: `resolution is not pending (status=${resolution.status})` }, 400)

  const resolutionPayload = resolution.payload as { scope: 'account' | 'tenant'; observedName: string; knownOrgId: string | null }

  if (decision === 'ignore') {
    const { data: held } = await svc.from('proposals').select('id').eq('blocked_by_resolution_id', resolutionId).eq('status', 'held')
    for (const h of held ?? []) {
      await svc.from('proposals').update({ status: 'rejected', decided_by: caller.id, decided_at: new Date().toISOString(), reason: 'ignored: not a customer' }).eq('id', h.id)
    }
    await svc.from('sync_learnings').insert({
      kind: 'ignore',
      org_id: resolutionPayload.knownOrgId,
      content: { identifier: resolution.source_ref },
      source_decision_ids: [resolutionId],
      created_by: caller.id,
    })
    await svc.from('proposals').update({ status: 'rejected', decided_by: caller.id, decided_at: new Date().toISOString(), reason: 'ignored: not a customer' }).eq('id', resolutionId)
    await writeAudit(svc, caller.id, 'resolve_account_ignore', 'proposals', resolutionId, resolutionPayload.knownOrgId, { releasedCount: (held ?? []).length })
    return json({ ok: true, decision: 'ignore', releasedCount: (held ?? []).length })
  }

  // map_existing / map_tenant / create_account all resolve to a final
  // (resolvedOrgId, resolvedTenantId) pair, then share the same release path.
  let resolvedOrgId: string
  let resolvedTenantId: string | null = null

  if (decision === 'map_existing') {
    resolvedOrgId = body.orgId as string
    if (!resolvedOrgId) return json({ error: 'orgId is required for map_existing' }, 400)
    const { data: org } = await svc.from('organizations').select('id').eq('id', resolvedOrgId).maybeSingle()
    if (!org) return json({ error: 'orgId does not match any account' }, 400)
  } else if (decision === 'map_tenant') {
    resolvedOrgId = body.orgId as string
    if (!resolvedOrgId) return json({ error: 'orgId is required for map_tenant' }, 400)
    const { data: org } = await svc.from('organizations').select('id').eq('id', resolvedOrgId).maybeSingle()
    if (!org) return json({ error: 'orgId does not match any account' }, 400)
    const existingTenantId = body.tenantId as string | undefined
    const newTenantName = (body.newTenantName as string | undefined)?.trim()
    if (existingTenantId) {
      resolvedTenantId = existingTenantId
    } else if (newTenantName) {
      const { data: tenant, error } = await svc.from('tenants').insert({ org_id: resolvedOrgId, name: newTenantName, created_by: caller.id }).select('id').single()
      if (error) return json({ error: error.message }, 400)
      resolvedTenantId = tenant.id
    } else {
      return json({ error: 'tenantId or newTenantName is required for map_tenant' }, 400)
    }
  } else {
    // create_account
    const name = (body.name as string)?.trim()
    if (!name) return json({ error: 'name is required for create_account' }, 400)
    const { data: newOrg, error } = await svc
      .from('organizations')
      .insert({
        name,
        segment_id: (body.segmentId as string) || null,
        deployment_model: (body.deploymentModel as string) || null,
        deployment_type: (body.deploymentType as string) || 'cloud',
        lifecycle_stage: (body.lifecycleStage as string) || 'prospect',
        status: 'active',
      })
      .select('id')
      .single()
    if (error) return json({ error: error.message }, 400)
    resolvedOrgId = newOrg.id
  }

  // Save the observed identifier so it resolves instantly next time --
  // unless the caller declined. Declining is the "this is not an account,
  // but its records belong to X" case: CFIHOS is an implementation Octave
  // is running, so its records belong to Octave while "CFIHOS" itself is
  // not an alias for the company.
  const ACCOUNT_SOURCE_TYPES = ['slack_channel', 'email_domain', 'zendesk_org_id', 'fireflies_hint', 'name_variant']
  const sourceType = (body.sourceType as string) || 'name_variant'
  if (!ACCOUNT_SOURCE_TYPES.includes(sourceType)) return json({ error: `sourceType must be one of ${ACCOUNT_SOURCE_TYPES.join(', ')}` }, 400)
  const remember = body.rememberIdentifier !== false
  const { error: sourceError } = remember ? await svc.from('account_sources').insert({
    org_id: resolvedOrgId,
    tenant_id: resolvedTenantId,
    source_type: sourceType,
    value: resolutionPayload.observedName,
    created_by: caller.id,
  }) : { error: null }
  if (sourceError) return json({ error: `could not save the identifier: ${sourceError.message}` }, 400)
  if (remember) await svc.from('sync_learnings').insert({
    kind: 'alias_map',
    org_id: resolvedOrgId,
    tenant_id: resolvedTenantId,
    content: { identifier: resolutionPayload.observedName, resolvedOrgId, resolvedTenantId },
    source_decision_ids: [resolutionId],
    created_by: caller.id,
  })

  // Release every held record blocked on this resolution through the same
  // dedupe tree `ingest` uses for a fresh sighting.
  const { data: held } = await svc.from('proposals').select('*').eq('blocked_by_resolution_id', resolutionId).eq('status', 'held')
  let releasedCount = 0
  for (const h of held ?? []) {
    const heldPayload = h.payload as { recordType: string; rawData: Record<string, unknown>; rawProjectRef?: string | null; rawTenantRef?: string | null; rawType?: string | null }
    const recordType = heldPayload.recordType
    const targetTable = TARGET_TABLE[recordType]
    const { data, stripped } = filterKnownFields(recordType, heldPayload.rawData ?? {})

    let missingField: string | null = null
    for (const field of REQUIRED_FIELDS[recordType] ?? []) {
      if (data[field] === undefined || data[field] === null || data[field] === '') { missingField = field; break }
    }
    if (missingField) {
      await svc.from('proposals').update({ status: 'rejected', decided_by: caller.id, decided_at: new Date().toISOString(), reason: `missing required field: ${missingField}` }).eq('id', h.id)
      continue
    }

    // Same per-type validation `ingest` runs for a fresh sighting — a held
    // record skipped it originally (the account wasn't known yet), so it
    // has to happen here instead, not be silently skipped forever.
    let rejectReason: string | null = null
    if (recordType === 'metric') {
      const { data: def } = await svc.from('metric_definitions').select('key').eq('key', data.metric_key as string).maybeSingle()
      if (!def) rejectReason = 'unknown metric_key'
      else if (Number.isNaN(new Date(data.period as string).getTime())) rejectReason = 'invalid period'
    } else if (recordType === 'health' && !['active', 'caution', 'risk'].includes(String(data.health).toLowerCase())) {
      rejectReason = 'invalid health value'
    } else if (recordType === 'action_item') {
      const owner = await resolveOwner(svc, heldPayload.rawData?.owner as string | undefined)
      if (owner) {
        if (owner.profileId) data.owner_profile_id = owner.profileId
        else data.owner_text = owner.text
      }
      if (data.priority) {
        const p = String(data.priority).toLowerCase()
        if (!ACTION_ITEM_PRIORITIES.includes(p)) rejectReason = 'invalid priority value'
        else data.priority = p
      }
      if (!rejectReason && data.status) {
        const s = String(data.status).toLowerCase()
        if (!ACTION_ITEM_STATUSES.includes(s)) rejectReason = 'invalid status value'
        else data.status = s
      }
    } else if (recordType === 'engagement') {
      const type = String(heldPayload.rawType ?? '').toLowerCase()
      if (!ENGAGEMENT_TYPES.includes(type)) rejectReason = 'type is required and must be one of: ' + ENGAGEMENT_TYPES.join(', ')
      else data.type = type
    }
    if (rejectReason) {
      await svc.from('proposals').update({ status: 'rejected', decided_by: caller.id, decided_at: new Date().toISOString(), reason: rejectReason }).eq('id', h.id)
      continue
    }

    const needsProject = NEEDS_PROJECT[recordType]
    let projectId: string | null = null
    if (heldPayload.rawProjectRef) {
      const proj = await resolveProject(svc, resolvedOrgId, heldPayload.rawProjectRef)
      if (proj) projectId = proj.id
      else if (needsProject === 'required') {
        await svc.from('proposals').update({ status: 'rejected', decided_by: caller.id, decided_at: new Date().toISOString(), reason: 'unknown project (after account resolution)' }).eq('id', h.id)
        continue
      }
    } else if (needsProject === 'required') {
      await svc.from('proposals').update({ status: 'rejected', decided_by: caller.id, decided_at: new Date().toISOString(), reason: 'project is required for this record_type' }).eq('id', h.id)
      continue
    }
    if (projectId) data.project_id = projectId
    if (resolvedTenantId) data.tenant_id = resolvedTenantId

    const ctxForDedupe: DecideCtx = { source: h.source, triggeredBy: h.triggered_by, runId: h.run_id, tokenId: h.ingest_token_id, proposedBy: h.proposed_by }
    await decideAndFile(svc, { recordType, targetTable, orgId: resolvedOrgId, operation: h.operation, data, sourceRef: h.source_ref, evidenceUrl: h.evidence_url, evidenceExcerpt: h.evidence_excerpt, confidence: h.confidence }, ctxForDedupe, stripped.length ? stripped : undefined)
    await svc.from('proposals').update({ status: 'superseded', decided_by: caller.id, decided_at: new Date().toISOString(), reason: `resolved via account_resolution ${resolutionId}` }).eq('id', h.id)
    releasedCount++
  }

  await svc.from('proposals').update({ status: 'approved', decided_by: caller.id, decided_at: new Date().toISOString(), target_id: resolvedOrgId }).eq('id', resolutionId)
  await writeAudit(svc, caller.id, 'resolve_account_' + decision, 'proposals', resolutionId, resolvedOrgId, { decision, resolvedOrgId, resolvedTenantId, releasedCount })

  // The sweep's own held records arrived with this resolution, but they are
  // only what discovery happened to see. Queue the account's full
  // per-account pass now rather than making it wait for the next nightly
  // cycle -- an account someone just confirmed is real is exactly the one
  // worth looking at properly. Best-effort: the queue is not the point of
  // this request, so a failure here must not fail the resolution.
  let enqueued = 0
  try {
    const { data } = await svc.rpc('enqueue_account', { p_org_id: resolvedOrgId })
    enqueued = Number(data ?? 0)
  } catch (err) {
    console.log(`resolve_account: could not queue a sync for ${resolvedOrgId} — ${String(err)}`)
  }

  return json({ ok: true, decision, orgId: resolvedOrgId, tenantId: resolvedTenantId, releasedCount, enqueued })
}

// ── set_user_status ───────────────────────────────────────────────────────────
async function setUserStatus(caller: Caller, body: Record<string, unknown>) {
  const userId = body.userId as string
  const status = body.status as string
  if (!userId || (status !== 'active' && status !== 'disabled')) {
    return json({ error: 'userId and status (active|disabled) are required' }, 400)
  }

  const svc = caller.service
  const { data: target } = await svc.from('profiles').select('org_id').eq('id', userId).single()

  const { error } = await svc.from('profiles').update({ status }).eq('id', userId)
  if (error) return json({ error: error.message }, 400)

  // Mirror to the auth user so a disabled account cannot sign in (reversible).
  await svc.auth.admin.updateUserById(userId, {
    ban_duration: status === 'disabled' ? '876000h' : 'none',
  })

  await writeAudit(svc, caller.id, 'set_user_status', 'profile', userId, target?.org_id ?? null, { status })
  return json({ ok: true })
}

// ── accept_invite (self) ──────────────────────────────────────────────────────
// The caller here is the invited user (already authenticated after setting a
// password). We bypass the super_admin gate for this one action and instead
// verify the caller is flipping their OWN currently-invited profile.
async function acceptInvite(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization bearer token' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Invalid or expired session' }, 401)

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const userId = userData.user.id
  const { data: prof } = await svc
    .from('profiles')
    .select('status, org_id')
    .eq('id', userId)
    .single()
  if (!prof) return json({ error: 'Profile not found' }, 404)
  if (prof.status !== 'invited') {
    // Idempotent: already active is fine, don't error the accept page.
    return json({ ok: true, alreadyActive: prof.status === 'active' })
  }

  const { error } = await svc.from('profiles').update({ status: 'active' }).eq('id', userId)
  if (error) return json({ error: error.message }, 400)

  await svc
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('email', userData.user.email ?? '')
    .eq('status', 'pending')

  await writeAudit(svc, userId, 'accept_invite', 'profile', userId, prof.org_id ?? null, {})
  return json({ ok: true })
}

// ── owner_invite_user (owner lane) ────────────────────────────────────────────
// Invite a MEMBER into the caller-owner's own org, with an optional customer
// sub-role. account_type is forced to the owner's own type — never super_admin,
// never another org.
async function ownerInviteUser(caller: Caller, body: Record<string, unknown>, redirectTo: string) {
  const email = (body.email as string)?.trim().toLowerCase()
  const fullName = (body.fullName as string)?.trim() || null
  const subRoleId = (body.subRoleId as string) || null
  if (!email) return json({ error: 'email is required' }, 400)

  const svc = caller.service
  if (subRoleId && !(await ownerSubRoleValid(svc, subRoleId, caller.accountType, caller.orgId))) {
    return json({ error: 'Invalid sub-role for this org' }, 400)
  }

  const { data: invited, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  })
  if (inviteErr || !invited.user) return json({ error: `Failed to invite: ${inviteErr?.message}` }, 400)

  const { error: profErr } = await svc.from('profiles').insert({
    id: invited.user.id,
    email,
    full_name: fullName,
    org_id: caller.orgId,
    account_type: caller.accountType,
    role: 'member',
    sub_role_id: subRoleId,
    status: 'invited',
    created_by: caller.id,
  })
  if (profErr) return json({ error: `Failed to create profile: ${profErr.message}` }, 400)

  await svc.from('invitations').insert({
    email,
    org_id: caller.orgId,
    account_type: caller.accountType,
    role: 'member',
    sub_role_id: subRoleId,
    invited_by: caller.id,
    status: 'pending',
  })

  await writeAudit(svc, caller.id, 'owner_invite_user', 'profile', invited.user.id, caller.orgId, { email, sub_role_id: subRoleId })
  return json({ ok: true, userId: invited.user.id, email })
}

// ── owner_assign_sub_role (owner lane) ────────────────────────────────────────
async function ownerAssignSubRole(caller: Caller, body: Record<string, unknown>) {
  const userId = body.userId as string
  const subRoleId = (body.subRoleId as string) || null
  if (!userId) return json({ error: 'userId is required' }, 400)

  const svc = caller.service
  const { data: target } = await svc.from('profiles').select('org_id, account_type').eq('id', userId).single()
  if (!target || target.org_id !== caller.orgId) return json({ error: 'Forbidden: user is not in your org' }, 403)
  if (subRoleId && !(await ownerSubRoleValid(svc, subRoleId, caller.accountType, caller.orgId))) {
    return json({ error: 'Invalid sub-role for this org' }, 400)
  }

  const { error } = await svc.from('profiles').update({ sub_role_id: subRoleId }).eq('id', userId)
  if (error) return json({ error: error.message }, 400)

  await writeAudit(svc, caller.id, 'owner_assign_sub_role', 'profile', userId, caller.orgId, { sub_role_id: subRoleId })
  return json({ ok: true })
}

// ── owner_set_user_status (owner lane) ────────────────────────────────────────
async function ownerSetUserStatus(caller: Caller, body: Record<string, unknown>) {
  const userId = body.userId as string
  const status = body.status as string
  if (!userId || (status !== 'active' && status !== 'disabled')) {
    return json({ error: 'userId and status (active|disabled) are required' }, 400)
  }
  if (userId === caller.id) return json({ error: 'You cannot change your own status' }, 400)

  const svc = caller.service
  const { data: target } = await svc.from('profiles').select('org_id').eq('id', userId).single()
  if (!target || target.org_id !== caller.orgId) return json({ error: 'Forbidden: user is not in your org' }, 403)

  const { error } = await svc.from('profiles').update({ status }).eq('id', userId)
  if (error) return json({ error: error.message }, 400)
  await svc.auth.admin.updateUserById(userId, { ban_duration: status === 'disabled' ? '876000h' : 'none' })

  await writeAudit(svc, caller.id, 'owner_set_user_status', 'profile', userId, caller.orgId, { status })
  return json({ ok: true })
}

const SUPER_ACTIONS = new Set(['provision_org', 'invite_super_admin', 'assign_sub_role', 'set_user_status', 'set_reports_to', 'create_ingest_token', 'revoke_ingest_token', 'resolve_account_proposal', 'update_sync_settings', 'enqueue_backfill', 'enqueue_full_sync', 'reassign_proposal'])
const OWNER_ACTIONS = new Set(['owner_invite_user', 'owner_assign_sub_role', 'owner_set_user_status'])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const action = body.action as string
  const origin = req.headers.get('origin') ?? 'http://127.0.0.1:5173'
  const redirectTo = (body.redirectTo as string) || `${origin}/accept-invite`

  // accept_invite is self-service (neither super_admin- nor owner-gated).
  if (action === 'accept_invite') return acceptInvite(req)

  const caller = await loadCaller(req)
  if (caller instanceof Response) return caller

  // super_admin lane (6.4a)
  if (SUPER_ACTIONS.has(action)) {
    const denied = requireSuperAdminAal2(caller)
    if (denied) return denied
    switch (action) {
      case 'provision_org':
        return provisionOrg(caller, body, redirectTo)
      case 'invite_super_admin':
        return inviteSuperAdmin(caller, body, redirectTo)
      case 'assign_sub_role':
        return assignSubRole(caller, body)
      case 'set_user_status':
        return setUserStatus(caller, body)
      case 'set_reports_to':
        return setReportsTo(caller, body)
      case 'create_ingest_token':
        return createIngestToken(caller, body)
      case 'revoke_ingest_token':
        return revokeIngestToken(caller, body)
      case 'reassign_proposal':
        return await reassignProposal(caller, body)
      case 'resolve_account_proposal':
        return resolveAccountProposal(caller, body)
      case 'update_sync_settings':
        return updateSyncSettings(caller, body)
      case 'enqueue_backfill':
        return enqueueBackfill(caller, body)
      case 'enqueue_full_sync':
        return enqueueFullSync(caller, body)
    }
  }

  // owner lane (6.4b) — own-org only, own customer type, AAL2
  if (OWNER_ACTIONS.has(action)) {
    const denied = requireOwnerAal2(caller)
    if (denied) return denied
    switch (action) {
      case 'owner_invite_user':
        return ownerInviteUser(caller, body, redirectTo)
      case 'owner_assign_sub_role':
        return ownerAssignSubRole(caller, body)
      case 'owner_set_user_status':
        return ownerSetUserStatus(caller, body)
    }
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
