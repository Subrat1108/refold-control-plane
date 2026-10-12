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
const INTERNAL_ORG_ID = '00000000-0000-0000-0000-000000000001'

// The action catalog is already known and fixed (resolved live in 7.5-pre,
// and it IS the allowlist in allowlist.ts) — so hand it to the agent up
// front instead of making it call resolve_actions to rediscover it. The
// first live sweep spent three turns and 17 seconds resolving actions and
// then ran out of budget before reaching Fireflies at all.
const ACTION_CATALOG = {
  fireflies: {
    list_transcripts_by_date: "execute_action fireflies/httprequest {method:'POST', base_url:'https://api.fireflies.ai', url_path:'/graphql', body:{query:'query { transcripts(fromDate: \"<ISO>\", toDate: \"<ISO>\", limit: 50, skip: 0) { id title date } }'}} — THIS is how you list meetings by date range",
    transcript_detail: "execute_action fireflies/httprequest, query: 'query { transcript(id: \"<id>\") { id title date meeting_attendees { displayName email } summary { overview action_items keywords } } }'",
    who_am_i: "execute_action fireflies/httprequest, query: 'query { user { email name } }' — the token owner",
    get_transcript: 'execute_action fireflies/get_transcript {transcript_id} — only if you already have an id',
  },
  slack: {
    // USER-token custom actions (added 2026-10-12) — the stock bot-token
    // actions cannot read a channel. Ids are opaque hashes.
    //
    // CRITICAL: pass EVERY parameter listed, including the optional ones.
    // An omitted optional is sent to Slack as an empty value and rejected
    // with `invalid_arguments` — verified live: conversations.members
    // fails without `limit` and succeeds with it. All seven actions work
    // when fully parameterised, search included.
    list_channels: "execute_action slack/6accecbf9b5b1cb653df996b {types:'public_channel,private_channel', exclude_archived:'true', limit:'200', cursor:''} — includes PRIVATE channels the user is in",
    read_channel: "execute_action slack/6accecbf9b5b1cb653df996d {channel:'<channel ID, not name>', oldest:'<slack ts>', latest:'<slack ts or now>', limit:'100', cursor:''}",
    read_thread: "execute_action slack/6accecbf9b5b1cb653df991b {channel:'<id>', ts:'<root ts>', limit:'50', cursor:''}",
    search: "execute_action slack/6accecbf8698d709960292cd {query:'<one keyword, never a boolean OR>', count:'20', page:'1', sort:'timestamp'}",
    channel_members: "execute_action slack/6accecbf8698d709960292f8 {channel:'<id>', limit:'100', cursor:''} — to spot external participants",
    user_info: "execute_action slack/6accecbf8698d709960292cf {user:'<user id>'} — resolves a name and email domain",
    list_users: "execute_action slack/6accecbf9b5b1cb653df991d {limit:'200', cursor:''}",
  },
  gmail: {
    list: 'execute_action gmail/list_messages {userId:"me", q:"<gmail query>", maxResults}',
    get: 'execute_action gmail/get_message {userId:"me", id}',
  },
  zendesk: {
    incremental_tickets: "execute_action zendesk/httprequest {method:'GET', base_url:'<subdomain>', url_path:'/api/v2/incremental/tickets.json', query_string:{start_time:'<unix>'}}",
    get_ticket: 'execute_action zendesk/get_ticket_by_id {ticket_id}',
  },
  _note: 'This is the COMPLETE set of calls permitted. There is no action-discovery step — call execute_action directly with the shapes above. Anything else is rejected before it reaches Refold.',
}

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

  return {
    mode,
    run_id: runId,
    triggered_by: triggeredBy,
    units: [unit],
    known_records: { [orgId]: knownRecords },
    metric_definitions: metricDefs ?? [],
    action_catalog: ACTION_CATALOG,
    allowed_values: await loadAllowedValues(svc),
    learnings: (learnings ?? []).map((l) => ({ id: l.id, kind: l.kind, content: l.content })),
  }
}

// Read straight from the real Postgres enums rather than a hand-copied
// list, so a future enum change can't drift out of what the model is told
// is valid. Shared by both context shapes.
async function loadAllowedValues(svc: SupabaseClient): Promise<Record<string, string[]>> {
  const allowedValues: Record<string, string[]> = {}
  await Promise.all(
    Object.entries(ENUM_TYPES).map(async ([key, pgType]) => {
      const { data } = await svc.rpc('get_enum_values', { p_type_name: `public.${pgType}` })
      allowedValues[key] = (data as string[]) ?? []
    })
  )
  return allowedValues
}

// ── Discovery sweep (7.5-pre2 Session 6) ──────────────────────────────────
// The context for a run that is NOT tied to one account. Instead of a single
// unit it carries the WHOLE roster — every account, its account_sources and
// its tenants — so the agent can tell "already known" from "nobody has added
// this yet". Anything it can already attribute is skipped (the per-account
// sync owns it, and reporting it here too would duplicate it); anything it
// can't becomes a record with a best-guess identifier, which `ingest` holds
// and raises as an "Account match needed" item.

export interface BuildDiscoveryContextArgs {
  svc: SupabaseClient
  mode: 'scoped' | 'daily' | 'backfill'
  runId: string
  triggeredBy: string
  since: string
  unavailableConnectors: string[]
}

export async function buildDiscoveryContext(args: BuildDiscoveryContextArgs): Promise<Record<string, unknown>> {
  const { svc, mode, runId, triggeredBy, since, unavailableConnectors } = args

  const [{ data: settings }, { data: orgs }, { data: sources }, { data: tenants }, { data: learnings }] = await Promise.all([
    svc.from('sync_settings').select('internal_email_domains, discovery_channel_patterns').limit(1).single(),
    svc.from('organizations').select('id, name').neq('id', INTERNAL_ORG_ID),
    svc.from('account_sources').select('org_id, tenant_id, source_type, value'),
    svc.from('tenants').select('id, org_id, name'),
    // Global learnings only — a sweep isn't scoped to one account, and the
    // `ignore` entries written by "not a customer" resolutions are exactly
    // what should stop a known non-customer being re-proposed every sweep.
    svc.from('sync_learnings').select('id, kind, content').eq('status', 'active'),
  ])

  const sourcesByOrg = new Map<string, string[]>()
  const sourcesByTenant = new Map<string, string[]>()
  for (const row of sources ?? []) {
    const target = row.tenant_id ? sourcesByTenant : sourcesByOrg
    const key = (row.tenant_id ?? row.org_id) as string
    const list = target.get(key) ?? []
    list.push(row.value as string)
    target.set(key, list)
  }

  const tenantsByOrg = new Map<string, Array<Record<string, unknown>>>()
  for (const t of tenants ?? []) {
    const list = tenantsByOrg.get(t.org_id as string) ?? []
    list.push({ id: t.id, name: t.name, aliases: sourcesByTenant.get(t.id as string) ?? [] })
    tenantsByOrg.set(t.org_id as string, list)
  }

  const roster = (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    aliases: sourcesByOrg.get(o.id as string) ?? [],
    tenants: tenantsByOrg.get(o.id as string) ?? [],
  }))

  return {
    mode: 'discovery',
    sync_run_mode: mode,
    run_id: runId,
    triggered_by: triggeredBy,
    since,
    // The whole point of this shape: the agent compares what it finds
    // against this roster rather than being pointed at one entry in it.
    known_accounts: roster,
    internal_email_domains: settings?.internal_email_domains ?? ['refold.ai'],
    discovery_channel_patterns: settings?.discovery_channel_patterns ?? ['internal'],
    unavailable_connectors_this_run: unavailableConnectors,
    // One invocation has a hard wall-clock limit, so a sweep is explicitly
    // budgeted rather than being allowed to try to read everything and die
    // at the gateway. The watermark only advances on success, so the next
    // run continues from where this one got to.
    budget: {
      max_items_to_examine: 20,
      guidance: 'Examine at most this many candidate items in this run. List first, filter cheaply on titles/attendees, and only fetch detail for the ones that look like real customer conversations. If more remain, report what you have and add the rest to `skipped` with reason "run budget reached".',
    },
    action_catalog: ACTION_CATALOG,
    allowed_values: await loadAllowedValues(svc),
    learnings: (learnings ?? []).map((l) => ({ id: l.id, kind: l.kind, content: l.content })),
  }
}
