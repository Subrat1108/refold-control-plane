// Stage 2c — getting figures in by hand or from a file.
//
// For an air-gapped on-prem account there is no metrics API at all: Refold
// has no access to the customer's infrastructure. Those numbers arrive in a
// spreadsheet or not at all, so this is the only route for them.
//
// The file is parsed in the browser and written as ordinary metric rows —
// it is never stored. That is deliberate: the value of an upload is its
// CONTENTS, and keeping the file as well would mean a bucket, its own
// policies, and a second copy of customer data to look after for no gain.
// Rows land with source 'file' so provenance stays honest.
//
// Only csv and json are accepted. xlsx and doc were asked for, but parsing
// them needs a dependency this app does not have, and accepting a file that
// silently does nothing is the pattern this codebase keeps removing.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMetricDefinitions, useSupabaseAuth, upsertMetricValue } from '@/hooks'
import { parseCsv, parseJson, type ParsedRow } from '@/lib/metricParse'

interface Props {
  orgId: string
  tenantId?: string | null
  /** Shown so it is obvious whose figures these are. */
  scopeLabel: string
}

export function MetricEntry({ orgId, tenantId = null, scopeLabel }: Props) {
  const { profile } = useSupabaseAuth()
  const qc = useQueryClient()
  const { data: definitions } = useMetricDefinitions()

  const [metricKey, setMetricKey] = useState('')
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [parsed, setParsed] = useState<ParsedRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState('')

  const known = new Set((definitions ?? []).map((d) => d.key))
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['metric-values', orgId] })
    qc.invalidateQueries({ queryKey: ['metric-values'] })
  }

  async function saveOne() {
    if (!profile || !metricKey || value === '') return
    setBusy(true); setError(null); setDone(null)
    try {
      await upsertMetricValue(orgId, { metricKey, period: `${period}-01`, value: Number(value), tenantId }, profile.id)
      setValue(''); setDone('Saved.'); refresh()
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
    // Catch unknown metric keys BEFORE writing: metric_key is a foreign key,
    // so these would fail one row at a time with an opaque error.
    const unknown = result.rows.filter((r) => !known.has(r.metricKey)).map((r) => r.metricKey)
    setParsed(result.rows.filter((r) => known.has(r.metricKey)))
    setParseErrors([
      ...result.errors,
      ...[...new Set(unknown)].map((k) => `"${k}" is not a known metric — it will be skipped.`),
    ])
  }

  async function commit() {
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
    <div className="bg-white rounded-xl shadow-card p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Add details</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Recording figures for <span className="font-medium">{scopeLabel}</span>.</p>
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label htmlFor={`me-metric-${tenantId ?? orgId}`} className="block text-xs font-medium text-muted-foreground mb-1">Metric</label>
          <select id={`me-metric-${tenantId ?? orgId}`} value={metricKey} onChange={(e) => setMetricKey(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm bg-white">
            <option value="">Select…</option>
            {(definitions ?? []).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`me-period-${tenantId ?? orgId}`} className="block text-xs font-medium text-muted-foreground mb-1">Period</label>
          <input id={`me-period-${tenantId ?? orgId}`} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor={`me-value-${tenantId ?? orgId}`} className="block text-xs font-medium text-muted-foreground mb-1">Value</label>
          <input id={`me-value-${tenantId ?? orgId}`} type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
        </div>
        <button onClick={saveOne} disabled={busy || !metricKey || value === ''} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
          Enter value
        </button>
      </div>

      <div className="pt-3 border-t border-border space-y-2">
        <label htmlFor={`me-file-${tenantId ?? orgId}`} className="block text-xs font-medium text-muted-foreground">
          …or upload a file <span className="font-normal">(csv or json)</span>
        </label>
        <input
          id={`me-file-${tenantId ?? orgId}`}
          type="file"
          accept=".csv,.json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          className="block text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Columns: <code className="font-mono">metric_key, period, value</code> and optionally <code className="font-mono">baseline</code>. A period looks
          like <code className="font-mono">2026-10</code>. The file is read here and not stored — only the figures are kept.
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
                <li key={i}><code className="font-mono">{r.metricKey}</code> · {r.period.slice(0, 7)} · {r.value}{r.baselineValue != null && ` (baseline ${r.baselineValue})`}</li>
              ))}
              {parsed.length > 20 && <li className="text-muted-foreground">…and {parsed.length - 20} more.</li>}
            </ul>
            <button onClick={commit} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {busy ? 'Recording…' : `Record ${parsed.length} value${parsed.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-muted-foreground">{done}</p>}
    </div>
  )
}
