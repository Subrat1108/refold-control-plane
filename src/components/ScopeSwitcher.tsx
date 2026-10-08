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
import { useSuperAdmins, useTeams } from '@/hooks'
import type { SavedViewScope } from '@/types'

const BASE_LABELS: Record<'mine' | 'team' | 'everyone', string> = {
  mine: 'Mine',
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
  const { data: people } = useSuperAdmins()
  const { data: teams } = useTeams()

  const label = (() => {
    if (scope === 'person') {
      const person = people?.find((p) => p.id === scopeTarget)
      return person ? `Person: ${person.fullName ?? person.email}` : 'A specific person'
    }
    if (scope === 'team_id') {
      const team = teams?.find((t) => t.id === scopeTarget)
      return team ? `Team: ${team.name}` : 'A specific team'
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
        <DropdownMenuItem onClick={() => onChange('mine')}>Mine</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange('team')}>My team</DropdownMenuItem>
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>A specific team…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {!teams || teams.length === 0 ? (
              <DropdownMenuLabel className="text-muted-foreground font-normal">No teams yet</DropdownMenuLabel>
            ) : (
              teams.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => onChange('team_id', t.id)}>
                  {t.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
