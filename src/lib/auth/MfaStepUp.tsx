import { useEffect, useRef, useState } from 'react'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'

// Full-screen MFA step-up shown when a privileged (super_admin) session is not
// yet AAL2 — enroll a TOTP factor on first login, else challenge an existing one
// (§ 6). On success the auth context reloads and RequireAuth renders the app.
export function MfaStepUp() {
  const { enrollTotp, verifyTotp, hasVerifiedTotp, signOut } = useSupabaseAuth()
  const [mode, setMode] = useState<'loading' | 'enroll' | 'challenge'>('loading')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Run the prepare exactly once per mount. A plain `active` cleanup flag isn't
  // enough here: React 18 StrictMode double-invokes effects in dev, and a second
  // enroll while the first is pending 422s (and orphans an unverified factor).
  const prepared = useRef(false)
  useEffect(() => {
    if (prepared.current) return
    prepared.current = true
    ;(async () => {
      try {
        if (await hasVerifiedTotp()) {
          setMode('challenge')
          return
        }
        const enrollment = await enrollTotp()
        setFactorId(enrollment.factorId)
        setQrCode(enrollment.qrCode)
        setSecret(enrollment.secret)
        setMode('enroll')
      } catch (e) {
        prepared.current = false // allow a retry
        setError(e instanceof Error ? e.message : 'MFA setup failed')
      }
    })()
  }, [enrollTotp, hasVerifiedTotp])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    // For a challenge (existing factor) we need the factorId; look it up lazily.
    let fid = factorId
    if (!fid) {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase.auth.mfa.listFactors()
      fid = (data?.totp ?? []).find((f) => f.status === 'verified')?.id ?? ''
    }
    const { error: verr } = await verifyTotp(fid, code.trim())
    setBusy(false)
    if (verr) setError(verr)
    // on success, verifyTotp reloads the session → needsMfa flips false → app renders
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-[#6366F1] flex items-center justify-center font-bold text-white text-lg">R</div>
          <span className="font-semibold text-xl text-foreground">Two-factor authentication</span>
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl shadow-card p-6 space-y-4">
          {mode === 'loading' && <p className="text-sm text-muted-foreground">Preparing MFA…</p>}

          {mode === 'enroll' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Scan this QR code in an authenticator app (or enter the key), then type the 6-digit code.
              </p>
              {qrCode && (
                <div className="flex justify-center">
                  {qrCode.trim().startsWith('<svg')
                    ? <span dangerouslySetInnerHTML={{ __html: qrCode }} />
                    : <img src={qrCode} alt="TOTP QR code" className="w-40 h-40" />}
                </div>
              )}
              <div className="text-xs text-muted-foreground text-center break-all">
                Key: <span className="font-mono">{secret}</span>
              </div>
            </div>
          )}

          {mode === 'challenge' && (
            <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
          )}

          {mode !== 'loading' && (
            <div>
              <input
                autoFocus
                inputMode="numeric"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError('') }}
                placeholder="123456"
                className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
            </div>
          )}

          {mode !== 'loading' && (
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          )}

          <button type="button" onClick={signOut} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
            Sign out
          </button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-4">Required for super-admin access</p>
      </div>
    </div>
  )
}
