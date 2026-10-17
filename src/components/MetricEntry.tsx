// Recording figures for an account or one of its tenants.
//
// Replaces a row that asked for one metric at a time — unusable for a month
// of numbers. You choose the period and granularity ONCE, then fill in
// whatever you have; blanks are skipped rather than written as zero, which
// matters because "no data" and "zero executions" are different facts.
//
// Derived metrics are never offered. Error rate and success rate fall out of
// executions and failures; asking a human to type them invites a figure that
// contradicts its own inputs.
//
// For an air-gapped on-prem account this form and the file upload are the
// only routes that exist — Refold has no access to that infrastructure, so
// nothing arrives by API.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMetricDefinitions, useSupabaseAuth, upsertMetricValue } from '@/hooks'
import { parseCsv, parseJson, type ParsedRow } from '@/lib/metricParse'
import type { MetricGranularity } from '@/types'

interface Props {
  orgId: string
  tenantId?: string | null
  /** Shown so it is obvious whose figures these are. */
  scopeLabel: string
}

const GRANULARITIES: { value: MetricGranularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function MetricEntry({ orgId, tenantId = null, scopeLabel }: Props) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: definitions } = useMetricDefinitions()

  const [granularity, setGranularity] = useState<MetricGranularity>('month')
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 10))
  const [entries, setEntries] = useState<Record<string, string>>({})
  // app_usage is a breakdown, so it needs one row per app rather than a
  // single meaningless total.
  const [apps, setApps] = useState<{ app: string; value: string }[]>([{ app: '', value: '' }])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [parsed, setParsed] = useState<ParsedRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState('')

  // Only what a person can legitimately supply.
  const enterable = (definitions ?? []).filter((d) => d.kind !== 'derived' && d.key !== 'app_usage')
  const derived = (definitions ?? []).filter((d) => d.kind === 'derived')
  const known = new Set((definitions ?? []).map((d) => d.key))

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['metric-values', orgId] })
    qc.invalidateQueries({ queryKey: ['metric-values'] })
  }

  // A period is stored as a date; month granularity keeps the long-standing
  // first-of-month convention so existing rows stay comparable.
  const storedPeriod = () => (granularity === 'month' ? `${period.slice(0, 7)}-01` : period)

  async function saveAll() {
    if (!profile) return
    const filled = Object.entries(entries).filter(([, v]) => v.trim() !== '')
    const appRows = apps.filter((a) => a.app.trim() && a.value.trim() !== '')
    if (!filled.length && !appRows.length) { setError('Nothing filled in yet.'); return }

    setBusy(true); setError(null); setDone(null)
    try {
      for (const [key, raw] of filled) {
        const value = Number(raw)
        if (!Number.isFinite(value)) throw new Error(`"${raw}" is not a number.`)
        await upsertMetricValue(orgId, { metricKey: key, period: storedPeriod(), granularity, value, tenantId }, profile.id)
      }
      for (const row of appRows) {
        await upsertMetricValue(orgId, {
          metricKey: 'app_usage', dimension: row.app.trim(), period: storedPeriod(), granularity, value: Number(row.value), tenantId,
        }, profile.id)
      }
      setDone(`${filled.length + appRows.length} value${filled.length + appRows.length === 1 ? '' : 's'} recorded.`)
      setEntries({}); setApps([{ app: '', value: '' }])
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally { setBusy(false) }
  }

  async function onFile(file: File) {
    setParsed([]); setParseErrors([]); setDone(null); setError(null); setFileName(file.name)
    const name = file.name.toLowerCase()
    if (!name.endsWith('.csv') && !name.endsWith('.json')) {
      setParseErrors([`${file.name} is not a csv or json file. Export the sheet as CSV — xlsx and doc are not readable here yet.`])
      return
    }
    const text = await file.text()
    const result = name.endsWith('.json') ? parseJson(text) : parseCsv(text)
    // Unknown keys are caught here rather than failing one row at a time
    // against the foreign key.
    const unknown = result.rows.filter((r) => !known.has(r.metricKey)).map((r) => r.metricKey)
    const derivedInFile = result.rows.filter((r) => derived.some((d) => d.key === r.metricKey)).map((r) => r.metricKey)
    setParsed(result.rows.filter((r) => known.has(r.metricKey) && !derivedInFile.includes(r.metricKey)))
    setParseErrors([
      ...result.errors,
      ...[...new Set(unknown)].map((k) => `"${k}" is not a known metric — skipped.`),
      ...[...new Set(derivedInFile)].map((k) => `"${k}" is calculated from other metrics and cannot be imported — skipped.`),
    ])
  }

  async function commitFile() {
    if (!profile || !parsed.length) return
    setBusy(true); setError(null)
    try {
      for (const row of parsed) {
        await upsertMetricValue(orgId, { ...row, tenantId, source: 'file' }, profile.id)
      }
      setDone(`${parsed.length} value${parsed.length === 1 ? '' : 's'} recorded from ${fileName}.`)
      setParsed([]); setParseErrors([]); setFileName('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the file')
    } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Add details</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Figures for <span className="font-medium">{scopeLabel}</span>. Leave anything you do not have blank — blanks are skipped, not recorded as zero.
        </p>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label htmlFor={`me-gran-${tenantId ?? orgId}`} className="block text-xs font-medium text-muted-foreground mb-1">Covers a</label>
          <select id={`me-gran-${tenantId ?? orgId}`} value={granularity} onChange={(e) => setGranularity(e.target.value as MetricGranularity)} className="rounded-md border border-border px-2 py-1.5 text-sm bg-white">
            {GRANULARITIES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`me-period-${tenantId ?? orgId}`} className="block text-xs font-medium text-muted-foreground mb-1">
            {granularity === 'month' ? 'Month' : granularity === 'week' ? 'Week beginning' : 'Date'}
          </label>
          <input
            id={`me-period-${tenantId ?? orgId}`}
            type={granularity === 'month' ? 'month' : 'date'}
            value={granularity === 'month' ? period.slice(0, 7) : period}
            onChange={(e) => setPeriod(granularity === 'month' ? `${e.target.value}-01` : e.target.value)}
            className="rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {enterable.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-3">
            <label htmlFor={`me-${d.key}-${tenantId ?? orgId}`} className="text-sm text-foreground">
              {d.label} {d.unit && <span className="text-muted-foreground text-xs">({d.unit})</span>}
            </label>
            <input
              id={`me-${d.key}-${tenantId ?? orgId}`}
              type="number"
              step="any"
              value={entries[d.key] ?? ''}
              onChange={(e) => setEntries((p) => ({ ...p, [d.key]: e.target.value }))}
              className="w-28 rounded-md border border-border px-2 py-1 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground">App usage <span className="font-normal">— one row per app, so the ranking means something</span></p>
        {apps.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              aria-label={`App ${i + 1}`}
              value={row.app}
              onChange={(e) => setApps((p) => p.map((r, j) => (j === i ? { ...r, app: e.target.value } : r)))}
              placeholder="slack"
              className="flex-1 rounded-md border border-border px-2 py-1 text-sm"
            />
            <input
              aria-label={`App ${i + 1} value`}
              type="number"
              step="any"
              value={row.value}
              onChange={(e) => setApps((p) => p.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
              className="w-28 rounded-md border border-border px-2 py-1 text-sm"
            />
            {apps.length > 1 && (
              <button onClick={() => setApps((p) => p.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
            )}
          </div>
        ))}
        <button onClick={() => setApps((p) => [...p, { app: '', value: '' }])} className="text-xs font-medium text-primary hover:underline">+ another app</button>
      </div>

      {derived.length > 0 && (
        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Calculated for you from the above, so they are not listed here: {derived.map((d) => d.label).join(', ')}.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={saveAll} disabled={busy} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save these figures'}
        </button>
        <span className="text-xs text-muted-foreground">or</span>
        <input
          id={`me-file-${tenantId ?? orgId}`}
          type="file"
          accept=".csv,.json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          aria-label="Upload a csv or json file"
          className="block text-sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        File columns: <code className="font-mono">metric_key, period, value</code>, optionally <code className="font-mono">baseline</code>. The file is read
        here and not stored — only the figures are kept.
      </p>

      {parseErrors.length > 0 && (
        <ul className="text-xs text-red-600 space-y-0.5">
          {parseErrors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
          {parseErrors.length > 8 && <li>…and {parseErrors.length - 8} more.</li>}
        </ul>
      )}

      {parsed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{parsed.length} value{parsed.length === 1 ? '' : 's'} ready from {fileName}:</p>
          <ul className="text-xs text-foreground max-h-32 overflow-y-auto space-y-0.5">
            {parsed.slice(0, 20).map((r, i) => (
              <li key={i}><code className="font-mono">{r.metricKey}</code> · {r.period.slice(0, 7)} · {r.value}</li>
            ))}
            {parsed.length > 20 && <li className="text-muted-foreground">…and {parsed.length - 20} more.</li>}
          </ul>
          <button onClick={commitFile} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? 'Recording…' : `Record ${parsed.length} value${parsed.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-muted-foreground">{done}</p>}
    </div>
  )
}
