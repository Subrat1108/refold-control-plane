// Phase 7.2a — persists the current scope selection per (page, person) in
// localStorage; saved views themselves live in Postgres (useSavedViews).
//
// Default resolution order (D-074): my saved default view for this page →
// my title's default (FDE → Mine, EDL/TA → My team, Head of CS → Everyone) →
// Everyone when title is null (so an untitled super admin never opens to an
// empty screen). Once the person explicitly picks a scope, that choice is
// remembered per-page and wins over the default on their next visit.
import { useCallback, useEffect, useState } from 'react'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import { useSavedViews } from './useTeamStructure'
import type { ProfileTitle, SavedViewScope } from '@/types'

interface ScopeState {
  scope: SavedViewScope
  scopeTarget: string | null
}

function titleDefault(title: ProfileTitle | null): SavedViewScope {
  if (title === 'fde') return 'mine'
  if (title === 'edl' || title === 'ta') return 'team'
  return 'everyone' // head_of_cs, or no title set
}

export function useScope(page: string) {
  const { profile } = useSupabaseAuth()
  const { data: savedViews } = useSavedViews(page)
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
    if (savedViews === undefined) return // wait for the saved-views query to settle
    const defaultView = savedViews.find((v) => v.isDefault)
    if (defaultView) {
      setState({ scope: defaultView.scope, scopeTarget: defaultView.scopeTarget })
      return
    }
    setState({ scope: titleDefault(profile.title), scopeTarget: null })
  }, [profile, savedViews, state, storageKey])

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
