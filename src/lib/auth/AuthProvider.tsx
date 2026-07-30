import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AccountType, AuthUser, Profile, UserRole } from '@/types'

// Supabase account_type → the UserRole the existing 5.x UI already switches on
// (D-033). Keeps every useAuth() consumer working with real identity.
const ACCOUNT_TYPE_TO_ROLE: Record<AccountType, UserRole> = {
  super_admin: 'super_admin',
  cloud_customer: 'cloud_customer_admin',
  onprem_customer: 'onprem_customer_admin',
}

interface EnrollResult {
  factorId: string
  qrCode: string
  secret: string
}

interface AuthContextState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  aalCurrent: string | null
  aalNext: string | null
  role: UserRole | null
  user: AuthUser | null
  // super_admin must reach AAL2 (matches the RLS is_aal2() gate, D-029/D-034).
  needsMfa: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  reload: () => Promise<void>
  hasVerifiedTotp: () => Promise<boolean>
  enrollTotp: () => Promise<EnrollResult>
  verifyTotp: (factorId: string, code: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextState | null>(null)

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, org_id, account_type, role, sub_role_id, status, organizations(name, deployment_type, external_ref)')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    orgId: row.org_id,
    accountType: row.account_type,
    role: row.role,
    subRoleId: row.sub_role_id,
    status: row.status,
    org: org ? { name: org.name, deploymentType: org.deployment_type, externalRef: org.external_ref } : null,
  }
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [aalCurrent, setAalCurrent] = useState<string | null>(null)
  const [aalNext, setAalNext] = useState<string | null>(null)
  const mounted = useRef(true)

  const hydrate = useCallback(async (sess: Session | null) => {
    setSession(sess)
    if (!sess) {
      setProfile(null)
      setAalCurrent(null)
      setAalNext(null)
      return
    }
    const [prof, aal] = await Promise.all([
      loadProfile(sess.user.id),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (!mounted.current) return
    setProfile(prof)
    setAalCurrent(aal.data?.currentLevel ?? null)
    setAalNext(aal.data?.nextLevel ?? null)
  }, [])

  useEffect(() => {
    mounted.current = true
    supabase.auth.getSession().then(async ({ data }) => {
      await hydrate(data.session)
      if (mounted.current) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      hydrate(sess)
    })
    return () => {
      mounted.current = false
      sub.subscription.unsubscribe()
    }
  }, [hydrate])

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await hydrate(data.session)
  }, [hydrate])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const hasVerifiedTotp = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    return (data?.totp ?? []).some((f) => f.status === 'verified')
  }, [])

  const enrollTotp = useCallback(async (): Promise<EnrollResult> => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error || !data) throw new Error(error?.message ?? 'Enrollment failed')
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
  }, [])

  const verifyTotp = useCallback(async (factorId: string, code: string) => {
    const challenge = await supabase.auth.mfa.challenge({ factorId })
    if (challenge.error) return { error: challenge.error.message }
    const verify = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code })
    if (verify.error) return { error: verify.error.message }
    await reload()
    return { error: null }
  }, [reload])

  const role = profile ? ACCOUNT_TYPE_TO_ROLE[profile.accountType] : null

  // orgId feeds the (still-mock) metrics hooks: external_ref holds the mock org
  // id until 6.5 wires live metrics (D-033). super_admin (internal org) has none.
  const user: AuthUser | null = useMemo(() => {
    if (!profile || !role) return null
    return {
      id: profile.id,
      name: profile.fullName ?? profile.email,
      email: profile.email,
      role,
      orgId: profile.org?.externalRef ?? undefined,
    }
  }, [profile, role])

  const needsMfa = role === 'super_admin' && aalCurrent !== 'aal2'

  const value: AuthContextState = {
    loading, session, profile, aalCurrent, aalNext, role, user, needsMfa,
    signIn, signOut, reload, hasVerifiedTotp, enrollTotp, verifyTotp,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useSupabaseAuth(): AuthContextState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useSupabaseAuth must be used within SupabaseAuthProvider')
  return ctx
}
