import { NavLink, useNavigate } from 'react-router-dom'
import { ChevronDown, UserCog, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthGate } from '@/hooks/useAuthGate'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { UserRole } from '@/types'
import { cn } from '@/lib/utils'
import { NAV_BY_ROLE, ROLE_LABELS, homeRoute } from '@/config/navigation'
import { Tooltip } from '@/components/Tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Sidebar() {
  const { user, role, setRole } = useAuth()
  const { signOut } = useAuthGate()
  const navigate = useNavigate()
  const collapsed = useMediaQuery('(max-width: 1200px)')
  const navItems = NAV_BY_ROLE[role]

  function handleRoleSwitch(newRole: UserRole) {
    setRole(newRole)
    navigate(homeRoute(newRole))
  }

  function handleSignOut() {
    signOut()
    navigate('/login', { replace: true })
  }

  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-screen flex flex-col bg-[#0F1117] text-white z-10 transition-[width]',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 border-b border-white/10 flex-shrink-0', collapsed ? 'justify-center px-0' : 'gap-2.5 px-5')}>
        <div className="w-7 h-7 rounded-md bg-[#6366F1] flex items-center justify-center font-bold text-sm flex-shrink-0">R</div>
        {!collapsed && <span className="font-semibold text-base tracking-tight">Refold</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-md text-sm font-medium transition-colors',
                  collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 py-2.5',
                  isActive ? 'bg-[#6366F1] text-white' : 'text-white/70 hover:text-white hover:bg-white/8'
                )
              }
            >
              {item.icon}
              {!collapsed && item.label}
            </NavLink>
          )
          return collapsed ? (
            <Tooltip key={item.to} content={item.label}>{link}</Tooltip>
          ) : (
            link
          )
        })}
      </nav>

      {/* User profile + role switcher */}
      <div className={cn('flex-shrink-0 border-t border-white/10 pt-3 pb-4', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#6366F1]/30 flex items-center justify-center text-xs font-semibold text-[#a5b4fc] flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.name}</div>
              <div className="text-xs text-white/50 truncate">{user.email}</div>
            </div>
          </div>
        )}

        {/* Dev role switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <Tooltip content={`Role: ${ROLE_LABELS[role]}`}>
                <button className="flex items-center justify-center h-10 w-10 mx-auto rounded-md text-white/60 hover:text-white hover:bg-white/8 transition-colors" aria-label="Switch role">
                  <UserCog size={18} />
                </button>
              </Tooltip>
            ) : (
              <button className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors">
                <span>{ROLE_LABELS[role]}</span>
                <ChevronDown size={12} />
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <DropdownMenuItem key={r} onClick={() => handleRoleSwitch(r)} className={cn('text-sm', r === role && 'font-semibold')}>
                {ROLE_LABELS[r]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sign out (placeholder auth, § 11.4) */}
        {collapsed ? (
          <Tooltip content="Sign out">
            <button onClick={handleSignOut} className="flex items-center justify-center h-10 w-10 mx-auto mt-1 rounded-md text-white/60 hover:text-white hover:bg-white/8 transition-colors" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </Tooltip>
        ) : (
          <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-md text-xs font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors">
            <LogOut size={14} /> Sign out
          </button>
        )}
      </div>
    </aside>
  )
}
