// 7.5-pre2 Session 5 — the server-side half of SKILL.md's "httprequest is
// read-only, no exceptions" rule. The skill states this as a hard rule the
// model must follow; this module is why it's also true even if the model
// doesn't. Every `execute_action` tool call the model makes is checked here
// BEFORE the runner forwards anything to Refold — this is the whole reason
// the runner proxies tool calls itself instead of handing the model
// Anthropic's built-in MCP connector (which would call EXECUTE_ACTION with
// no server-side chance to inspect or reject the call first).

// The exact action ids resolved live against the real Refold MCP server in
// 7.5-pre/Session 4 (skills/cs-sync/reference/tool-map.md) — hardcoded here
// rather than re-resolved per run, since this allowlist IS the security
// boundary; a model-controlled RESOLVE_ACTIONS result must never be able to
// silently widen it.
const ACTION_ALLOWLIST: Record<string, Set<string>> = {
  // The plain ids are the stock BOT-token actions (listing works, reading
  // does not). The hashed ids are the custom USER-token actions added
  // 2026-10-12 — those are the ones that can actually read a channel.
  // Verified live 2026-10-12: all seven work, search included — reading a
  // channel, private channels and search.messages were all impossible on
  // the bot token. One quirk to know: an OMITTED optional parameter is
  // sent to Slack as an empty value and rejected with `invalid_arguments`,
  // so the action catalog tells the agent to pass every parameter.
  slack: new Set([
    'get_conversation_history', 'list_thread_messages', 'search_messages', 'list_channels',
    '6accecbf9b5b1cb653df996d', // conversations.history  (user token)
    '6accecbf9b5b1cb653df991b', // conversations.replies  (user token)
    '6accecbf8698d709960292cd', // search.messages        (user token)
    '6accecbf9b5b1cb653df996b', // conversations.list     (user token)
    '6accecbf8698d709960292f8', // conversations.members  (user token)
    '6accecbf8698d709960292cf', // users.info             (user token)
    '6accecbf9b5b1cb653df991d', // users.list             (user token)
  ]),
  gmail: new Set(['list_messages', 'get_message']),
  fireflies: new Set(['get_transcript', 'httprequest']),
  zendesk: new Set(['get_ticket_by_id', 'httprequest']),
}

export interface ExecuteActionInput {
  application_slug: string
  action_id: string
  input_payload: Record<string, unknown>
  type?: string
}

export interface AllowlistResult {
  ok: boolean
  reason?: string
}

// Checked in order: is this app/action combination even on the allowlist,
// then (httprequest only) is the specific call itself read-only.
export function checkExecuteAction(input: ExecuteActionInput): AllowlistResult {
  const slug = input.application_slug
  const allowed = ACTION_ALLOWLIST[slug]
  if (!allowed) return { ok: false, reason: `application_slug '${slug}' is not on the allowlist for this skill` }
  if (!allowed.has(input.action_id)) return { ok: false, reason: `action_id '${input.action_id}' is not allowed for '${slug}'` }

  if (input.action_id === 'httprequest') return checkHttprequest(slug, input.input_payload)
  return { ok: true }
}

function checkHttprequest(slug: string, payload: Record<string, unknown>): AllowlistResult {
  const method = String(payload.method ?? '').toUpperCase()

  if (slug === 'zendesk') {
    if (method !== 'GET') return { ok: false, reason: 'httprequest against Zendesk must be GET — read-only, no exceptions' }
    return { ok: true }
  }

  if (slug === 'fireflies') {
    if (method !== 'POST') return { ok: false, reason: 'httprequest against Fireflies must POST /graphql' }
    const urlPath = String(payload.url_path ?? '')
    if (!urlPath.includes('/graphql')) return { ok: false, reason: 'httprequest against Fireflies must target /graphql' }
    const body = payload.body as Record<string, unknown> | undefined
    const query = typeof body?.query === 'string' ? body.query : ''
    if (!query.trim()) return { ok: false, reason: 'httprequest against Fireflies must send a GraphQL query' }
    // A literal "mutation" keyword is the one thing this rule exists to
    // catch — a real GraphQL query can legitimately contain the substring
    // inside a field/type name, but Fireflies' schema has no such field, so
    // this stays a direct substring check rather than a full GraphQL parse.
    if (/\bmutation\b/i.test(query)) return { ok: false, reason: 'httprequest against Fireflies must never send a GraphQL mutation' }
    return { ok: true }
  }

  return { ok: false, reason: `httprequest is not allowed for '${slug}'` }
}
