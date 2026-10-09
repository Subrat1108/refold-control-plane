import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Play, Square } from 'lucide-react'
import {
  useSupabaseAuth,
  useStandup,
  useStandupEntries,
  updateStandupEntry,
  createActionItem,
  useAccountsRaw,
  createAsk,
} from '@/hooks'
import { Modal } from '@/components/Modal'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import type { StandupEntryRow } from '@/types'

export function StandupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useSupabaseAuth()
  const { data: standup, isLoading: standupLoading, isError, refetch } = useStandup(id ?? null)
  const { data: entries, isLoading: entriesLoading } = useStandupEntries(id ?? null)
  const [liveMode, setLiveMode] = useState(false)
  const [liveIndex, setLiveIndex] = useState(0)
  const [seconds, setSeconds] = useState(120)

  useEffect(() => {
    if (!liveMode) return
    setSeconds(120)
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [liveMode, liveIndex])

  if (!id) return null
  if (standupLoading) return <div className="p-6"><CardSkeleton /></div>
  if (isError || !standup) return <div className="p-6"><ErrorState onRetry={() => refetch()} /></div>

  const isHost = profile?.id === standup.hostProfileId
  const rows = entries ?? []
  const liveEntry = rows[liveIndex]

  return (
    <div className="p-6 space-y-6">
      <Link to="/standups" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to Standups
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Standup — {standup.standupDate}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{rows.length} participant{rows.length === 1 ? '' : 's'}</p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={() => { setLiveMode((m) => !m); setLiveIndex(0) }}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {liveMode ? <Square size={14} /> : <Play size={14} />} {liveMode ? 'Stop live mode' : 'Live mode'}
          </button>
        )}
      </div>

      {liveMode && liveEntry ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Participant {liveIndex + 1} of {rows.length}</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
          </div>
          <EntryCard entry={liveEntry} canEdit={!!profile && (isHost || liveEntry.profileId === profile.id)} standupId={id} />
          <div className="flex justify-between">
            <button onClick={() => setLiveIndex((i) => Math.max(0, i - 1))} disabled={liveIndex === 0} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">Previous</button>
            <button onClick={() => setLiveIndex((i) => Math.min(rows.length - 1, i + 1))} disabled={liveIndex === rows.length - 1} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">Next</button>
          </div>
        </div>
      ) : entriesLoading ? (
        <CardSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((entry) => (
            <EntryCard key={entry.id} entry={entry} canEdit={!!profile && (isHost || entry.profileId === profile.id)} standupId={id} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry, canEdit, standupId }: { entry: StandupEntryRow; canEdit: boolean; standupId: string }) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const [yesterday, setYesterday] = useState(entry.yesterday ?? '')
  const [today, setToday] = useState(entry.today ?? '')
  const [blockers, setBlockers] = useState(entry.blockers ?? '')
  const [saving, setSaving] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [actionOpen, setActionOpen] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ['standup-entries', standupId] })

  async function save() {
    setSaving(true)
    try {
      await updateStandupEntry(entry.id, { yesterday, today, blockers })
      refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{entry.profileName ?? '—'}</h3>
      <Field label="Yesterday" value={yesterday} onChange={setYesterday} disabled={!canEdit} />
      <Field label="Today" value={today} onChange={setToday} disabled={!canEdit} />
      <Field label="Blockers" value={blockers} onChange={setBlockers} disabled={!canEdit} />
      {canEdit && (
        <button onClick={save} disabled={saving} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
      {blockers.trim() && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <button onClick={() => setAskOpen(true)} className="text-xs font-medium text-primary hover:underline">Turn into an ask…</button>
          <button onClick={() => setActionOpen(true)} className="text-xs font-medium text-primary hover:underline">Turn into an action item…</button>
        </div>
      )}
      <TurnIntoAskModal open={askOpen} text={blockers} onClose={() => setAskOpen(false)} actorId={profile?.id ?? null} />
      <TurnIntoActionItemModal open={actionOpen} text={blockers} ownerProfileId={entry.profileId} standupEntryId={entry.id} onClose={() => setActionOpen(false)} actorId={profile?.id ?? null} />
    </div>
  )
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={2}
        className="w-full rounded-md border border-border px-2 py-1.5 text-sm disabled:bg-muted disabled:text-muted-foreground"
      />
    </div>
  )
}

function TurnIntoAskModal({ open, text, onClose, actorId }: { open: boolean; text: string; onClose: () => void; actorId: string | null }) {
  const { data: accounts } = useAccountsRaw()
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !actorId) return
    setBusy(true)
    try {
      await createAsk(orgId, null, { text }, actorId)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Turn blocker into an ask">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">"{text}"</p>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm">
          <option value="">Select account…</option>
          {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="submit" disabled={busy || !orgId} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">{busy ? 'Adding…' : 'Add ask'}</button>
      </form>
    </Modal>
  )
}

function TurnIntoActionItemModal({ open, text, ownerProfileId, standupEntryId, onClose, actorId }: { open: boolean; text: string; ownerProfileId: string; standupEntryId: string; onClose: () => void; actorId: string | null }) {
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!actorId) return
    setBusy(true)
    try {
      await createActionItem({ standupEntryId, ownerProfileId, description: text, dueDate: dueDate || null }, actorId)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Turn blocker into an action item">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">"{text}"</p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Due date <span className="text-muted-foreground font-normal">(optional)</span></label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40">{busy ? 'Adding…' : 'Add action item'}</button>
      </form>
    </Modal>
  )
}

