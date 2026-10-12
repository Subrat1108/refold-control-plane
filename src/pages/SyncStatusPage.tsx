// 7.5-pre2 Session 5 — admin screen for the sync runner: recent runs, the
// kill switch / cron time / caps form, and a backfill trigger. Mirrors
// IngestTokensPage's shape — every write goes through the provisioning
// Edge Function (super_admin + AAL2), never a direct client write.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncRuns, useSyncSettings, useSyncQueue, useAccountsRaw } from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { ErrorState } from '@/components/ErrorState'
import { formatDate } from '@/utils/formatDate'
import { updateSyncSettings, enqueueBackfill, enqueueFullSync } from '@/lib/provisioning'
import { runDiscoverySweep, processQueuedUnit, type SyncRunResult } from '@/lib/syncRunner'
import { supabase } from '@/lib/supabase'
import type { SyncRun } from '@/types'

export function SyncStatusPage() {
  const qc = useQueryClient()
  const { data: runs, isLoading, isError, refetch } = useSyncRuns()
  const { data: settings } = useSyncSettings()
  const { data: queue } = useSyncQueue(20)
  const { data: accounts } = useAccountsRaw()

  const [killSwitch, setKillSwitch] = useState(false)
  const [dailyTime, setDailyTime] = useState('01:30:00')
  const [maxPerRun, setMaxPerRun] = useState(5)
  const [maxPerDay, setMaxPerDay] = useState(50)
  const [maxTokens, setMaxTokens] = useState(150000)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [backfillOrgId, setBackfillOrgId] = useState('')
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [internalDomains, setInternalDomains] = useState('refold.ai')
  const [channelPatterns, setChannelPatterns] = useState('internal')
  const [scanDays, setScanDays] = useState(7)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<SyncRunResult | null>(null)
  const [fullSyncing, setFullSyncing] = useState(false)
  const [fullProgress, setFullProgress] = useState<{ done: number; total: number; note: string } | null>(null)

  if (settings && !hydrated) {
    setKillSwitch(settings.killSwitch)
    setDailyTime(settings.dailyRunAtUtc)
    setMaxPerRun(settings.maxUnitsPerRun)
    setMaxPerDay(settings.maxUnitsPerDay)
    setMaxTokens(settings.maxTokensPerUnit)
    setInternalDomains((settings.internalEmailDomains ?? []).join(', '))
    setChannelPatterns((settings.discoveryChannelPatterns ?? []).join(', '))
    setHydrated(true)
  }

  const splitList = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean)

  async function saveSettings() {
    await updateSyncSettings({
      kill_switch: killSwitch,
      daily_run_at_utc: dailyTime,
      max_units_per_run: maxPerRun,
      max_units_per_day: maxPerDay,
      max_tokens_per_unit: maxTokens,
      internal_email_domains: splitList(internalDomains),
      discovery_channel_patterns: splitList(channelPatterns),
    })
    setSavedAt(formatDate(new Date().toISOString()))
    qc.invalidateQueries({ queryKey: ['sync-settings'] })
  }

  async function runBackfill() {
    setBackfillBusy(true)
    setBackfillResult(null)
    try {
      const res = await enqueueBackfill(backfillOrgId ? [backfillOrgId] : null)
      setBackfillResult(`${res.enqueued} unit(s) queued`)
      qc.invalidateQueries({ queryKey: ['sync-queue'] })
    } catch (err) {
      setBackfillResult(err instanceof Error ? err.message : 'Backfill failed')
    } finally {
      setBackfillBusy(false)
    }
  }

  // Runs synchronously through the same entry point the Refresh button
  // uses — no queue, no Vault secret, result straight back in the response.
  async function runScan() {
    setScanning(true)
    setScanResult(null)
    try {
      setScanResult(await runDiscoverySweep(scanDays))
      qc.invalidateQueries({ queryKey: ['sync-runs'] })
      qc.invalidateQueries({ queryKey: ['account-resolutions'] })
      qc.invalidateQueries({ queryKey: ['pending-proposal-count'] })
    } finally {
      setScanning(false)
    }
  }

  // "Run sync now" — queue exactly what the nightly job queues, then work
  // through it here, one unit per request. Each request is short, so nothing
  // approaches the 150s per-request ceiling, and no background dispatcher or
  // Vault secret is needed for a human-triggered run.
  async function runFullSync() {
    setFullSyncing(true)
    setFullProgress({ done: 0, total: 0, note: 'queueing…' })
    try {
      const { enqueued } = await enqueueFullSync()
      if (!enqueued) {
        setFullProgress({ done: 0, total: 0, note: 'Nothing to queue — either everything is already running, or the kill switch is on.' })
        return
      }
      let done = 0
      let truncated = 0
      // Drain whatever is queued, including anything the nightly job left.
      for (;;) {
        const { data: next } = await supabase
          .from('sync_queue').select('id').eq('status', 'queued')
          .order('enqueued_at', { ascending: true }).limit(1).maybeSingle()
        if (!next) break
        setFullProgress({ done, total: enqueued, note: 'syncing…' })
        const res = await processQueuedUnit(next.id as string)
        if (res.truncated) truncated++
        done++
        qc.invalidateQueries({ queryKey: ['sync-runs'] })
      }
      setFullProgress({
        done,
        total: enqueued,
        note: truncated
          ? `done — ${truncated} unit(s) ran out of time and will continue on the next run`
          : 'done',
      })
      qc.invalidateQueries({ queryKey: ['account-resolutions'] })
      qc.invalidateQueries({ queryKey: ['pending-proposal-count'] })
      qc.invalidateQueries({ queryKey: ['sync-queue'] })
    } catch (err) {
      setFullProgress({ done: 0, total: 0, note: err instanceof Error ? err.message : 'failed' })
    } finally {
      setFullSyncing(false)
    }
  }

  const columns: Column<SyncRun>[] = [
    { key: 'started', header: 'Started', render: (r) => <span className="text-muted-foreground">{formatDate(r.startedAt)}</span> },
    { key: 'mode', header: 'Mode', render: (r) => <StatusBadge status={r.mode} /> },
    { key: 'scope', header: 'Scope', render: (r) => <span className="text-xs text-muted-foreground">{r.scope ? JSON.stringify(r.scope) : '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'counts', header: 'Counts', render: (r) => <span className="text-xs text-muted-foreground">{r.counts ? Object.entries(r.counts).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'}</span> },
    { key: 'tokens', header: 'Tokens', render: (r) => <span className="text-muted-foreground">{r.tokensUsed ?? '—'}</span> },
    { key: 'skipped', header: 'Skipped connectors', render: (r) => <span className="text-xs text-amber-700">{r.skippedConnectors?.length ? r.skippedConnectors.join(', ') : '—'}</span> },
    {
      key: 'looked-at',
      header: 'Looked at but not reported',
      render: (r) => !r.skippedItems?.length ? <span className="text-xs text-muted-foreground">—</span> : (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{r.skippedItems.length} item(s)</summary>
          <ul className="mt-1 space-y-0.5 max-w-md">
            {r.skippedItems.slice(0, 20).map((s, i) => <li key={i} className="text-muted-foreground">{s.reason ?? '—'}</li>)}
          </ul>
        </details>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Sync status</h1>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Run sync now</h2>
          <p className="text-xs text-muted-foreground mt-1">
            The same work the nightly job does: refresh every record type for every account,
            <strong> plus</strong> a sweep for customers that aren't in the Hub yet. Runs here in your
            browser, one piece at a time — keep this page open until it finishes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={runFullSync} disabled={fullSyncing} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {fullSyncing ? 'Syncing…' : 'Run sync now'}
          </button>
          {fullProgress && (
            <span className="text-xs text-muted-foreground">
              {fullProgress.total ? `${fullProgress.done}/${fullProgress.total} — ` : ''}{fullProgress.note}
            </span>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Scan for unknown accounts only</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Looks across the connected tools for customers that aren't in the Hub yet — meetings,
            channels and tickets involving anyone outside your own email domains. Anything it can't
            match to an existing account becomes an <strong>Account match needed</strong> item in
            Approvals, where you create the account.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Look back (days)</label>
            <input type="number" min={1} max={365} value={scanDays} onChange={(e) => setScanDays(Number(e.target.value))} className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
          </div>
          <button onClick={runScan} disabled={scanning} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {scanning ? 'Scanning…' : 'Scan for unknown accounts'}
          </button>
        </div>
        {scanResult && (
          <p className={`text-xs ${scanResult.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}`}>
            {scanResult.status === 'failed' && `Failed: ${scanResult.error}`}
            {scanResult.status === 'locked' && 'A scan is already running.'}
            {(scanResult.status === 'success' || scanResult.status === 'partial') && (
              <>
                {Object.entries(scanResult.counts ?? {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ') || 'Nothing new found.'}
                {scanResult.skippedConnectors?.length ? ` — couldn't check: ${scanResult.skippedConnectors.join(', ')}` : ''}
              </>
            )}
          </p>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={killSwitch} onChange={(e) => setKillSwitch(e.target.checked)} />
            Kill switch
          </label>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Daily run (UTC)</label>
            <input type="time" step={1} value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Max units / run</label>
            <input type="number" min={1} value={maxPerRun} onChange={(e) => setMaxPerRun(Number(e.target.value))} className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Max units / day</label>
            <input type="number" min={1} value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))} className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Max tokens / unit</label>
            <input type="number" min={1000} step={1000} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Our own email domains (comma-separated)</label>
            <input value={internalDomains} onChange={(e) => setInternalDomains(e.target.value)} placeholder="refold.ai" className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
            <p className="text-xs text-muted-foreground mt-1">Anyone outside these counts as a customer or prospect.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Slack channel name patterns (comma-separated)</label>
            <input value={channelPatterns} onChange={(e) => setChannelPatterns(e.target.value)} placeholder="internal" className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
            <p className="text-xs text-muted-foreground mt-1">Channels named like this are scanned even with no outsider in them (e.g. <code>internal-acme</code>).</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveSettings} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90">Save settings</button>
          {savedAt && <span className="text-xs text-muted-foreground">Saved {savedAt}</span>}
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Run backfill</h2>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Account (leave blank for all)</label>
            <select value={backfillOrgId} onChange={(e) => setBackfillOrgId(e.target.value)} className="w-full rounded-md border border-border px-2 py-1.5 text-sm bg-white">
              <option value="">All accounts</option>
              {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button onClick={runBackfill} disabled={backfillBusy} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
            {backfillBusy ? 'Queuing…' : 'Run backfill'}
          </button>
        </div>
        {backfillResult && <p className="text-xs text-muted-foreground">{backfillResult}</p>}
        {(queue ?? []).length > 0 && (
          <div className="pt-2">
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">Recent queue activity</h3>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {(queue ?? []).slice(0, 10).map((q) => <li key={q.id}>{q.recordType} · {q.mode} · <StatusBadge status={q.status} /></li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Recent runs</h2>
        {isLoading ? <CardSkeleton /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
          <DataTable columns={columns} data={runs ?? []} rowKey={(r) => r.id} emptyTitle="No sync runs yet" />
        )}
      </section>
    </div>
  )
}
