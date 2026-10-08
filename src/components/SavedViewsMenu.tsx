import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bookmark, ChevronDown, Pin, Star, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Modal } from '@/components/Modal'
import { Tooltip } from '@/components/Tooltip'
import { useSavedViews, useSupabaseAuth } from '@/hooks'
import { saveView, setSavedViewDefault, setSavedViewPinned, deleteSavedView } from '@/hooks'
import type { SavedView, SavedViewScope } from '@/types'

interface SavedViewsMenuProps {
  page: string
  currentScope: SavedViewScope
  currentScopeTarget: string | null
  currentFilters: Record<string, unknown>
  onApply: (view: SavedView) => void
}

// Saved views pair with ScopeSwitcher as the 7.2a "proof" wiring — any
// scope + filter combination can be named, pinned, set as default, and
// reapplied later. Private per person (RLS), so no owner filter is needed
// client-side.
export function SavedViewsMenu({ page, currentScope, currentScopeTarget, currentFilters, onApply }: SavedViewsMenuProps) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: views } = useSavedViews(page)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: ['saved-views', page] })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !name.trim()) return
    setBusy(true)
    setError('')
    try {
      await saveView({
        ownerProfileId: profile.id,
        name: name.trim(),
        page,
        scope: currentScope,
        scopeTarget: currentScopeTarget,
        filters: currentFilters,
      })
      await refresh()
      setSaveOpen(false)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save view')
    } finally {
      setBusy(false)
    }
  }

  async function handleSetDefault(v: SavedView, e: React.MouseEvent) {
    e.stopPropagation()
    if (!profile) return
    await setSavedViewDefault(v.id, page, profile.id)
    await refresh()
  }

  async function handleTogglePin(v: SavedView, e: React.MouseEvent) {
    e.stopPropagation()
    await setSavedViewPinned(v.id, !v.pinned)
    await refresh()
  }

  async function handleDelete(v: SavedView, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteSavedView(v.id)
    await refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
            <Bookmark className="w-4 h-4" />
            Views
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {!views || views.length === 0 ? (
            <DropdownMenuLabel className="text-muted-foreground font-normal">No saved views yet</DropdownMenuLabel>
          ) : (
            views.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onApply(v)} className="flex items-center justify-between gap-2">
                <span className="truncate">{v.name}{v.isDefault ? ' (default)' : ''}</span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <Tooltip content={v.isDefault ? 'Default view' : 'Set as default'}>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleSetDefault(v, e)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Star className={v.isDefault ? 'w-3.5 h-3.5 fill-current text-primary' : 'w-3.5 h-3.5'} />
                    </span>
                  </Tooltip>
                  <Tooltip content={v.pinned ? 'Unpin' : 'Pin'}>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleTogglePin(v, e)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pin className={v.pinned ? 'w-3.5 h-3.5 fill-current text-primary' : 'w-3.5 h-3.5'} />
                    </span>
                  </Tooltip>
                  <Tooltip content="Delete">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDelete(v, e)}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </span>
                  </Tooltip>
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>Save current view…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal open={saveOpen} onClose={() => { setSaveOpen(false); setName(''); setError('') }} title="Save current view">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="e.g. My at-risk accounts"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Save view'}
          </button>
        </form>
      </Modal>
    </>
  )
}
