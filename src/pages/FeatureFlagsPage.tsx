import { useState } from 'react'
import { Flag } from 'lucide-react'
import { FeatureFlagsPanel } from '@/components/FeatureFlagsPanel'

export function FeatureFlagsPage() {
  const [open, setOpen] = useState(true)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Feature Flags</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Global feature flags across all customers</p>
      </div>

      {/* Stage 2d — said plainly rather than left to be discovered. There is
          no `feature_flags` table: this screen reads and writes in-memory
          fixtures, so a toggle here changes nothing in any customer's
          deployment. Implying control that does not exist is worse than
          showing none, and worse than a fake metric, because someone may act
          on it. */}
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-900">These flags are not connected to anything yet</p>
        <p className="text-xs text-amber-800 mt-0.5">
          There is no feature-flag storage behind this screen — toggles are kept in memory for the session and change nothing in any customer&apos;s
          deployment. Treat it as a design preview until the flag service is built.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-card p-6 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">Global flag configuration</div>
          <p className="text-sm text-muted-foreground mt-0.5">Manage flags that apply across every deployment.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Flag className="w-4 h-4" /> Manage feature flags
        </button>
      </div>

      <FeatureFlagsPanel open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
