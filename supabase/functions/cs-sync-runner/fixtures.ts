// 7.5-pre2 Session 5 — stub-mode fixtures (requirement 11: tests without
// real APIs). Entirely synthetic, matching this repo's fictional-fixture
// convention — never real customer content, never real Refold/Anthropic
// responses. Only read when CS_SYNC_STUB_MODE is set (local/CI only).

export const STUB_CONNECTED_APPS = [
  { slug: 'slack', connected: true },
  { slug: 'fireflies', connected: true },
  { slug: 'zendesk', connected: false },
  { slug: 'gmail', connected: false },
]

export const STUB_SESSION_TOKEN = {
  token: 'stub-session-token',
  refresh_token: 'stub-refresh-token',
  expires_in: 604800,
  refresh_expires_in: 2592000,
}

export function stubResolveActions(queries: string[]): Array<{ slug: string; type: string; identifier: string; json_schema: Record<string, unknown> }> {
  return queries.map((q) => ({ slug: 'fireflies', type: 'action', identifier: 'get_transcript', json_schema: { query: q } }))
}

// A deliberately-mixed bag: one normal read, one call that the allowlist
// must reject before it ever reaches here (a Fireflies mutation disguised
// as httprequest) — stub mode exercises the reject path by having the
// fake model attempt it, not by special-casing the fixture.
export function stubExecuteAction(applicationSlug: string, actionId: string): { node_status: string; data: unknown } {
  if (applicationSlug === 'fireflies' && actionId === 'httprequest') {
    return { node_status: 'Success', data: { transcripts: [{ id: 'stub-transcript-1', title: 'Stub sync check-in', date: '2026-10-01' }] } }
  }
  return { node_status: 'Success', data: {} }
}

// A minimal, deterministic "model" reply for stub mode — skips the real
// Anthropic call entirely. Exercises the full pipeline (tool loop →
// validation → ingest POST) against one obviously-valid engagement record
// and one deliberately-invalid record (missing a required field) so the
// validation-and-one-repair-attempt path is exercised too.
// `account` is a real seeded org id (Prism Analytics — same fixture id
// rls_test.sql and seed_account_resolutions.sql already use), deliberately
// NOT a made-up identifier — an unresolvable `account` would file a real
// account_resolution proposal every time this fixture runs, polluting the
// fixed "Account match needed (4)" count seed_account_resolutions.sql sets
// up and that tests/e2e/smoke.spec.ts depends on later in the same run (a
// real cross-test-section bug this session hit directly).
const STUB_ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'

export const STUB_MODEL_OUTPUT_VALID = {
  run: { mode: 'scoped', source: 'agent', triggered_by: 'system' },
  records: [
    {
      record_type: 'engagement',
      operation: 'create',
      account: STUB_ACCOUNT_ID,
      type: 'call',
      source_ref: 'fireflies:stub-transcript-1',
      observed_at: '2026-10-01T15:00:00Z',
      data: { engagement_date: '2026-10-01', summary: 'Stub sync check-in — fixture content only.' },
      evidence: { url: 'https://app.fireflies.ai/view/stub-transcript-1', excerpt: 'Stub sync check-in.' },
      confidence: 0.9,
    },
  ],
  skipped: [],
}

// Discovery sweep (Session 6): two records for the SAME unknown company.
// Neither identifier exists in account_sources, so ingest must hold both
// and raise exactly ONE account_resolution covering them — that merging is
// the behaviour worth testing, since a sweep naturally finds several items
// per unknown company.
export const STUB_MODEL_OUTPUT_DISCOVERY = {
  run: { mode: 'scoped', source: 'agent', triggered_by: 'system' },
  records: [
    {
      record_type: 'engagement',
      operation: 'create',
      account: 'unknown-co.example',
      type: 'call',
      source_ref: 'fireflies:stub-discovery-1',
      data: { engagement_date: '2026-10-08', summary: 'Stub discovery call with a company not in the Hub.' },
      evidence: { url: 'https://app.fireflies.ai/view/stub-discovery-1', excerpt: 'Intro call, fixture content only.' },
      confidence: 0.9,
    },
    {
      record_type: 'action_item',
      operation: 'create',
      account: 'unknown-co.example',
      source_ref: 'fireflies:stub-discovery-1#1',
      data: { description: 'Send pricing to the stub discovery company', priority: 'medium', status: 'open' },
      evidence: { excerpt: 'Action item from a fixture transcript.' },
      confidence: 0.9,
    },
  ],
  skipped: [
    { pointer: 'fireflies:stub-known-1', reason: 'Prism Analytics — already a known account, its own sync covers it' },
    { pointer: 'fireflies:stub-internal-1', reason: 'no identifiable customer account' },
  ],
}

export const STUB_MODEL_OUTPUT_INVALID = {
  run: { mode: 'scoped', source: 'agent', triggered_by: 'system' },
  records: [
    {
      record_type: 'engagement',
      operation: 'create',
      account: STUB_ACCOUNT_ID,
      // missing the required record-level `type` — deliberately invalid,
      // for exercising the validate → repair → re-validate path.
      source_ref: 'fireflies:stub-transcript-2',
      data: { engagement_date: '2026-10-02', summary: 'Stub invalid fixture.' },
      evidence: { excerpt: 'Stub invalid fixture.' },
      confidence: 0.9,
    },
  ],
  skipped: [],
}
