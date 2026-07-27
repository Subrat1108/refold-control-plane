import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthGate } from '@/hooks/useAuthGate'

// PLACEHOLDER AUTH (build-spec § 11.4) — a single hardcoded password gate for the
// public free-tier deployment. Replace with real auth when a backend exists.
export function LoginPage() {
  const { authed, signIn } = useAuthGate()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  if (authed) return <Navigate to="/overview" replace />

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (signIn(password)) {
      navigate('/overview', { replace: true })
    } else {
      setError(true)
    }
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
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false) }}
              placeholder="Enter password"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {error && <p className="text-xs text-red-600 mt-1.5">Incorrect password</p>}
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">Placeholder auth — demo access only</p>
      </div>
    </div>
  )
}
