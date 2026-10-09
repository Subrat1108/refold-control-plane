import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, Ban, Copy, Check } from 'lucide-react'
import { useIngestTokens, ingestTokenStatus, useAccountsRaw } from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { Modal } from '@/components/Modal'
import { Tooltip } from '@/components/Tooltip'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { formatDate } from '@/utils/formatDate'
import { createIngestToken, revokeIngestToken } from '@/lib/provisioning'
import type { IngestToken } from '@/hooks/useIngestTokens'

const MAX_TTL_DAYS = 365
const DEFAULT_TTL_DAYS = 90

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// 7.4 — minimal UI to mint/revoke ingest tokens for the CS Sync Skill (7.5).
// The table grants authenticated no insert/update at all; every write here
// goes through the provisioning Edge Function (super_admin + AAL2 gated).
export function IngestTokensPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useIngestTokens()
  const { data: accounts } = useAccountsRaw()
  const [createOpen, setCreateOpen] = useState(false)
  const [revealToken, setRevealToken] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['ingest-tokens'] })

  async function revoke(token: IngestToken) {
    if (!confirm(`Revoke "${token.label}"? Any sync using this token will immediately start failing.`)) return
    setBusyId(token.id)
    try {
      await revokeIngestToken(token.id)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Revoke failed')
    } finally {
      setBusyId(null)
    }
  }

  const accountNameById = new Map((accounts ?? []).map((a) => [a.id, a.name]))

  const columns: Column<IngestToken>[] = [
    { key: 'label', header: 'Label', render: (t) => <span className="font-medium text-foreground">{t.label}</span> },
    { key: 'created', header: 'Created', render: (t) => <span className="text-muted-foreground">{formatDate(t.createdAt)}</span> },
    { key: 'expires', header: 'Expires', render: (t) => <span className="text-muted-foreground">{formatDate(t.expiresAt)}</span> },
    { key: 'lastUsed', header: 'Last used', render: (t) => <span className="text-muted-foreground">{t.lastUsedAt ? formatDate(t.lastUsedAt) : 'Never'}</span> },
    {
      key: 'scope',
      header: 'Scope',
      render: (t) =>
        t.allowedOrgIds === null ? (
          <span className="text-muted-foreground">All accounts</span>
        ) : (
          <Tooltip content={t.allowedOrgIds.map((id) => accountNameById.get(id) ?? id).join(', ') || 'none'}>
            <span className="text-muted-foreground">{t.allowedOrgIds.length} account{t.allowedOrgIds.length === 1 ? '' : 's'}</span>
          </Tooltip>
        ),
    },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={ingestTokenStatus(t)} /> },
    {
      key: 'actions',
      header: '',
      width: '64px',
      render: (t) =>
        ingestTokenStatus(t) === 'revoked' ? null : (
          <div className="flex items-center justify-end">
            <Tooltip content="Revoke token">
              <button
                onClick={() => revoke(t)}
                disabled={busyId === t.id}
                aria-label="Revoke token"
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-600 disabled:opacity-40"
              >
                <Ban size={16} />
              </button>
            </Tooltip>
          </div>
        ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Ingest tokens</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Credentials for the CS Sync Skill (and other automated callers) to post proposals via the Ingest API.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <KeyRound size={16} /> Create token
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? (
          <CardSkeleton />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
            rowKey={(t) => t.id}
            emptyTitle="No ingest tokens"
            emptyDescription="Create one to let an automated sync post proposals into the Hub."
          />
        )}
      </div>

      <CreateTokenModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(token) => { refresh(); setRevealToken(token) }}
      />
      <RevealTokenModal token={revealToken} onClose={() => setRevealToken(null)} />
    </div>
  )
}

function CreateTokenModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (token: string) => void }) {
  const { data: accounts } = useAccountsRaw()
  const [label, setLabel] = useState('')
  const [expiresAt, setExpiresAt] = useState(daysFromNow(DEFAULT_TTL_DAYS))
  const [scopedIds, setScopedIds] = useState<string[]>([])
  const [unrestricted, setUnrestricted] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setLabel(''); setExpiresAt(daysFromNow(DEFAULT_TTL_DAYS)); setScopedIds([]); setUnrestricted(true); setError('')
  }

  function toggleAccount(id: string) {
    setScopedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { token } = await createIngestToken(label.trim(), new Date(expiresAt).toISOString(), unrestricted ? null : scopedIds)
      reset()
      onCreated(token)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Create ingest token">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="CS Sync Skill — daily job" className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Expires</label>
          <input
            type="date"
            value={expiresAt}
            min={daysFromNow(1)}
            max={daysFromNow(MAX_TTL_DAYS)}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground mt-1">Up to {MAX_TTL_DAYS} days out.</p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
            <input type="checkbox" checked={unrestricted} onChange={(e) => setUnrestricted(e.target.checked)} />
            All accounts
          </label>
          {!unrestricted && (
            <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y">
              {(accounts ?? []).map((a) => (
                <label key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                  <input type="checkbox" checked={scopedIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                  {a.name}
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !label.trim() || (!unrestricted && scopedIds.length === 0)} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </form>
    </Modal>
  )
}

function RevealTokenModal({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal open={!!token} onClose={onClose} title="Token created">
      {token && (
        <div className="space-y-4">
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            This is the only time this token's value is shown. Copy it now — it cannot be retrieved again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2.5 break-all">{token}</code>
            <Tooltip content={copied ? 'Copied' : 'Copy'}>
              <button onClick={copy} className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
              </button>
            </Tooltip>
          </div>
          <button onClick={onClose} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Done</button>
        </div>
      )}
    </Modal>
  )
}
