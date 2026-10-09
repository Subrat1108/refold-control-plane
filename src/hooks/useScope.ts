// Persists the current scope selection per (page, person) in localStorage;
// saved views themselves live in Postgres (useSavedViews).
//
// Default resolution order (equal-admins model, item e): my saved default
// view for this page → "My accounts" if I have any active account_roles →
// else "Everyone" (so a person with no active roles yet never opens to an
// empty screen). Once the person explicitly picks a scope, that choice is
// remembered per-page and wins over the default on their next visit.
import { useCallback, useEffect, useState } from 'react'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import { useSavedViews } from './useSavedViews'
import { useMyActiveAccountIds } from './usePeople'
import type { SavedViewScope } from '@/types'

interface ScopeState {
  scope: SavedViewScope
  scopeTarget: string | null
}

export function useScope(page: string) {
  const { profile } = useSupabaseAuth()
  const { data: savedViews } = useSavedViews(page)
  const { data: myActiveAccountIds } = useMyActiveAccountIds()
  const storageKey = profile ? `scope:${page}:${profile.id}` : null

  const [state, setState] = useState<ScopeState | null>(null)

  useEffect(() => {
    if (!profile || state !== null) return // resolve once per mount
    if (storageKey) {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as ScopeState
          if (parsed.scope) { setState(parsed); return }
        } catch { /* fall through to the default chain below */ }
      }
    }
    if (savedViews === undefined || myActiveAccountIds === undefined) return // wait for both queries to settle
    const defaultView = savedViews.find((v) => v.isDefault)
    if (defaultView) {
      setState({ scope: defaultView.scope, scopeTarget: defaultView.scopeTarget })
      return
    }
    setState({ scope: myActiveAccountIds.length > 0 ? 'mine' : 'everyone', scopeTarget: null })
  }, [profile, savedViews, myActiveAccountIds, state, storageKey])

  const setScope = useCallback((scope: SavedViewScope, scopeTarget: string | null = null) => {
    setState({ scope, scopeTarget })
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ scope, scopeTarget }))
  }, [storageKey])

  return {
    scope: state?.scope ?? 'everyone',
    scopeTarget: state?.scopeTarget ?? null,
    setScope,
  }
}
