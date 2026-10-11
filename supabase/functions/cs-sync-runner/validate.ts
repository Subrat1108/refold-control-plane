// 7.5-pre2 Session 5 — validates the model's final-turn JSON against
// skills/cs-sync/reference/payload.schema.json's contract, BEFORE any of it
// is posted to `ingest`. Reuses _shared/dedupe.ts's REQUIRED_FIELDS (the
// same source `ingest` itself validates `data` against) for the per-
// record-type required-field checks, rather than re-deriving them from the
// JSON Schema file with a new Deno/npm JSON-Schema library — one source of
// truth, not two copies that can drift. The handful of structural checks
// REQUIRED_FIELDS doesn't cover (array size, confidence range, excerpt
// length, engagement's record-level `type`, milestone/accomplishment's
// record-level `project`) are hand-coded here, matching the schema file
// directly — a throwaway script checks the two agree before this ships.

import { REQUIRED_FIELDS } from '../_shared/dedupe.ts'

const RECORD_TYPES = new Set(['milestone', 'accomplishment', 'risk', 'escalation', 'ticket', 'metric', 'health', 'action_item', 'engagement'])
const OPERATIONS = new Set(['create', 'update', 'delete'])
const ENGAGEMENT_TYPES = new Set(['call', 'check_in', 'qbr', 'ebr', 'note'])
const MAX_RECORDS = 200

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateOutput(output: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof output !== 'object' || output === null) {
    return { valid: false, errors: ['top-level output is not a JSON object'] }
  }
  const obj = output as Record<string, unknown>

  if (typeof obj.run !== 'object' || obj.run === null) errors.push('run is required')
  if (!Array.isArray(obj.records)) {
    errors.push('records must be an array')
    return { valid: false, errors }
  }

  const records = obj.records as unknown[]
  if (records.length > MAX_RECORDS) errors.push(`records has ${records.length} entries, max ${MAX_RECORDS}`)

  records.forEach((r, i) => errors.push(...validateRecord(r, i)))

  return { valid: errors.length === 0, errors }
}

function validateRecord(r: unknown, i: number): string[] {
  const errors: string[] = []
  const p = (msg: string) => errors.push(`records[${i}]: ${msg}`)

  if (typeof r !== 'object' || r === null) {
    p('is not a JSON object')
    return errors
  }
  const rec = r as Record<string, unknown>

  const recordType = rec.record_type as string
  if (!RECORD_TYPES.has(recordType)) p(`record_type '${recordType}' is not one of the allowed types`)
  if (!OPERATIONS.has(rec.operation as string)) p(`operation '${rec.operation}' must be create, update, or delete`)
  if (typeof rec.account !== 'string' || rec.account.length < 1) p('account is required')
  if (typeof rec.source_ref !== 'string' || rec.source_ref.length < 3) p('source_ref must be at least 3 characters')

  const confidence = rec.confidence as number
  if (typeof confidence !== 'number' || confidence < 0.5 || confidence > 1) p('confidence must be a number between 0.5 and 1')

  const evidence = rec.evidence as Record<string, unknown> | undefined
  if (typeof evidence !== 'object' || evidence === null || typeof evidence.excerpt !== 'string') {
    p('evidence.excerpt is required')
  } else if (evidence.excerpt.length > 280) {
    p('evidence.excerpt must be at most 280 characters')
  }

  if (recordType === 'milestone' || recordType === 'accomplishment') {
    if (typeof rec.project !== 'string' || !rec.project) p(`${recordType} requires a record-level project`)
  }
  if (recordType === 'engagement') {
    if (!ENGAGEMENT_TYPES.has(rec.type as string)) p("engagement requires a record-level type (call/check_in/qbr/ebr/note)")
  }

  if (rec.operation === 'create' || rec.operation === 'update') {
    const data = (rec.data ?? {}) as Record<string, unknown>
    const required = RECORD_TYPES.has(recordType) ? REQUIRED_FIELDS[recordType] ?? [] : []
    for (const field of required) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        p(`data.${field} is required for record_type '${recordType}'`)
      }
    }
    if (recordType === 'health') {
      const h = String(data.health ?? '').toLowerCase()
      if (!['active', 'caution', 'risk'].includes(h)) p("data.health must be active, caution, or risk")
    }
  }

  return errors
}
