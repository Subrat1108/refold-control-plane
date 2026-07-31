import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { acceptInvite } from '@/lib/provisioning'

// Phase 6.4a — invite-accept / set-password page. Reachable pre-auth (top-level
// route, outside RequireAuth). The invite email link carries tokens that
// supabase-js (detectSessionInUrl) turns into a session on load; the user then
// sets a password and we flip their profile invited→active via the Edge Function
// (controlled transition + audit — D-038).
type Phase = 'checking' | 'ready' | 'saving' | 'done' | 'no-session'

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('checking')
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    // Give detectSessionInUrl a moment to consume the hash, then look for a
    // session established from the invite link.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) {
        setEmail(data.session.user.email ?? '')
        setPhase('ready')
      } else {
        setPhase('no-session')
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return
      if (session) {
        setEmail(session.user.email ?? '')
        setPhase((p) => (p === 'done' || p === 'saving' ? p : 'ready'))
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setPhase('saving')
    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) {
      setError(pwErr.message)
      setPhase('ready')
      return
    }
    try {
      await acceptInvite()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate account')
      setPhase('ready')
      return
    }
    await supabase.auth.signOut()
    setPhase('done')
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-[#6366F1] flex items-center justify-center font-bold text-white text-lg">R</div>
          <span className="font-semibold text-xl text-foreground">Refold Admin</span>
        </div>

        <div className="bg-white rounded-xl shadow-card p-6">
          {phase === 'checking' && (
            <p className="text-sm text-muted-foreground text-center py-4">Verifying your invitation…</p>
          )}

          {phase === 'no-session' && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-foreground">Invitation link invalid or expired</p>
              <p className="text-xs text-muted-foreground">Ask your administrator to resend the invite, then open the newest link.</p>
              <button onClick={() => navigate('/login')} className="text-sm font-medium text-primary hover:underline">Back to sign in</button>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-foreground">Account activated</p>
              <p className="text-xs text-muted-foreground">Your password is set. Sign in to continue.</p>
              <button onClick={() => navigate('/login')} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">Go to sign in</button>
            </div>
          )}

          {(phase === 'ready' || phase === 'saving') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">Set your password</p>
                {email && <p className="text-xs text-muted-foreground mt-0.5">{email}</p>}
              </div>
              <div>
                <label htmlFor="pw" className="block text-sm font-medium text-foreground mb-1.5">New password</label>
                <input
                  id="pw"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label htmlFor="pw2" className="block text-sm font-medium text-foreground mb-1.5">Confirm password</label>
                <input
                  id="pw2"
                  type="password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError('') }}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
              </div>
              <button
                type="submit"
                disabled={phase === 'saving' || !password || !confirm}
                className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'saving' ? 'Activating…' : 'Set password & activate'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
