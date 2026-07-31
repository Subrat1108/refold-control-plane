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
    target_type: targetType,
    target_id: targetId,
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

const SUPER_ACTIONS = new Set(['provision_org', 'invite_super_admin', 'assign_sub_role', 'set_user_status'])
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
