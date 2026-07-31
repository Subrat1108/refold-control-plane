import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { StatusBadge } from '@/components/StatusBadge'
import { usePendingInvitations } from '@/hooks'
import { formatDate } from '@/utils/formatDate'
import { provisionOrg } from '@/lib/provisioning'

type Deployment = 'cloud' | 'on_premise'

// Phase 6.4a — super-admin customer provisioning, shared by the cloud + on-prem
// customer list pages. "Add customer" creates the org + invites its owner via the
// Edge Function; the provisioned org lands in Postgres (not the mock list yet —
// 6.5), so the pending invite is surfaced separately below the table (D-042).
export function AddCustomerButton({ deployment }: { deployment: Deployment }) {
  const [open, setOpen] = useState(false)
  const label = deployment === 'cloud' ? 'Add cloud customer' : 'Add on-prem customer'
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
      >
        <Plus size={16} /> {label}
      </button>
      <AddCustomerModal deployment={deployment} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function AddCustomerModal({ deployment, open, onClose }: { deployment: Deployment; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [plan, setPlan] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  function reset() {
    setName(''); setPlan(''); setOwnerEmail(''); setOwnerName(''); setError(''); setSent(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await provisionOrg({
        deploymentType: deployment,
        name: name.trim(),
        plan: plan.trim() || undefined,
        ownerEmail: ownerEmail.trim(),
        ownerName: ownerName.trim() || undefined,
      })
      setSent(ownerEmail.trim())
      qc.invalidateQueries({ queryKey: ['pending-invitations'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provisioning failed')
    } finally {
      setBusy(false)
    }
  }

  const title = deployment === 'cloud' ? 'Add cloud customer' : 'Add on-prem customer'

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title={title}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Organization created. An invite was sent to <span className="font-medium">{sent}</span> — they’ll set a password and become the owner.
          </p>
          <button onClick={() => { reset(); onClose() }} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Organization name</label>
            <input value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="Prism Analytics" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Plan <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={deployment === 'cloud' ? 'growth' : 'self_hosted_enterprise'} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Owner email</label>
            <input type="email" value={ownerEmail} onChange={(e) => { setOwnerEmail(e.target.value); setError('') }} placeholder="owner@company.com" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Owner name <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Marcus Chen" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy || !name || !ownerEmail} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? 'Provisioning…' : 'Create & invite owner'}
          </button>
        </form>
      )}
    </Modal>
  )
}

// Postgres-backed list of not-yet-accepted owner invites for this deployment
// type. Renders nothing while empty so it doesn't clutter the page.
export function PendingInvitesPanel({ deployment }: { deployment: Deployment }) {
  const { data } = usePendingInvitations(deployment)
  if (!data || data.length === 0) return null
  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">Pending owner invites</h2>
      <ul className="divide-y divide-border">
        {data.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div>
              <div className="text-sm font-medium text-foreground">{inv.orgName ?? '—'}</div>
              <div className="text-xs text-muted-foreground">{inv.email}</div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">Invited {formatDate(inv.createdAt)}</span>
              <StatusBadge status={inv.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
