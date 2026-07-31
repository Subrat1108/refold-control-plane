import { LayoutDashboard, Users, Server, Flag, Settings, Layers, ShieldCheck, UsersRound } from 'lucide-react'
import type { UserRole } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  ownerOnly?: boolean // 6.4b: shown only to customer owners, hidden from members
}

// Single source of truth for the role-driven sidebar. The first item of each
// role's list is also that role's home route (see homeRoute).
export const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  super_admin: [
    { to: '/overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { to: '/cloud-customers', label: 'Cloud Customers', icon: <Users size={16} /> },
    { to: '/onprem-customers', label: 'On-Prem Customers', icon: <Server size={16} /> },
    { to: '/feature-flags', label: 'Feature Flags', icon: <Flag size={16} /> },
    { to: '/admin-users', label: 'Super Admins', icon: <ShieldCheck size={16} /> },
    { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
  ],
  cloud_customer_admin: [
    { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { to: '/users', label: 'Users', icon: <UsersRound size={16} />, ownerOnly: true },
    { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
  ],
  // Namespaces is first so homeRoute(onprem) → /namespaces (R1 landing target).
  onprem_customer_admin: [
    { to: '/namespaces', label: 'Namespaces', icon: <Layers size={16} /> },
    { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { to: '/users', label: 'Users', icon: <UsersRound size={16} />, ownerOnly: true },
    { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
  ],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  cloud_customer_admin: 'Cloud Admin',
  onprem_customer_admin: 'On-Prem Admin',
}

export function homeRoute(role: UserRole): string {
  return NAV_BY_ROLE[role][0].to
}
