import { useEffect, useState } from 'react'
import { useFeatureFlags } from '@/hooks'
import { Toggle } from '@/components/Toggle'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

// God View (5.3) global feature-flag overview. Reuses the same global flag list
// and Toggle primitive as the 5.9 panel, and the same Save semantics as D-017
// (console-log only, no persistence) so the two flag surfaces don't diverge.
export function FeatureFlagOverviewCard() {
  const { data, isLoading, isError, refetch } = useFeatureFlags()

  const [original, setOriginal] = useState<Record<string, boolean> | null>(null)
  const [draft, setDraft] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (data && original === null) {
      const map = Object.fromEntries(data.map((f) => [f.id, f.enabled]))
      setOriginal(map)
      setDraft(map)
    }
  }, [data, original])

  return (
    <div className="bg-white rounded-lg shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Feature Flag Overview</h3>
        <span className="text-xs text-muted-foreground">Global</span>
      </div>

      {isLoading || original === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="h-5 w-9 bg-gray-200 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <ErrorState message="Failed to load feature flags" onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No feature flags" description="No global feature flags are configured." />
      ) : (
        <FlagList data={data} original={original} draft={draft} setDraft={setDraft} setOriginal={setOriginal} />
      )}
    </div>
  )
}

function FlagList({
  data,
  original,
  draft,
  setDraft,
  setOriginal,
}: {
  data: { id: string; label: string; description: string }[]
  original: Record<string, boolean>
  draft: Record<string, boolean>
  setDraft: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  setOriginal: (map: Record<string, boolean>) => void
}) {
  const changedIds = data.filter((f) => draft[f.id] !== original[f.id]).map((f) => f.id)
  const hasChanges = changedIds.length > 0

  function handleSave() {
    const changes = data
      .filter((f) => changedIds.includes(f.id))
      .map((f) => ({ id: f.id, label: f.label, from: original[f.id], to: draft[f.id], scope: 'global' }))
    // No API call yet (D-017); log the diff and reset the baseline.
    console.log('[FeatureFlags] Saved changes:', changes)
    setOriginal({ ...draft })
  }

  return (
    <>
      <div className="divide-y divide-border">
        {data.map((flag) => {
          const changed = draft[flag.id] !== original[flag.id]
          return (
            <div key={flag.id} className={cn('flex items-start justify-between gap-4 px-3 py-3 -mx-3 transition-colors', changed && 'bg-amber-50')}>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{flag.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
              </div>
              <Toggle id={`ov-flag-${flag.id}`} checked={draft[flag.id]} onCheckedChange={(v) => setDraft((prev) => ({ ...prev, [flag.id]: v }))} />
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save changes{hasChanges ? ` (${changedIds.length})` : ''}
        </button>
      </div>
    </>
  )
}
