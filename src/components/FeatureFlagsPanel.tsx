import { useEffect, useState } from 'react'
import { useFeatureFlags } from '@/hooks'
import { SlideOver } from '@/components/SlideOver'
import { Toggle } from '@/components/Toggle'
import { ErrorState } from '@/components/ErrorState'
import { cn } from '@/lib/utils'
import type { FlagScope } from '@/types'

interface FeatureFlagsPanelProps {
  open: boolean
  onClose: () => void
  // R2b (D-053): the panel is opened at one of four scopes; entityId/name is the
  // cluster / namespace / org it was opened for (omitted for the global page).
  scope?: FlagScope
  entityId?: string
  entityName?: string
}

// Single reusable feature-flags slide-over, triggered from org detail pages, the
// customer-list flag icons, the global /feature-flags page, and (R2b) the cluster
// group + namespace detail headers.
export function FeatureFlagsPanel({ open, onClose, scope = 'global', entityId, entityName }: FeatureFlagsPanelProps) {
  const title = scope === 'global' ? 'Global Feature Flags' : `Feature Flags — ${entityName ?? 'Entity'}`

  return (
    <SlideOver open={open} onClose={onClose} title={title}>
      {/* Body remounts each open (Radix unmounts closed content), so state and
          the fetch baseline reset to a fresh copy every time. */}
      {open && <PanelBody scope={scope} entityId={entityId} />}
    </SlideOver>
  )
}

function PanelBody({ scope, entityId }: { scope: FlagScope; entityId?: string }) {
  const { data, isLoading, isError, refetch } = useFeatureFlags(scope, entityId)

  // Baseline (as-fetched) vs draft (edited) enabled state, seeded once.
  const [original, setOriginal] = useState<Record<string, boolean> | null>(null)
  const [draft, setDraft] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (data && original === null) {
      const map = Object.fromEntries(data.map((f) => [f.id, f.enabled]))
      setOriginal(map)
      setDraft(map)
    }
  }, [data, original])

  if (isLoading || original === null) return <PanelSkeleton />
  if (isError || !data) return <ErrorState message="Failed to load feature flags" onRetry={refetch} />

  const changedIds = data.filter((f) => draft[f.id] !== original[f.id]).map((f) => f.id)
  const hasChanges = changedIds.length > 0

  function handleSave() {
    const changes = data!
      .filter((f) => changedIds.includes(f.id))
      .map((f) => ({ id: f.id, label: f.label, scope: f.scope, from: original![f.id], to: draft[f.id], entity: entityId ?? scope }))
    // No API call yet (per spec); log the diff and reset the baseline.
    console.log('[FeatureFlags] Saved changes:', changes)
    setOriginal({ ...draft })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 divide-y divide-border">
        {data.map((flag) => {
          const changed = draft[flag.id] !== original[flag.id]
          return (
            <div
              key={flag.id}
              className={cn('flex items-start justify-between gap-4 px-3 py-4 -mx-3 transition-colors', changed && 'bg-amber-50')}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{flag.label}</span>
                  <ScopeBadge scope={flag.scope} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
              </div>
              <Toggle
                id={`flag-${flag.id}`}
                checked={draft[flag.id]}
                onCheckedChange={(v) => setDraft((prev) => ({ ...prev, [flag.id]: v }))}
              />
            </div>
          )
        })}
      </div>

      <div className="sticky bottom-0 bg-white border-t border-border pt-4 mt-2">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save changes{hasChanges ? ` (${changedIds.length})` : ''}
        </button>
      </div>
    </div>
  )
}

const SCOPE_LABELS: Record<FlagScope, string> = {
  global: 'Global',
  cluster: 'Cluster',
  namespace: 'Namespace',
  org: 'Org',
}

const SCOPE_STYLES: Record<FlagScope, string> = {
  global: 'bg-indigo-50 text-indigo-700',
  cluster: 'bg-emerald-100 text-emerald-800',
  namespace: 'bg-amber-100 text-amber-800',
  org: 'bg-slate-100 text-slate-700',
}

function ScopeBadge({ scope }: { scope: FlagScope }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', SCOPE_STYLES[scope])}>
      {SCOPE_LABELS[scope]}
    </span>
  )
}

function PanelSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-5 w-9 bg-gray-200 rounded-full animate-pulse" />
        </div>
      ))}
    </div>
  )
}
