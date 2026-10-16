// One picker for "which account (or tenant) does this belong to?", used
// everywhere an account is chosen.
//
// A flat <select> of names made an account and a tenant indistinguishable —
// and the two are not interchangeable: a tenant is a programme or
// sub-account UNDER an account, never an account itself. Here accounts are
// headings and their tenants are indented beneath them, so the hierarchy is
// visible at the moment of choosing rather than implied.
//
// It can also create what is missing, which is the gap that made the CFIHOS
// case unanswerable: the right answer existed ("this belongs to Octave") but
// there was nowhere to say it.
import { useState } from 'react'
import { useAccountTree, useSupabaseAuth, createTenant } from '@/hooks'
import { createAccount } from '@/hooks/usePortfolio'

export interface AccountChoice {
  orgId: string
  tenantId: string | null
}

interface Props {
  value: AccountChoice | null
  onChange: (choice: AccountChoice | null) => void
  /** Hide the create affordances where a new entity makes no sense. */
  allowCreate?: boolean
  label?: string
  id?: string
}

export function AccountTenantPicker({ value, onChange, allowCreate = true, label = 'Account', id = 'account-tenant-picker' }: Props) {
  const { data: tree, refetch } = useAccountTree()
  const { profile } = useSupabaseAuth()
  const [mode, setMode] = useState<'pick' | 'new-account' | 'new-tenant'>('pick')
  const [newName, setNewName] = useState('')
  const [parentOrgId, setParentOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "orgId" picks the account itself; "orgId::tenantId" picks a tenant under
  // it — one control, unambiguous either way.
  const selectValue = value ? (value.tenantId ? `${value.orgId}::${value.tenantId}` : value.orgId) : ''

  function onSelect(raw: string) {
    setError(null)
    if (raw === '__new_account__') { setMode('new-account'); setNewName(''); return }
    if (raw === '__new_tenant__') { setMode('new-tenant'); setNewName(''); setParentOrgId(''); return }
    if (!raw) { onChange(null); return }
    const [orgId, tenantId] = raw.split('::')
    onChange({ orgId, tenantId: tenantId ?? null })
  }

  async function create() {
    setBusy(true); setError(null)
    try {
      const name = newName.trim()
      if (!name) throw new Error('Give it a name')
      if (mode === 'new-account') {
        const orgId = await createAccount({ name, segmentId: null, deploymentModel: null, deploymentType: 'cloud' })
        await refetch()
        onChange({ orgId, tenantId: null })
      } else {
        if (!parentOrgId) throw new Error('Choose the account this sits under')
        if (!profile) throw new Error('Not signed in')
        const tenantId = await createTenant(parentOrgId, name, null, profile.id)
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

  if (mode !== 'pick') {
    return (
      <div className="space-y-2">
        <label htmlFor={`${id}-name`} className="block text-xs font-medium text-muted-foreground">
          {mode === 'new-account' ? 'New account name' : 'New tenant name'}
        </label>
        {mode === 'new-tenant' && (
          <select
            aria-label="Parent account"
            value={parentOrgId}
            onChange={(e) => setParentOrgId(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white"
          >
            <option value="">Which account does it sit under?</option>
            {(tree ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <input
          id={`${id}-name`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={mode === 'new-account' ? 'Octave' : 'CFIHOS'}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={create} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? 'Creating…' : mode === 'new-account' ? 'Create account' : 'Create tenant'}
          </button>
          <button onClick={() => { setMode('pick'); setError(null) }} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Cancel
          </button>
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
          // optgroup, not a flat list: the account is the heading and its
          // tenants belong to it visually as well as logically.
          a.tenants.length > 0 ? (
            // The account's own option keeps its plain name whether or not
            // it has tenants, so the label never shifts under you; the
            // optgroup heading and the ↳ carry the hierarchy instead.
            <optgroup key={a.id} label={`${a.name} and its tenants`}>
              <option value={a.id}>{a.name}</option>
              {a.tenants.map((t) => <option key={t.id} value={`${a.id}::${t.id}`}>↳ {t.name} (tenant)</option>)}
            </optgroup>
          ) : (
            <option key={a.id} value={a.id}>{a.name}</option>
          )
        ))}
        {allowCreate && <option value="__new_account__">+ Create a new account…</option>}
        {allowCreate && <option value="__new_tenant__">+ Create a new tenant…</option>}
      </select>
    </div>
  )
}
