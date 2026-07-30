import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import { homeRoute } from '@/config/navigation'

// Real Supabase email + password sign-in (Phase 6.2). MFA step-up for
// super-admins is handled by RequireAuth after routing home.
export function LoginPage() {
  const { session, profile, role, signIn } = useSupabaseAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Once identity is loaded (fresh sign-in or resumed session), go to the home
  // for this role; RequireAuth enforces MFA there if needed.
  useEffect(() => {
    if (session && profile && role) navigate(homeRoute(role), { replace: true })
  }, [session, profile, role, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: err } = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError('Incorrect email or password')
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-[#6366F1] flex items-center justify-center font-bold text-white text-lg">R</div>
          <span className="font-semibold text-xl text-foreground">Refold Admin</span>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-card p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              id="email"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              placeholder="you@company.com"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
