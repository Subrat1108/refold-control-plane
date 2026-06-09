import { cn } from '@/lib/utils'

interface SkeletonLoaderProps {
  rows?: number
  className?: string
}

export function SkeletonLoader({ rows = 3, className }: SkeletonLoaderProps) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-card p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-24 mb-4" />
      <div className="h-7 bg-gray-200 rounded w-32 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-16" />
    </div>
  )
}
