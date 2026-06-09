import { useAuth } from '@/hooks/useAuth'

export function SettingsPage() {
  const { user, role } = useAuth()
  return (
    <div className="bg-white rounded-lg shadow-card p-6 max-w-2xl">
      <h2 className="text-base font-semibold mb-4">Account Settings</h2>
      <div className="space-y-0 text-sm">
        <div className="flex justify-between py-3 border-b border-border">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium">{user.name}</span>
        </div>
        <div className="flex justify-between py-3 border-b border-border">
          <span className="text-muted-foreground">Email</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <div className="flex justify-between py-3">
          <span className="text-muted-foreground">Role</span>
          <span className="font-medium capitalize">{role.replace(/_/g, ' ')}</span>
        </div>
      </div>
    </div>
  )
}
