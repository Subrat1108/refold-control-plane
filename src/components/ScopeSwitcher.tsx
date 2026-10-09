import { ChevronDown, User, Users } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSuperAdmins, useHasReports } from '@/hooks'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import type { SavedViewScope } from '@/types'

const BASE_LABELS: Record<'mine' | 'team' | 'everyone', string> = {
  mine: 'My accounts',
  team: 'My team',
  everyone: 'Everyone',
}

interface ScopeSwitcherProps {
  scope: SavedViewScope
  scopeTarget: string | null
  onChange: (scope: SavedViewScope, scopeTarget?: string | null) => void
}

// Focus only — never access control (product-overview.md § 12): this just
// narrows what a list SHOWS, every super admin can already see everything.
export function ScopeSwitcher({ scope, scopeTarget, onChange }: ScopeSwitcherProps) {
  const { profile } = useSupabaseAuth()
  const { data: people } = useSuperAdmins()
  const { data: hasReports } = useHasReports(profile?.id ?? null)

  const label = (() => {
    if (scope === 'person') {
      const person = people?.find((p) => p.id === scopeTarget)
      return person ? `Person: ${person.fullName ?? person.email}` : 'A specific person'
    }
    return BASE_LABELS[scope as 'mine' | 'team' | 'everyone'] ?? 'Everyone'
  })()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
          {scope === 'person' ? <User className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          {label}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => onChange('mine')}>My accounts</DropdownMenuItem>
        {hasReports && <DropdownMenuItem onClick={() => onChange('team')}>My team</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => onChange('everyone')}>Everyone</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>A specific person…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {!people || people.length === 0 ? (
              <DropdownMenuLabel className="text-muted-foreground font-normal">No people yet</DropdownMenuLabel>
            ) : (
              people.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => onChange('person', p.id)}>
                  {p.fullName ?? p.email}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
