// Parsing uploaded metric files. Pure functions, no React — which is why
// they live here rather than beside the component: they decide what gets
// written to a customer's record, so they are worth testing directly, and a
// silent mis-parse is worse than a refusal.
//
// Only csv and json are handled. xlsx and doc were asked for, but reading
// them needs a dependency this app does not carry, and accepting a file that
// silently does nothing is the pattern this codebase keeps removing.
export interface ParsedRow {
  metricKey: string
  period: string
  value: number
  baselineValue: number | null
}



// A period may be given as 2026-10 or 2026-10-01; metric_values keeps the
// first-of-month convention.
export function normalisePeriod(raw: string): string | null {
  const v = raw.trim()
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(0, 7)}-01`
  return null
}

export function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { rows: [], errors: ['The file is empty.'] }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const idx = {
    metric: header.findIndex((h) => h === 'metric_key' || h === 'metric'),
    period: header.findIndex((h) => h === 'period' || h === 'month'),
    value: header.findIndex((h) => h === 'value'),
    baseline: header.findIndex((h) => h === 'baseline' || h === 'baseline_value'),
  }
  if (idx.metric < 0 || idx.period < 0 || idx.value < 0) {
    return { rows: [], errors: ['The first row must name the columns: metric_key, period, value (baseline optional).'] }
  }

  const rows: ParsedRow[] = []
  const errors: string[] = []
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(',').map((c) => c.trim())
    const period = normalisePeriod(cells[idx.period] ?? '')
    const value = Number(cells[idx.value])
    if (!cells[idx.metric]) { errors.push(`Row ${i + 2}: no metric_key.`); return }
    if (!period) { errors.push(`Row ${i + 2}: "${cells[idx.period]}" is not a period (use 2026-10).`); return }
    if (!Number.isFinite(value)) { errors.push(`Row ${i + 2}: "${cells[idx.value]}" is not a number.`); return }
    const baseline = idx.baseline >= 0 && cells[idx.baseline] ? Number(cells[idx.baseline]) : null
    rows.push({ metricKey: cells[idx.metric], period, value, baselineValue: Number.isFinite(baseline as number) ? baseline : null })
  })
  return { rows, errors }
}

export function parseJson(text: string): { rows: ParsedRow[]; errors: string[] } {
  let data: unknown
  try { data = JSON.parse(text) } catch { return { rows: [], errors: ['That is not valid JSON.'] } }
  const list = Array.isArray(data) ? data : (data as { metrics?: unknown[] })?.metrics
  if (!Array.isArray(list)) return { rows: [], errors: ['Expected an array of rows, or an object with a "metrics" array.'] }

  const rows: ParsedRow[] = []
  const errors: string[] = []
  list.forEach((raw, i) => {
    const r = raw as Record<string, unknown>
    const key = String(r.metric_key ?? r.metricKey ?? '')
    const period = normalisePeriod(String(r.period ?? ''))
    const value = Number(r.value)
    if (!key) { errors.push(`Item ${i + 1}: no metric_key.`); return }
    if (!period) { errors.push(`Item ${i + 1}: "${r.period}" is not a period (use 2026-10).`); return }
    if (!Number.isFinite(value)) { errors.push(`Item ${i + 1}: value is not a number.`); return }
    const baseline = r.baseline_value ?? r.baselineValue
    rows.push({ metricKey: key, period, value, baselineValue: baseline == null ? null : Number(baseline) })
  })
  return { rows, errors }
}

