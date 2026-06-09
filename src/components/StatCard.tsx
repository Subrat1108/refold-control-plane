import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  icon?: ReactNode
  className?: string
}

export function StatCard({ label, value, subtext, icon, className }: StatCardProps) {
  return (
    <div className={cn('bg-white rounded-lg shadow-card p-6', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </div>
  )
}
