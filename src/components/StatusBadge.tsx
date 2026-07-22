import { cn } from '@/lib/utils'

type AnyStatus = string

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  healthy: 'bg-green-100 text-green-800',
  running: 'bg-green-100 text-green-800',
  success: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  suspended: 'bg-amber-100 text-amber-800',
  degraded: 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
  paused: 'bg-gray-100 text-gray-700',
  churned: 'bg-red-100 text-red-800',
  down: 'bg-red-100 text-red-800',
  failed: 'bg-red-100 text-red-800',
}

interface StatusBadgeProps {
  status: AnyStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800'
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', style, className)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
