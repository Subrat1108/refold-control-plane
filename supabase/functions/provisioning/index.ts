// Phase 6.4a — Provisioning Edge Function (build-spec-v2 §§ 7, 10).
//
// This function is the ONLY holder of the service-role key (injected locally as
// SUPABASE_SERVICE_ROLE_KEY; never shipped to any frontend — D-025/§10). Because
// the service-role client BYPASSES RLS, the function MUST itself verify that the
// caller is a super_admin AND at AAL2 before doing anything (D-029/D-034). RLS is
// not the gate here — this code is.
//
// Actions (JSON body { action, ...payload }):
//   provision_org      — create a customer org + invite its owner
//   invite_super_admin — invite an internal super-admin user + assign a sub-role
//   assign_sub_role    — change a user's sub_role_id
//   set_user_status    — disable/enable a user (profile status + auth ban)
//   accept_invite      — (self) flip an invited user's status to active
// Every action writes an audit_log row carrying org_id (D-032).

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
  service: SupabaseClient
}

// Verify caller is a super_admin at AAL2, or return a 4xx Response to short out.
async function authorize(req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization bearer token' }, 401)

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Invalid or expired session' }, 401)

  // account_type check — the caller reads their own profile under RLS.
  const { data: prof } = await caller
    .from('profiles')
    .select('account_type')
    .eq('id', userData.user.id)
    .single()
  if (!prof || prof.account_type !== 'super_admin') {
    return json({ error: 'Forbidden: super_admin required' }, 403)
  }

  // AAL2 check — the service-role key bypasses RLS's is_aal2(), so enforce here.
  if (jwtAal(token) !== 'aal2') {
    return json({ error: 'Forbidden: AAL2 (MFA) required' }, 403)
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { id: userData.user.id, service }
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

  // accept_invite is self-service (not super_admin-gated).
  if (action === 'accept_invite') return acceptInvite(req)

  const auth = await authorize(req)
  if (auth instanceof Response) return auth

  switch (action) {
    case 'provision_org':
      return provisionOrg(auth, body, redirectTo)
    case 'invite_super_admin':
      return inviteSuperAdmin(auth, body, redirectTo)
    case 'assign_sub_role':
      return assignSubRole(auth, body)
    case 'set_user_status':
      return setUserStatus(auth, body)
    default:
      return json({ error: `Unknown action: ${action}` }, 400)
  }
})
