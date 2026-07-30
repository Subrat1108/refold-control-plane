import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import { PORTAL_NAME, PORTAL_NAMES, type Portal } from '@/config/portal'

// Shown when a signed-in user's account_type doesn't match this portal (§ 6).
// Blocks entry and offers sign-out (we don't auto-sign-out, so the message
// stays visible rather than flashing before a /login redirect).
export function WrongPortal({ correctPortal }: { correctPortal: Portal }) {
  const { signOut } = useSupabaseAuth()

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center px-4 text-center">
      <div className="w-full max-w-md">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4 mx-auto">
          <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Wrong portal</h1>
        <p className="text-sm text-muted-foreground mb-1">
          This is the <span className="font-medium text-foreground">{PORTAL_NAME}</span>, but your account belongs to the{' '}
          <span className="font-medium text-foreground">{PORTAL_NAMES[correctPortal]}</span>.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Please sign in on the {PORTAL_NAMES[correctPortal]} instead.
        </p>
        <button
          onClick={signOut}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
