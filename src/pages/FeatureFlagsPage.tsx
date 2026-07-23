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
