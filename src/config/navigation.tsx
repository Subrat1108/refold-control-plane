import { LayoutDashboard, Users, Server, Flag, Settings, Layers, ShieldCheck, UsersRound, UserCog, Briefcase, CheckSquare, ScrollText, Home } from 'lucide-react'
import type { UserRole } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  ownerOnly?: boolean // 6.4b: shown only to customer owners, hidden from members
  badgeKey?: 'pending-proposals' // 7.3 — Sidebar renders a live count next to the label
  group?: 'admin' // equal-admins model — collapsed-by-default "Admin" disclosure
}

// Single source of truth for the role-driven sidebar. The first item of each
// role's list is also that role's home route (see homeRoute).
export const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  super_admin: [
    { to: '/home', label: 'Home', icon: <Home size={16} /> },
    { to: '/portfolio', label: 'Portfolio', icon: <Briefcase size={16} /> },
    { to: '/approvals', label: 'Approvals', icon: <CheckSquare size={16} />, badgeKey: 'pending-proposals' },
    { to: '/people', label: 'People', icon: <UserCog size={16} /> },
    { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
    // Admin — collapsed by default (Sidebar renders these inside a disclosure).
    { to: '/audit-log', label: 'Audit Log', icon: <ScrollText size={16} />, group: 'admin' },
    { to: '/admin-users', label: 'Users & Roles', icon: <ShieldCheck size={16} />, group: 'admin' },
    { to: '/feature-flags', label: 'Feature Flags', icon: <Flag size={16} />, group: 'admin' },
    { to: '/overview', label: 'Overview', icon: <LayoutDashboard size={16} />, group: 'admin' },
    { to: '/cloud-customers', label: 'Cloud Customers', icon: <Users size={16} />, group: 'admin' },
    { to: '/onprem-customers', label: 'On-Prem Customers', icon: <Server size={16} />, group: 'admin' },
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
