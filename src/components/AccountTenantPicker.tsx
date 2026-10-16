// One picker for "which account (or tenant) does this belong to?", used
// everywhere an account is chosen.
//
// A flat <select> of names made an account and a tenant indistinguishable —
// and they are not interchangeable: a tenant is a programme or sub-account
// UNDER an account, never an account itself. Here accounts are headings and
// their tenants sit beneath them, so the hierarchy is visible at the moment
// of choosing rather than implied.
//
// It also creates what is missing, which is the gap that made the CFIHOS
// case unanswerable: the right answer existed ("this belongs to Octave")
// but there was nowhere to say it. Creating an account uses the SAME form
// as Portfolio's "Add account" — segment, deployment type and model — so an
// account made here is a real one, not a bare name needing fixing later.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountTree, useSupabaseAuth, useSegments, createTenant } from '@/hooks'
import { createAccount } from '@/hooks/usePortfolio'
import type { DeploymentModel, DeploymentType } from '@/types'

export interface AccountChoice {
  orgId: string
  tenantId: string | null
}

// Only these shapes have sub-orgs worth modelling as tenants. A cloud
// customer is a single org by definition, so offering it a tenant there
// invites a hierarchy that does not exist.
const TENANTED_MODELS: string[] = ['onprem_managed', 'onprem_airgapped', 'dedicated_cluster']

interface Props {
  value: AccountChoice | null
  onChange: (choice: AccountChoice | null) => void
  label?: string
  id?: string
}

export function AccountTenantPicker({ value, onChange, label = 'Account', id = 'account-tenant-picker' }: Props) {
  const { data: tree, refetch } = useAccountTree()
  const { data: segments } = useSegments()
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const [mode, setMode] = useState<'pick' | 'new-account' | 'new-tenant'>('pick')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // new-account form (mirrors Portfolio's Add account)
  const [name, setName] = useState('')
  const [segmentId, setSegmentId] = useState('')
  const [deploymentType, setDeploymentType] = useState<DeploymentType>('cloud')
  const [deploymentModel, setDeploymentModel] = useState<DeploymentModel | ''>('')
  // new-tenant form
  const [parentOrgId, setParentOrgId] = useState('')

  const selected = value ? (tree ?? []).find((a) => a.id === value.orgId) ?? null : null
  const canHaveTenants = (model: string | null) => !!model && TENANTED_MODELS.includes(model)
  const tenantable = (tree ?? []).filter((a) => canHaveTenants(a.deploymentModel))

  // "orgId" picks the account itself; "orgId::tenantId" picks a tenant under
  // it — one control, unambiguous either way.
  const selectValue = value ? (value.tenantId ? `${value.orgId}::${value.tenantId}` : value.orgId) : ''

  function onSelect(raw: string) {
    setError(null)
    if (raw === '__new_account__') { setMode('new-account'); setName(''); setSegmentId(''); setDeploymentType('cloud'); setDeploymentModel(''); return }
    if (raw === '__new_tenant__') { setMode('new-tenant'); setName(''); setParentOrgId(''); return }
    if (!raw) { onChange(null); return }
    const [orgId, tenantId] = raw.split('::')
    onChange({ orgId, tenantId: tenantId ?? null })
  }

  async function create() {
    setBusy(true); setError(null)
    try {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Give it a name')
      if (mode === 'new-account') {
        const orgId = await createAccount({
          name: trimmed,
          segmentId: segmentId || null,
          deploymentType,
          deploymentModel: deploymentModel || null,
        })
        await refetch()
        qc.invalidateQueries({ queryKey: ['accounts'] })
        onChange({ orgId, tenantId: null })
      } else {
        if (!parentOrgId) throw new Error('Choose the account this sits under')
        if (!profile) throw new Error('Not signed in')
        const tenantId = await createTenant(parentOrgId, trimmed, null, profile.id)
        await refetch()
        onChange({ orgId: parentOrgId, tenantId })
      }
      setMode('pick')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create it')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'new-account') {
    return (
      <div className="space-y-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium text-foreground">New account</p>
        <div>
          <label htmlFor={`${id}-name`} className="block text-xs font-medium text-muted-foreground mb-1">Account name</label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Robotics" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor={`${id}-segment`} className="block text-xs font-medium text-muted-foreground mb-1">Segment <span className="font-normal">(optional)</span></label>
          <select id={`${id}-segment`} value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
            <option value="">—</option>
            {(segments ?? []).map((sg) => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${id}-dtype`} className="block text-xs font-medium text-muted-foreground mb-1">Deployment type</label>
            <select id={`${id}-dtype`} value={deploymentType} onChange={(e) => setDeploymentType(e.target.value as DeploymentType)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
              <option value="cloud">Cloud</option>
              <option value="on_premise">On-premise</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-dmodel`} className="block text-xs font-medium text-muted-foreground mb-1">Deployment model</label>
            <select id={`${id}-dmodel`} value={deploymentModel} onChange={(e) => setDeploymentModel(e.target.value as DeploymentModel | '')} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
              <option value="">—</option>
              <option value="cloud">Cloud</option>
              <option value="onprem_managed">On-prem (Refold assisted)</option>
              <option value="onprem_airgapped">On-prem (air-gapped)</option>
              <option value="dedicated_cluster">Dedicated cluster</option>
            </select>
          </div>
        </div>
        {canHaveTenants(deploymentModel || null) && (
          <p className="text-xs text-muted-foreground">You can add tenants under this account once it exists.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={create} disabled={busy || !name.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <button onClick={() => { setMode('pick'); setError(null) }} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">Cancel</button>
        </div>
      </div>
    )
  }

  if (mode === 'new-tenant') {
    return (
      <div className="space-y-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium text-foreground">New tenant</p>
        {tenantable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No account is set up for tenants yet. Only on-premise and dedicated-cluster accounts have them — set an account&apos;s deployment model first.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor={`${id}-parent`} className="block text-xs font-medium text-muted-foreground mb-1">Which account does it sit under?</label>
              <select id={`${id}-parent`} value={parentOrgId} onChange={(e) => setParentOrgId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
                <option value="">Choose…</option>
                {tenantable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-tname`} className="block text-xs font-medium text-muted-foreground mb-1">Tenant name</label>
              <input id={`${id}-tname`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kantata PS" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {tenantable.length > 0 && (
            <button onClick={create} disabled={busy || !name.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create tenant'}
            </button>
          )}
          <button onClick={() => { setMode('pick'); setError(null) }} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <select id={id} value={selectValue} onChange={(e) => onSelect(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
        <option value="">Choose…</option>
        {(tree ?? []).map((a) => (
          a.tenants.length > 0 ? (
            // The account's own option keeps its plain name whether or not it
            // has tenants, so the label never shifts under you; the optgroup
            // heading and the ↳ carry the hierarchy instead.
            <optgroup key={a.id} label={`${a.name} and its tenants`}>
              <option value={a.id}>{a.name}</option>
              {a.tenants.map((t) => <option key={t.id} value={`${a.id}::${t.id}`}>↳ {t.name} (tenant)</option>)}
            </optgroup>
          ) : (
            <option key={a.id} value={a.id}>{a.name}</option>
          )
        ))}
        <option value="__new_account__">+ Create a new account…</option>
        {/* Tenants only exist under on-prem and dedicated-cluster accounts,
            so the option appears only when one of those exists to hang it on. */}
        {tenantable.length > 0 && <option value="__new_tenant__">+ Create a new tenant…</option>}
      </select>
      {selected && canHaveTenants(selected.deploymentModel) && !value?.tenantId && (
        <button onClick={() => { setMode('new-tenant'); setName(''); setParentOrgId(selected.id) }} className="mt-1.5 text-xs font-medium text-primary hover:underline">
          + add a tenant under {selected.name}
        </button>
      )}
    </div>
  )
}
