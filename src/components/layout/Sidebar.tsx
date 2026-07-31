import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSupabaseAuth } from '@/lib/auth/AuthProvider'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { NAV_BY_ROLE, ROLE_LABELS } from '@/config/navigation'
import { Tooltip } from '@/components/Tooltip'

export function Sidebar() {
  const { user, role } = useAuth()
  const { signOut, profile } = useSupabaseAuth()
  const navigate = useNavigate()
  const collapsed = useMediaQuery('(max-width: 1200px)')
  // Owner-only items (6.4b user management) are hidden from members.
  const isOwner = profile?.role === 'owner'
  const navItems = NAV_BY_ROLE[role].filter((item) => !item.ownerOnly || isOwner)

  async function handleSignOut() {
    await signOut()
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
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold text-base tracking-tight leading-none">Refold</div>
            <div className="text-[11px] text-white/50 leading-none mt-0.5">Control Plane</div>
          </div>
        )}
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

      {/* User profile */}
      <div className={cn('flex-shrink-0 border-t border-white/10 pt-3 pb-4', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#6366F1]/30 flex items-center justify-center text-xs font-semibold text-[#a5b4fc] flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.name}</div>
              <div className="text-xs text-white/50 truncate">{ROLE_LABELS[role]}</div>
            </div>
          </div>
        )}

        {/* Sign out */}
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
