import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

const ROLES: Array<{ role: UserRole; label: string; description: string }> = [
  { role: 'super_admin', label: 'Super Admin', description: 'God view: all orgs, namespaces, and clusters' },
  { role: 'cloud_customer_admin', label: 'Cloud Admin', description: 'Prism Analytics — cloud customer view' },
  { role: 'onprem_customer_admin', label: 'On-Prem Admin', description: 'Meridian Laboratories — on-prem customer view' },
]

export function LoginPage() {
  const { setRole } = useAuth()
  const navigate = useNavigate()

  function login(role: UserRole) {
    setRole(role)
    if (role === 'cloud_customer_admin') {
      navigate('/dashboard')
    } else if (role === 'onprem_customer_admin') {
      navigate('/settings')
    } else {
      navigate('/overview')
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-[#6366F1] flex items-center justify-center font-bold text-white text-lg">
            R
          </div>
          <span className="font-semibold text-xl text-foreground">Refold Admin</span>
        </div>
        <div className="bg-white rounded-xl shadow-card p-6 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Sign in as</h2>
          {ROLES.map(({ role, label, description }) => (
            <button
              key={role}
              onClick={() => login(role)}
              className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-[#6366F1] hover:bg-[#6366F1]/5 transition-colors group"
            >
              <div className="text-sm font-semibold text-foreground group-hover:text-[#6366F1]">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">Development mode — no credentials required</p>
      </div>
    </div>
  )
}
