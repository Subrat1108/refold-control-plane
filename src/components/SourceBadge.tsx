// Phase 7.2b — shows where a CS record came from and how stale it is. Used on
// every row across Account 360 (product-overview § 5.3: "Every row shows a
// source badge and 'verified x days ago'.").
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import type { RecordSource } from '@/types'

const SOURCE_STYLES: Record<RecordSource, string> = {
  manual: 'bg-gray-100 text-gray-700',
  agent: 'bg-indigo-100 text-indigo-800',
  chat: 'bg-indigo-100 text-indigo-800',
  api: 'bg-blue-100 text-blue-800',
  file: 'bg-blue-100 text-blue-800',
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export function SourceBadge({ source, verifiedAt }: { source: RecordSource; verifiedAt: string | null }) {
  const verifiedLabel = verifiedAt ? `verified ${daysAgo(verifiedAt)}d ago` : 'never verified'
  return (
    <span className="inline-flex items-center gap-1.5">
      <Tooltip content={`Source: ${source}`}>
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize', SOURCE_STYLES[source])}>{source}</span>
      </Tooltip>
      <span className={cn('text-xs', verifiedAt ? 'text-muted-foreground' : 'text-amber-700')}>{verifiedLabel}</span>
    </span>
  )
}
