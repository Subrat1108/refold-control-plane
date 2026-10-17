// Editing a tenant, from wherever you are looking at one.
//
// Shared by the account's Tenants tab and the tenant's own page — the tenant
// page previously could not edit anything at all, which meant opening a
// tenant was a dead end.
//
// Re-parenting is the non-obvious part: twelve tables carry tenant_id beside
// org_id, so move_tenant() shifts the tenant AND its records together.
// Changing only the parent would leave records filed under an account the
// tenant no longer belongs to.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountTree, updateTenant, moveTenant } from '@/hooks'
import { Modal } from '@/components/Modal'
import type { Tenant } from '@/types'

// A tenant's details AND its parent account. Moving it is the interesting
// case: twelve tables carry tenant_id beside org_id, so move_tenant() shifts
// the tenant and every record of it together — otherwise those records would
// quietly sit under an account the tenant no longer belongs to.
export function EditTenantPanel({ tenant, open, onClose }: { tenant: Tenant | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: tree } = useAccountTree()
  const [name, setName] = useState('')
  const [clusterName, setClusterName] = useState('')
  const [namespaceName, setNamespaceName] = useState('')
  const [refoldOrgId, setRefoldOrgId] = useState('')
  const [linkedAccountId, setLinkedAccountId] = useState('')
  const [parentOrgId, setParentOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moved, setMoved] = useState<number | null>(null)

  useEffect(() => {
    if (!tenant) return
    setName(tenant.name)
    setClusterName(tenant.clusterName ?? '')
    setNamespaceName(tenant.namespaceName ?? '')
    setRefoldOrgId(tenant.refoldOrgId ?? '')
    setLinkedAccountId(tenant.linkedAccountId ?? '')
    setParentOrgId(tenant.orgId)
    setError(null); setMoved(null)
  }, [tenant])

  if (!tenant || !open) return null

  async function save() {
    if (!tenant) return
    setBusy(true); setError(null)
    try {
      if (!name.trim()) throw new Error('A tenant needs a name')
      await updateTenant(tenant.id, {
        name: name.trim(),
        clusterName: clusterName.trim() || null,
        namespaceName: namespaceName.trim() || null,
        refoldOrgId: refoldOrgId.trim() || null,
        linkedAccountId: linkedAccountId.trim() || null,
      })
      if (parentOrgId && parentOrgId !== tenant.orgId) {
        const n = await moveTenant(tenant.id, parentOrgId)
        setMoved(n)
      }
      qc.invalidateQueries({ queryKey: ['tenants'] })
      qc.invalidateQueries({ queryKey: ['account-tree'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const movingAway = parentOrgId && parentOrgId !== tenant.orgId

  return (
    <Modal open={!!tenant} onClose={onClose} title="Edit tenant">
      <div className="space-y-4">
        <div>
          <label htmlFor="edit-ten-name" className="block text-xs font-medium text-muted-foreground mb-1">Tenant name <span className="font-normal">(the signup / Refold org)</span></label>
          <input id="edit-ten-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="edit-ten-parent" className="block text-xs font-medium text-muted-foreground mb-1">Belongs to account</label>
          <select id="edit-ten-parent" value={parentOrgId} onChange={(e) => setParentOrgId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
            {(tree ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {movingAway && (
            <p className="text-xs text-amber-700 mt-1">
              Every record of this tenant moves with it, so nothing ends up filed under the account it is leaving.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-ten-cluster" className="block text-xs font-medium text-muted-foreground mb-1">Cluster</label>
            <input id="edit-ten-cluster" value={clusterName} onChange={(e) => setClusterName(e.target.value)} placeholder="on-prem only" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="edit-ten-namespace" className="block text-xs font-medium text-muted-foreground mb-1">Namespace</label>
            <input id="edit-ten-namespace" value={namespaceName} onChange={(e) => setNamespaceName(e.target.value)} placeholder="on-prem only" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="edit-ten-org" className="block text-xs font-medium text-muted-foreground mb-1">Refold org id</label>
            <input id="edit-ten-org" value={refoldOrgId} onChange={(e) => setRefoldOrgId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="edit-ten-linked" className="block text-xs font-medium text-muted-foreground mb-1">Linked account id</label>
            <input id="edit-ten-linked" value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {moved !== null && <p className="text-sm text-muted-foreground">{moved} record(s) moved with it.</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
