import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Server, Flag, Settings, ChevronDown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  super_admin: [
    { to: '/overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { to: '/cloud-customers', label: 'Cloud Customers', icon: <Users size={16} /> },
    { to: '/onprem-customers', label: 'On-Prem Customers', icon: <Server size={16} /> },
    { to: '/feature-flags', label: 'Feature Flags', icon: <Flag size={16} /> },
    { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
  ],
  cloud_customer_admin: [
    { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
  ],
  onprem_customer_admin: [
    { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
  ],
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  cloud_customer_admin: 'Cloud Admin',
  onprem_customer_admin: 'On-Prem Admin',
}

export function Sidebar() {
  const { user, role, setRole } = useAuth()
  const navigate = useNavigate()
  const navItems = NAV_BY_ROLE[role]

  function handleRoleSwitch(newRole: UserRole) {
    setRole(newRole)
    const firstRoute = NAV_BY_ROLE[newRole][0].to
    navigate(firstRoute)
  }

  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 flex flex-col bg-[#0F1117] text-white z-10">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 flex-shrink-0">
        <div className="w-7 h-7 rounded-md bg-[#6366F1] flex items-center justify-center font-bold text-sm">
          R
        </div>
        <span className="font-semibold text-base tracking-tight">Refold</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#6366F1] text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/8'
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User profile + role switcher */}
      <div className="px-3 pb-4 flex-shrink-0 border-t border-white/10 pt-3">
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-[#6366F1]/30 flex items-center justify-center text-xs font-semibold text-[#a5b4fc] flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{user.name}</div>
            <div className="text-xs text-white/50 truncate">{user.email}</div>
          </div>
        </div>

        {/* Dev role switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors">
              <span>{ROLE_LABELS[role]}</span>
              <ChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <DropdownMenuItem
                key={r}
                onClick={() => handleRoleSwitch(r)}
                className={cn('text-sm', r === role && 'font-semibold')}
              >
                {ROLE_LABELS[r]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
