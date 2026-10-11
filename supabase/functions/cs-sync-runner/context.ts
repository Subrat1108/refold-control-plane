// 7.5-pre2 Session 5 — builds the sync context JSON exactly per SKILL.md's
// documented contract (mode/run_id/triggered_by/units/known_records/
// metric_definitions/allowed_values/learnings).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { TARGET_TABLE } from '../_shared/dedupe.ts'

const ENUM_TYPES: Record<string, string> = {
  milestone_status: 'milestone_status',
  risk_status: 'risk_status',
  escalation_status: 'escalation_status',
  severity: 'risk_severity',
  ticket_status: 'ticket_status',
  ticket_priority: 'ticket_priority',
  action_item_priority: 'action_item_priority',
  action_item_status: 'action_item_status',
}

const KNOWN_RECORDS_LIMIT = 50

export interface BuildContextArgs {
  svc: SupabaseClient
  orgId: string
  recordType: string
  mode: 'scoped' | 'daily' | 'backfill'
  runId: string
  triggeredBy: string
  since: string // ISO timestamp
}

export async function buildSyncContext(args: BuildContextArgs): Promise<Record<string, unknown>> {
  const { svc, orgId, recordType, mode, runId, triggeredBy, since } = args

  const [{ data: org }, { data: accountSources }, { data: tenants }, { data: allTenantSources }, { data: projects }, { data: metricDefs }, { data: learnings }] = await Promise.all([
    svc.from('organizations').select('id, name, health').eq('id', orgId).single(),
    svc.from('account_sources').select('value').eq('org_id', orgId).is('tenant_id', null),
    svc.from('tenants').select('id, name').eq('org_id', orgId),
    svc.from('account_sources').select('tenant_id, value').eq('org_id', orgId).not('tenant_id', 'is', null),
    svc.from('projects').select('id, name').eq('org_id', orgId),
    svc.from('metric_definitions').select('key, label, unit'),
    svc.from('sync_learnings').select('id, kind, content').eq('status', 'active').or(`org_id.is.null,org_id.eq.${orgId}`),
  ])

  const tenantSourcesByTenant = new Map<string, string[]>()
  for (const row of allTenantSources ?? []) {
    const list = tenantSourcesByTenant.get(row.tenant_id as string) ?? []
    list.push(row.value as string)
    tenantSourcesByTenant.set(row.tenant_id as string, list)
  }

  const unit = {
    account: {
      id: org?.id,
      name: org?.name,
      aliases: (accountSources ?? []).map((s) => s.value),
      tenants: (tenants ?? []).map((t) => ({ id: t.id, name: t.name, aliases: tenantSourcesByTenant.get(t.id as string) ?? [] })),
      current_health: org?.health,
      projects: projects ?? [],
    },
    record_types: [recordType],
    since,
  }

  const knownRecords: Record<string, unknown[]> = {}
  const targetTable = TARGET_TABLE[recordType]
  if (targetTable && targetTable !== 'organizations') {
    const { data: rows } = await svc.from(targetTable).select('*').eq('org_id', orgId).not('source_ref', 'is', null).order('created_at', { ascending: false }).limit(KNOWN_RECORDS_LIMIT)
    knownRecords[targetTable] = rows ?? []
  }

  const allowedValues: Record<string, string[]> = {}
  await Promise.all(
    Object.entries(ENUM_TYPES).map(async ([key, pgType]) => {
      const { data } = await svc.rpc('get_enum_values', { p_type_name: `public.${pgType}` })
      allowedValues[key] = (data as string[]) ?? []
    })
  )

  return {
    mode,
    run_id: runId,
    triggered_by: triggeredBy,
    units: [unit],
    known_records: { [orgId]: knownRecords },
    metric_definitions: metricDefs ?? [],
    allowed_values: allowedValues,
    learnings: (learnings ?? []).map((l) => ({ id: l.id, kind: l.kind, content: l.content })),
  }
}
