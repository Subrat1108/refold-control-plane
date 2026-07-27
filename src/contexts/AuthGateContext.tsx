import { createContext, useState, ReactNode } from 'react'

// PLACEHOLDER AUTH (build-spec § 11.4) — a simple localStorage password gate for
// the free-tier deployment. Replace entirely with real auth (JWT/OAuth) when a
// backend exists. This is NOT the mock role system (that lives in AuthContext).
const STORAGE_KEY = 'refold_admin_authed'
const DEMO_PASSWORD = 'refold-demo-2025'

interface AuthGateValue {
  authed: boolean
  signIn: (password: string) => boolean
  signOut: () => void
}

export const AuthGateContext = createContext<AuthGateValue | null>(null)

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true'
  )

  function signIn(password: string): boolean {
    if (password !== DEMO_PASSWORD) return false
    localStorage.setItem(STORAGE_KEY, 'true')
    setAuthed(true)
    return true
  }

  function signOut() {
    localStorage.removeItem(STORAGE_KEY)
    setAuthed(false)
  }

  return <AuthGateContext.Provider value={{ authed, signIn, signOut }}>{children}</AuthGateContext.Provider>
}
