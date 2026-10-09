import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useSupabaseAuth, useSuperAdmins, useStandups, useDefaultParticipants, createStandup } from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { Modal } from '@/components/Modal'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { formatDate } from '@/utils/formatDate'
import type { StandupRow } from '@/types'

export function StandupsPage() {
  const { data: standups, isLoading, isError, refetch } = useStandups()
  const [startOpen, setStartOpen] = useState(false)

  const columns: Column<StandupRow>[] = [
    { key: 'date', header: 'Date', render: (s) => <Link to={`/standups/${s.id}`} className="font-medium text-foreground hover:underline">{s.standupDate}</Link> },
    { key: 'host', header: 'Host', render: (s) => <span className="text-muted-foreground">{s.hostName ?? '—'}</span> },
    { key: 'participants', header: 'Participants', render: (s) => <span className="tabular-nums text-muted-foreground">{s.participantCount}</span> },
    { key: 'created', header: 'Started', render: (s) => <span className="text-muted-foreground">{formatDate(s.createdAt)}</span> },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Standups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Anyone can start one — several a day, run by different hosts, is normal.</p>
        </div>
        <button onClick={() => setStartOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90">
          <Plus size={16} /> Start a standup
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-card p-6">
        {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (standups ?? []).length === 0 ? (
          <EmptyState title="No standups yet" description="Start one to see it here." />
        ) : (
          <DataTable columns={columns} data={standups ?? []} rowKey={(s) => s.id} />
        )}
      </div>

      <StartStandupModal open={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  )
}

function StartStandupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useSupabaseAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: people } = useSuperAdmins()
  const { data: defaultParticipants } = useDefaultParticipants(profile?.id ?? null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [participantIds, setParticipantIds] = useState<string[] | null>(null)
  const [addPick, setAddPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selected = participantIds ?? defaultParticipants ?? []

  function setParticipants(next: string[]) {
    setParticipantIds(next)
  }

  function remove(id: string) {
    setParticipants(selected.filter((p) => p !== id))
  }

  function add() {
    if (!addPick || selected.includes(addPick)) return
    setParticipants([...selected, addPick])
    setAddPick('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || selected.length === 0) return
    setBusy(true)
    setError('')
    try {
      const id = await createStandup(profile.id, date, selected)
      qc.invalidateQueries({ queryKey: ['standups'] })
      setParticipantIds(null)
      onClose()
      navigate(`/standups/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start standup')
    } finally {
      setBusy(false)
    }
  }

  const nameFor = (id: string) => people?.find((p) => p.id === id)?.fullName ?? id

  return (
    <Modal open={open} onClose={() => { setParticipantIds(null); setError(''); onClose() }} title="Start a standup">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Participants</label>
          <div className="space-y-1.5 mb-2">
            {selected.length === 0 && <p className="text-sm text-muted-foreground">No participants yet — add at least one below.</p>}
            {selected.map((id) => (
              <div key={id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5">
                <span className="text-sm text-foreground">{nameFor(id)}</span>
                <button type="button" onClick={() => remove(id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <select value={addPick} onChange={(e) => setAddPick(e.target.value)} className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm">
              <option value="">Add a person…</option>
              {(people ?? []).filter((p) => !selected.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.fullName ?? p.email}</option>)}
            </select>
            <button type="button" onClick={add} disabled={!addPick} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40">Add</button>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy || selected.length === 0} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">
          {busy ? 'Starting…' : 'Start standup'}
        </button>
      </form>
    </Modal>
  )
}
