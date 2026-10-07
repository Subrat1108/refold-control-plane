// Role-login smoke check (hotfix for the 7.1 PGRST201 regression — D-068).
//
// Signs in as each demo role and runs the EXACT profile query AuthProvider's
// loadProfile() uses (kept in sync manually — if you change that query, update
// the SELECT string below too) against the local Supabase stack. Catches
// PostgREST embed ambiguity (PGRST201) and any other profile-load regression
// BEFORE it reaches production, since this app's auth gate depends on that
// query succeeding for every signed-in user.
//
// Per CLAUDE.md's session protocol: run this against a FRESH `supabase db
// reset` before pushing any session that added migrations.
//
// Credentials are NEVER hardcoded here — only emails (not secrets; already
// public in supabase/seed.sql and the README demo-creds table). Passwords come
// from env vars, which you export yourself before running:
//
//   export SMOKE_SUPER_PASSWORD=demo-super-2026
//   export SMOKE_PRISM_OWNER_PASSWORD=demo-owner-2026
//   export SMOKE_MERIDIAN_OWNER_PASSWORD=demo-owner-2026
//   npx tsx scripts/smoke-login.ts
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the environment (or
// from a local .env file, loaded manually below — no extra dependency).

import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── tiny .env loader (no dotenv dependency) — only fills vars not already set ──
function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}
loadDotEnv()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

interface RoleCheck {
  label: string
  email: string
  passwordEnvVar: string
}

const ROLES: RoleCheck[] = [
  { label: 'super_admin', email: 'super@refold.internal', passwordEnvVar: 'SMOKE_SUPER_PASSWORD' },
  { label: 'cloud owner (Prism)', email: 'owner@prismanalytics.io', passwordEnvVar: 'SMOKE_PRISM_OWNER_PASSWORD' },
  { label: 'onprem owner (Meridian)', email: 'owner@meridian-labs.jp', passwordEnvVar: 'SMOKE_MERIDIAN_OWNER_PASSWORD' },
]

// Must match loadProfile()'s select string in src/lib/auth/AuthProvider.tsx
// EXACTLY — this is the query that broke in production (PGRST201) when 7.1
// added a second profiles<->organizations relationship.
const PROFILE_SELECT =
  'id, email, full_name, org_id, account_type, role, sub_role_id, status, organizations!profiles_org_id_fkey(name, deployment_type, external_ref)'

async function main() {
  const missingEnv: string[] = []
  if (!SUPABASE_URL) missingEnv.push('VITE_SUPABASE_URL')
  if (!SUPABASE_ANON_KEY) missingEnv.push('VITE_SUPABASE_ANON_KEY')
  for (const r of ROLES) if (!process.env[r.passwordEnvVar]) missingEnv.push(r.passwordEnvVar)
  if (missingEnv.length) {
    console.error(`Missing required env var(s): ${missingEnv.join(', ')}`)
    process.exit(1)
  }

  let allOk = true
  for (const role of ROLES) {
    const password = process.env[role.passwordEnvVar]!
    const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: false } })

    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: role.email, password })
    if (signInError || !signIn.user) {
      console.log(`FAIL  ${role.label.padEnd(24)} sign-in: ${signInError?.message ?? 'no user returned'}`)
      allOk = false
      continue
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', signIn.user.id)
      .single()

    if (profileError || !profile) {
      console.log(`FAIL  ${role.label.padEnd(24)} profile load: ${profileError?.message ?? 'no profile returned'}`)
      allOk = false
      continue
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const org = (profile as any).organizations
    const orgRow = Array.isArray(org) ? org[0] : org
    if (!orgRow?.name) {
      console.log(`FAIL  ${role.label.padEnd(24)} profile loaded but organizations embed is empty`)
      allOk = false
      continue
    }

    console.log(`PASS  ${role.label.padEnd(24)} profile + org "${orgRow.name}" loaded`)
  }

  console.log()
  console.log(allOk ? 'ALL ROLE-LOGIN SMOKE CHECKS PASSED' : 'SMOKE CHECK FAILED')
  process.exit(allOk ? 0 : 1)
}

main()
