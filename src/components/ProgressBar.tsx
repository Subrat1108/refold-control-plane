import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  color?: string
  showLabel?: boolean
  className?: string
  durationMs?: number
}

export function ProgressBar({ value, max = 100, color, showLabel = false, className, durationMs = 300 }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100)
  const barColor = color ?? (pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#6366F1')
  return (
    <div className={cn('w-full', className)}>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor, transitionDuration: `${durationMs}ms` }} />
      </div>
      {showLabel && <span className="text-xs text-muted-foreground mt-1">{pct.toFixed(0)}%</span>}
    </div>
  )
}
