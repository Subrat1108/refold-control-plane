import type {
  CloudOrg,
  CloudOrgDetail,
  OnPremOrg,
  NamespaceDetail,
  FeatureFlag,
  OverviewStats,
  CloudDashboard,
  OnPremDashboard,
  AiCredits,
  SearchResult,
  TrendPoint,
  WorkflowRun,
  CloudOrgMetrics,
  WorkflowSummary,
  Connector,
  OnPremOrgDetail,
  OnPremNamespaceRow,
} from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const delay = () => new Promise<void>((r) => setTimeout(r, 200))

function maybeThrow() {
  if (Math.random() < 0.1) throw new Error('Simulated server error')
}

function trend30(base: number, variance: number, startDate = '2025-05-11'): TrendPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const v = Math.round(base * (1 + (Math.random() - 0.5) * variance))
    return { date: d.toISOString().slice(0, 10), value: v }
  })
}

function workflowRuns(count: number, seed: number): WorkflowRun[] {
  const names = [
    'Invoice Sync', 'Lead Enrichment', 'Daily Report Builder', 'Slack Notification Relay',
    'CRM Backfill', 'Data Export Pipeline', 'User Onboarding Flow', 'Webhook Processor',
    'Email Drip Sequence', 'Analytics Aggregator', 'Billing Reconciliation', 'Auth Token Refresh',
  ]
  const statuses: WorkflowRun['status'][] = ['success', 'success', 'success', 'failed', 'running']
  const triggers = ['schedule', 'webhook', 'manual']
  return Array.from({ length: count }, (_, i) => {
    const st = statuses[(i + seed) % statuses.length]
    const started = new Date('2025-06-09T11:45:00Z')
    started.setMinutes(started.getMinutes() - i * 7 - seed)
    return {
      id: `wr_${seed}_${i}`,
      name: names[(i + seed) % names.length],
      status: st,
      startedAt: started.toISOString(),
      duration: st === 'running' ? 0 : Math.round(2 + Math.random() * 58),
      triggeredBy: triggers[(i + seed) % triggers.length],
    }
  })
}

// ─── Mutable static data (allows updateFeatureFlag to persist in session) ────

const FEATURE_FLAGS_POOL: FeatureFlag[] = [
  { id: 'ff_001', label: 'AI Credits', description: 'Enable AI-powered credit estimation on workflow runs', enabled: true, scope: 'global', updatedAt: '2025-05-20T09:00:00Z' },
  { id: 'ff_002', label: 'Advanced Analytics', description: 'Expose detailed execution metrics in the dashboard', enabled: false, scope: 'org', updatedAt: '2025-04-14T15:30:00Z' },
  { id: 'ff_003', label: 'Webhook Retry UI', description: 'Show retry controls directly in the webhook log view', enabled: true, scope: 'global', updatedAt: '2025-06-01T11:00:00Z' },
  { id: 'ff_004', label: 'Multi-region Routing', description: 'Allow workflows to route executions to nearest region', enabled: false, scope: 'namespace', updatedAt: '2025-03-28T08:45:00Z' },
  { id: 'ff_005', label: 'Dark Mode', description: 'Beta dark theme for the customer dashboard', enabled: false, scope: 'org', updatedAt: '2025-05-05T17:20:00Z' },
  { id: 'ff_006', label: 'SAML SSO', description: 'Allow customers to authenticate via their own SAML IdP', enabled: true, scope: 'org', updatedAt: '2025-06-03T08:00:00Z' },
  { id: 'ff_007', label: 'Execution Replay', description: 'Re-run a failed workflow from the point of failure', enabled: false, scope: 'global', updatedAt: '2025-05-28T14:10:00Z' },
]

const CLOUD_ORGS: CloudOrg[] = [
  {
    id: 'org_cloud_001',
    name: 'Prism Analytics',
    status: 'active',
    plan: 'growth',
    createdAt: '2023-02-14T00:00:00Z',
    mrr: 79900,
    activeUsers: 47,
    totalWorkflows: 312,
    apiCallsThisMonth: 1_284_317,
    apiCallsTrend: trend30(42_000, 0.3),
    contactEmail: 'marcus@prismanalytics.io',
    contactName: 'Marcus Chen',
  },
  {
    id: 'org_cloud_002',
    name: 'Helix Commerce',
    status: 'degraded',
    plan: 'starter',
    createdAt: '2024-01-07T00:00:00Z',
    mrr: 19900,
    activeUsers: 8,
    totalWorkflows: 54,
    apiCallsThisMonth: 187_423,
    apiCallsTrend: trend30(6_200, 0.4),
    contactEmail: 'ops@helixcommerce.co',
    contactName: 'Amara Osei',
  },
  {
    id: 'org_cloud_003',
    name: 'Sonar Labs',
    status: 'active',
    plan: 'enterprise',
    createdAt: '2022-09-01T00:00:00Z',
    mrr: 249900,
    activeUsers: 203,
    totalWorkflows: 1_847,
    apiCallsThisMonth: 9_341_782,
    apiCallsTrend: trend30(311_000, 0.2),
    contactEmail: 'infra@sonarlabs.dev',
    contactName: 'Elena Vasquez',
  },
  {
    id: 'org_cloud_004',
    name: 'Dusk Media',
    status: 'suspended',
    plan: 'growth',
    createdAt: '2023-11-22T00:00:00Z',
    mrr: 0,
    activeUsers: 0,
    totalWorkflows: 91,
    apiCallsThisMonth: 0,
    apiCallsTrend: trend30(14_000, 0.1),
    contactEmail: 'billing@duskmedia.fm',
    contactName: 'Tomás Reyes',
  },
  {
    id: 'org_cloud_005',
    name: 'Lattice Health',
    status: 'active',
    plan: 'growth',
    createdAt: '2024-04-11T00:00:00Z',
    mrr: 59900,
    activeUsers: 29,
    totalWorkflows: 178,
    apiCallsThisMonth: 743_891,
    apiCallsTrend: trend30(24_700, 0.35),
    contactEmail: 'eng@latticehealth.io',
    contactName: 'Neha Patel',
  },
  {
    id: 'org_cloud_006',
    name: 'Cobalt Systems',
    status: 'churned',
    plan: 'starter',
    createdAt: '2023-06-03T00:00:00Z',
    mrr: 0,
    activeUsers: 0,
    totalWorkflows: 23,
    apiCallsThisMonth: 0,
    apiCallsTrend: trend30(3_100, 0.05),
    contactEmail: 'admin@cobaltsys.com',
    contactName: 'Oliver Strom',
  },
]

const ONPREM_ORGS: OnPremOrg[] = [
  {
    id: 'org_onprem_001',
    name: 'Meridian Laboratories',
    status: 'active',
    plan: 'self_hosted_enterprise',
    createdAt: '2022-11-03T00:00:00Z',
    licenseExpiresAt: '2026-11-03T00:00:00Z',
    totalNamespaces: 3,
    totalClusters: 2,
    contactEmail: 'infra@meridian-labs.jp',
    contactName: 'Yuki Tanaka',
    namespaces: [
      { id: 'ns_001', name: 'production', orgId: 'org_onprem_001', clusterId: 'cls_001', clusterName: 'tokyo-prod-cluster', status: 'running', version: '3.12.4', lastSeen: '2025-06-09T11:45:00Z', activeWorkflows: 892, executionsToday: 14_837 },
      { id: 'ns_002', name: 'staging', orgId: 'org_onprem_001', clusterId: 'cls_001', clusterName: 'tokyo-prod-cluster', status: 'degraded', version: '3.12.4', lastSeen: '2025-06-09T11:44:00Z', activeWorkflows: 104, executionsToday: 1_203 },
      { id: 'ns_003', name: 'dr-replica', orgId: 'org_onprem_001', clusterId: 'cls_002', clusterName: 'osaka-dr-cluster', status: 'running', version: '3.12.3', lastSeen: '2025-06-09T11:43:00Z', activeWorkflows: 892, executionsToday: 13_901 },
    ],
  },
  {
    id: 'org_onprem_002',
    name: 'Braeburn Financial',
    status: 'active',
    plan: 'self_hosted_enterprise',
    createdAt: '2023-03-15T00:00:00Z',
    licenseExpiresAt: '2025-03-15T00:00:00Z',
    totalNamespaces: 1,
    totalClusters: 1,
    contactEmail: 'devops@braeburn.finance',
    contactName: 'Callum Hartley',
    namespaces: [
      { id: 'ns_004', name: 'production', orgId: 'org_onprem_002', clusterId: 'cls_003', clusterName: 'london-prod-cluster', status: 'running', version: '3.11.9', lastSeen: '2025-06-09T11:42:00Z', activeWorkflows: 347, executionsToday: 6_214 },
    ],
  },
  {
    id: 'org_onprem_003',
    name: 'Vertex Infrastructure',
    status: 'active',
    plan: 'self_hosted_community',
    createdAt: '2024-08-22T00:00:00Z',
    licenseExpiresAt: '2026-08-22T00:00:00Z',
    totalNamespaces: 2,
    totalClusters: 2,
    contactEmail: 'sre@vertex-infra.io',
    contactName: 'Diego Almeida',
    namespaces: [
      { id: 'ns_005', name: 'us-west', orgId: 'org_onprem_003', clusterId: 'cls_004', clusterName: 'sf-k8s-01', status: 'down', version: '3.12.1', lastSeen: '2025-06-09T09:17:00Z', activeWorkflows: 0, executionsToday: 0 },
      { id: 'ns_006', name: 'us-east', orgId: 'org_onprem_003', clusterId: 'cls_005', clusterName: 'nyc-k8s-01', status: 'running', version: '3.12.1', lastSeen: '2025-06-09T11:45:00Z', activeWorkflows: 213, executionsToday: 4_107 },
    ],
  },
]

// Per-namespace static detail overrides
const NS_DETAIL_OVERRIDES: Record<string, Partial<NamespaceDetail>> = {
  ns_001: { region: 'ap-northeast-1', kubernetesVersion: '1.29.3', nodeCount: 8, cpuUsage: 61, memoryUsage: 72, diskUsage: 41, uptime: 99.97 },
  ns_002: { region: 'ap-northeast-1', kubernetesVersion: '1.29.3', nodeCount: 4, cpuUsage: 78, memoryUsage: 84, diskUsage: 53, uptime: 97.3 },
  ns_003: { region: 'ap-northeast-3', kubernetesVersion: '1.28.9', nodeCount: 6, cpuUsage: 43, memoryUsage: 55, diskUsage: 29, uptime: 99.91 },
  ns_004: { region: 'eu-west-2', kubernetesVersion: '1.29.1', nodeCount: 5, cpuUsage: 38, memoryUsage: 49, diskUsage: 22, uptime: 99.99 },
  ns_005: { region: 'us-west-2', kubernetesVersion: '1.28.6', nodeCount: 0, cpuUsage: 0, memoryUsage: 0, diskUsage: 71, uptime: 0 },
  ns_006: { region: 'us-east-1', kubernetesVersion: '1.28.6', nodeCount: 3, cpuUsage: 29, memoryUsage: 44, diskUsage: 18, uptime: 99.82 },
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchOverviewStats(): Promise<OverviewStats> {
  await delay(); maybeThrow()
  const totalMrr = CLOUD_ORGS.reduce((s, o) => s + o.mrr, 0)
  return {
    totalCloudOrgs: CLOUD_ORGS.length,
    totalOnPremOrgs: ONPREM_ORGS.length,
    totalActiveUsers: 1_238,
    totalApiCallsToday: 287_419,
    degradedOrDownCount: 3,
    mrr: totalMrr,
    cloudOrgsTrend: trend30(4, 0.15),
    apiCallsTrend: trend30(9_000, 0.35),
  }
}

export async function fetchCloudOrgs(): Promise<CloudOrg[]> {
  await delay(); maybeThrow()
  return [...CLOUD_ORGS]
}

export async function fetchCloudOrg(id: string): Promise<CloudOrgDetail> {
  await delay(); maybeThrow()
  const base = CLOUD_ORGS.find((o) => o.id === id)
  if (!base) throw new Error(`Cloud org ${id} not found`)

  const invoiceBase = base.mrr || 19900
  return {
    ...base,
    billingCycle: id === 'org_cloud_003' ? 'annual' : 'monthly',
    nextBillingDate: '2025-07-01T00:00:00Z',
    paymentMethod: id === 'org_cloud_001' ? 'Visa ●●●● 4242' : id === 'org_cloud_003' ? 'ACH ●●●● 8811' : 'Visa ●●●● 9102',
    invoices: [
      { id: `inv_${id}_001`, amount: invoiceBase, status: 'paid', issuedAt: '2025-05-01T00:00:00Z', paidAt: '2025-05-03T00:00:00Z', downloadUrl: '#' },
      { id: `inv_${id}_002`, amount: invoiceBase, status: 'paid', issuedAt: '2025-04-01T00:00:00Z', paidAt: '2025-04-02T00:00:00Z', downloadUrl: '#' },
      { id: `inv_${id}_003`, amount: invoiceBase, status: id === 'org_cloud_002' ? 'failed' : 'paid', issuedAt: '2025-03-01T00:00:00Z', paidAt: id === 'org_cloud_002' ? null : '2025-03-04T00:00:00Z', downloadUrl: '#' },
    ],
    featureFlags: FEATURE_FLAGS_POOL.slice(0, 5),
    envVars: [
      { id: `${id}_ev_001`, key: 'DATABASE_URL', value: 'postgres://user:s3cr3t@db.internal/refold', isSecret: true, updatedAt: '2025-05-01T00:00:00Z' },
      { id: `${id}_ev_002`, key: 'WEBHOOK_SECRET', value: 'whsec_abc123xyz789', isSecret: true, updatedAt: '2025-04-18T00:00:00Z' },
      { id: `${id}_ev_003`, key: 'APP_ENV', value: 'production', isSecret: false, updatedAt: '2025-03-10T00:00:00Z' },
      { id: `${id}_ev_004`, key: 'LOG_LEVEL', value: 'info', isSecret: false, updatedAt: '2025-02-22T00:00:00Z' },
    ],
    apiKeys: [
      { id: `${id}_ak_001`, label: 'Production API Key', prefix: 'rfd_live_', createdAt: '2024-01-15T00:00:00Z', lastUsedAt: '2025-06-09T08:31:00Z', expiresAt: null },
      { id: `${id}_ak_002`, label: 'CI Integration Key', prefix: 'rfd_ci_', createdAt: '2024-07-03T00:00:00Z', lastUsedAt: '2025-06-08T22:04:00Z', expiresAt: '2026-07-03T00:00:00Z' },
    ],
    workflowExecutionsTrend: trend30(base.totalWorkflows > 500 ? 1_200 : 480, 0.28),
    errorBreakdown: [
      { type: 'Timeout', count: 147, color: '#ef4444' },
      { type: 'Auth failure', count: 89, color: '#f59e0b' },
      { type: 'Rate limit', count: 63, color: '#6366F1' },
      { type: 'Parse error', count: 31, color: '#8b5cf6' },
    ],
  }
}

// Per-org detail metrics for the 5-tab cloud org detail page (Prompt 5.5).
// Numbers are intentionally non-round and scaled off each org's size.
const CLOUD_METRIC_OVERRIDES: Record<
  string,
  { tenants: number; activeTenants: number; newTenants: number; storageUsed: number; storageLimit: number; successRate: number; execToday: number }
> = {
  org_cloud_001: { tenants: 214, activeTenants: 187, newTenants: 12, storageUsed: 418, storageLimit: 1024, successRate: 98.3, execToday: 24_718 },
  org_cloud_002: { tenants: 41, activeTenants: 33, newTenants: 3, storageUsed: 74, storageLimit: 256, successRate: 91.6, execToday: 2_143 },
  org_cloud_003: { tenants: 1_206, activeTenants: 1_094, newTenants: 47, storageUsed: 3_887, storageLimit: 8_192, successRate: 99.1, execToday: 148_902 },
  org_cloud_004: { tenants: 58, activeTenants: 0, newTenants: 0, storageUsed: 61, storageLimit: 512, successRate: 0, execToday: 0 },
  org_cloud_005: { tenants: 133, activeTenants: 118, newTenants: 9, storageUsed: 247, storageLimit: 512, successRate: 97.4, execToday: 11_326 },
  org_cloud_006: { tenants: 12, activeTenants: 0, newTenants: 0, storageUsed: 9, storageLimit: 128, successRate: 0, execToday: 0 },
}

const WORKFLOW_DEF_NAMES = [
  'Invoice Sync', 'Lead Enrichment', 'Daily Report Builder', 'Slack Notification Relay',
  'CRM Backfill', 'Data Export Pipeline', 'User Onboarding Flow', 'Webhook Processor',
  'Email Drip Sequence', 'Analytics Aggregator',
]

function workflowSummaries(count: number, seed: number, live: boolean): WorkflowSummary[] {
  return Array.from({ length: count }, (_, i) => {
    const paused = !live || (i + seed) % 5 === 4
    const lastRun = new Date('2025-06-09T11:40:00Z')
    lastRun.setMinutes(lastRun.getMinutes() - (i * 23 + seed * 7))
    return {
      id: `wfd_${seed}_${i}`,
      name: WORKFLOW_DEF_NAMES[(i + seed) % WORKFLOW_DEF_NAMES.length],
      status: paused ? 'paused' : 'active',
      lastRun: lastRun.toISOString(),
      executions7d: paused ? Math.round(20 + Math.random() * 120) : Math.round(340 + Math.random() * 4_200),
      successRate: paused ? 0 : Math.round((93 + Math.random() * 6.8) * 10) / 10,
      avgDurationMs: Math.round(1_200 + Math.random() * 46_000),
    }
  })
}

function connectorsFor(seed: number, live: boolean): Connector[] {
  const defs: Array<{ name: string; type: string }> = [
    { name: 'Salesforce', type: 'CRM' },
    { name: 'Stripe', type: 'Payments' },
    { name: 'Slack', type: 'Messaging' },
    { name: 'PostgreSQL', type: 'Database' },
    { name: 'HubSpot', type: 'Marketing' },
    { name: 'AWS S3', type: 'Storage' },
  ]
  return defs.map((d, i) => {
    // Ensure at least one connector trips the >5% red error-rate rule.
    const errorRate =
      i === 1 ? 7.4 : Math.round(Math.random() * 4.5 * 10) / 10
    const status: Connector['status'] =
      !live ? 'down' : i === 1 ? 'degraded' : 'active'
    const lastActivity = new Date('2025-06-09T11:45:00Z')
    lastActivity.setMinutes(lastActivity.getMinutes() - (i * 4 + seed))
    return {
      id: `conn_${seed}_${i}`,
      name: d.name,
      type: d.type,
      status,
      callsToday: live ? Math.round(1_400 + Math.random() * 38_000) : 0,
      errorRate: live ? errorRate : 0,
      lastActivity: lastActivity.toISOString(),
    }
  })
}

export async function fetchCloudOrgMetrics(orgId: string): Promise<CloudOrgMetrics> {
  await delay(); maybeThrow()
  const org = CLOUD_ORGS.find((o) => o.id === orgId)
  if (!org) throw new Error(`Cloud org ${orgId} not found`)

  const m = CLOUD_METRIC_OVERRIDES[orgId] ?? {
    tenants: 87, activeTenants: 72, newTenants: 5, storageUsed: 140, storageLimit: 512, successRate: 96.2, execToday: 7_450,
  }
  const live = org.status === 'active' || org.status === 'degraded'
  const seed = orgId.charCodeAt(orgId.length - 1)

  // Tenant growth over the last 6 months, trending toward the current total.
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const tenantGrowth = months.map((label, i) => ({
    label,
    value: Math.round(m.tenants * (0.62 + i * 0.076) * (1 + (Math.random() - 0.5) * 0.06)),
  }))

  return {
    orgId,
    activeTenants: m.activeTenants,
    executionsToday: m.execToday,
    successRate: m.successRate,
    tenants: { total: m.tenants, active: m.activeTenants, newThisMonth: m.newTenants },
    tenantGrowth,
    apiCallsThisMonth: org.apiCallsThisMonth,
    storageUsedGb: m.storageUsed,
    storageLimitGb: m.storageLimit,
    activeUsers: org.activeUsers,
    workflows: {
      total: org.totalWorkflows,
      active: live ? Math.round(org.totalWorkflows * 0.71) : 0,
      executionsToday: m.execToday,
      avgExecutionMs: live ? Math.round(2_400 + Math.random() * 9_000) : 0,
    },
    workflowList: workflowSummaries(10, seed, live),
    connectors: connectorsFor(seed, live),
  }
}

export async function fetchOnPremOrgs(): Promise<OnPremOrg[]> {
  await delay(); maybeThrow()
  return [...ONPREM_ORGS]
}

export async function fetchOnPremOrg(id: string): Promise<OnPremOrg> {
  await delay(); maybeThrow()
  const org = ONPREM_ORGS.find((o) => o.id === id)
  if (!org) throw new Error(`On-prem org ${id} not found`)
  return { ...org }
}

// Latest Refold release available for on-prem upgrades. Set to the max version
// present in the dataset so both "upgrade available" and "up to date" (green
// check) states render across the namespace tables (Prompt 5.6).
const LATEST_REFOLD_VERSION = '3.12.4'

// Per-namespace creation dates (base Namespace has no createdAt).
const ONPREM_NS_CREATED: Record<string, string> = {
  ns_001: '2022-11-10T00:00:00Z',
  ns_002: '2023-02-01T00:00:00Z',
  ns_003: '2023-05-19T00:00:00Z',
  ns_004: '2023-03-22T00:00:00Z',
  ns_005: '2024-09-04T00:00:00Z',
  ns_006: '2024-09-04T00:00:00Z',
}

export async function fetchOnPremOrgDetail(orgId: string): Promise<OnPremOrgDetail> {
  await delay(); maybeThrow()
  const org = ONPREM_ORGS.find((o) => o.id === orgId)
  if (!org) throw new Error(`On-prem org ${orgId} not found`)

  const namespaces: OnPremNamespaceRow[] = org.namespaces.map((ns) => ({
    ...ns,
    createdAt: ONPREM_NS_CREATED[ns.id] ?? org.createdAt,
  }))

  return {
    org: { ...org },
    latestVersion: LATEST_REFOLD_VERSION,
    namespaces,
  }
}

export async function fetchNamespaceDetail(nsId: string): Promise<NamespaceDetail> {
  await delay(); maybeThrow()
  const ns = ONPREM_ORGS.flatMap((o) => o.namespaces).find((n) => n.id === nsId)
  if (!ns) throw new Error(`Namespace ${nsId} not found`)

  const overrides = NS_DETAIL_OVERRIDES[nsId] ?? {}
  const seed = nsId.charCodeAt(nsId.length - 1)

  return {
    ...ns,
    region: 'ap-northeast-1',
    kubernetesVersion: '1.29.3',
    nodeCount: 6,
    cpuUsage: 43,
    memoryUsage: 67,
    diskUsage: 29,
    uptime: 99.7,
    ...overrides,
    executionsTrend: trend30(ns.executionsToday || 500, 0.25),
    featureFlags: FEATURE_FLAGS_POOL.slice(1, 5),
    envVars: [
      { id: `${nsId}_ev_001`, key: 'N8N_ENCRYPTION_KEY', value: 'enc_xg8vu91kp3mz', isSecret: true, updatedAt: '2025-05-22T00:00:00Z' },
      { id: `${nsId}_ev_002`, key: 'DB_HOST', value: 'pg-primary.internal', isSecret: false, updatedAt: '2025-04-01T00:00:00Z' },
      { id: `${nsId}_ev_003`, key: 'REDIS_URL', value: 'redis://:s3cr3t@redis.internal:6379', isSecret: true, updatedAt: '2025-03-17T00:00:00Z' },
      { id: `${nsId}_ev_004`, key: 'NODE_ENV', value: ns.name === 'production' ? 'production' : 'staging', isSecret: false, updatedAt: '2025-01-10T00:00:00Z' },
    ],
    logs: [
      { id: `${nsId}_log_001`, timestamp: '2025-06-09T11:44:52Z', level: 'warn', message: 'Workflow execution queue depth exceeds threshold (1200)', source: 'queue-manager' },
      { id: `${nsId}_log_002`, timestamp: '2025-06-09T11:42:17Z', level: 'error', message: 'Database connection pool exhausted', source: 'db-connector' },
      { id: `${nsId}_log_003`, timestamp: '2025-06-09T11:40:01Z', level: 'info', message: 'Auto-scaler triggered: +2 nodes requested', source: 'autoscaler' },
      { id: `${nsId}_log_004`, timestamp: '2025-06-09T11:37:44Z', level: 'info', message: 'Health check passed for all 3 worker pods', source: 'health-monitor' },
      { id: `${nsId}_log_005`, timestamp: '2025-06-09T11:31:09Z', level: 'warn', message: 'Slow query detected: execution_history scan took 4.2s', source: 'db-connector' },
    ],
    errorBreakdown: [
      { type: 'Timeout', count: 312, color: '#ef4444' },
      { type: 'Connection refused', count: 178, color: '#f59e0b' },
      { type: 'OOM killed', count: 54, color: '#6366F1' },
      { type: 'Config error', count: 27, color: '#8b5cf6' },
    ],
    recentWorkflows: workflowRuns(8, seed),
  }
}

export async function fetchFeatureFlags(): Promise<FeatureFlag[]> {
  await delay(); maybeThrow()
  return [...FEATURE_FLAGS_POOL]
}

export async function updateFeatureFlag(id: string, enabled: boolean): Promise<FeatureFlag> {
  await delay()
  const flag = FEATURE_FLAGS_POOL.find((f) => f.id === id)
  if (!flag) throw new Error(`Feature flag ${id} not found`)
  flag.enabled = enabled
  flag.updatedAt = new Date().toISOString()
  return { ...flag }
}

export async function fetchCloudDashboard(orgId: string): Promise<CloudDashboard> {
  await delay(); maybeThrow()
  const org = CLOUD_ORGS.find((o) => o.id === orgId) ?? CLOUD_ORGS[0]
  return {
    org,
    recentWorkflows: workflowRuns(6, 1),
    errorRate: 1.7,
    uptime: 99.93,
  }
}

export async function fetchOnPremDashboard(orgId: string): Promise<OnPremDashboard> {
  await delay(); maybeThrow()
  const org = ONPREM_ORGS.find((o) => o.id === orgId) ?? ONPREM_ORGS[0]
  const degradedNamespaces = org.namespaces.filter(
    (n) => n.status === 'degraded' || n.status === 'down'
  ).length
  const totalExecutionsToday = org.namespaces.reduce((s, n) => s + n.executionsToday, 0)
  return {
    org,
    recentWorkflows: workflowRuns(6, 3),
    totalExecutionsToday,
    degradedNamespaces,
    errorRate: 2.3,
    uptime: degradedNamespaces > 0 ? 97.8 : 99.95,
  }
}

export async function fetchAiCredits(orgId: string): Promise<AiCredits> {
  await delay(); maybeThrow()
  const byOrg: Record<string, Pick<AiCredits, 'balance' | 'used' | 'limit'>> = {
    org_cloud_001: { balance: 42_317, used: 57_683, limit: 100_000 },
    org_cloud_002: { balance: 8_104, used: 1_896, limit: 10_000 },
    org_cloud_003: { balance: 201_443, used: 298_557, limit: 500_000 },
    org_cloud_004: { balance: 0, used: 0, limit: 50_000 },
    org_cloud_005: { balance: 27_881, used: 22_119, limit: 50_000 },
    org_cloud_006: { balance: 0, used: 0, limit: 10_000 },
    org_onprem_001: { balance: 63_204, used: 186_796, limit: 250_000 },
    org_onprem_002: { balance: 12_771, used: 37_229, limit: 50_000 },
    org_onprem_003: { balance: 4_302, used: 5_698, limit: 10_000 },
  }
  const credits = byOrg[orgId] ?? { balance: 25_000, used: 25_000, limit: 50_000 }
  return {
    orgId,
    ...credits,
    resetDate: '2025-07-01T00:00:00Z',
    usageTrend: trend30(Math.round(credits.used / 30), 0.4),
  }
}

export async function searchAll(query: string): Promise<SearchResult[]> {
  await delay()
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const org of CLOUD_ORGS) {
    if (org.name.toLowerCase().includes(q) || org.contactEmail.toLowerCase().includes(q)) {
      results.push({ type: 'cloud_org', id: org.id, label: org.name, sublabel: `Cloud · ${org.plan}`, href: `/cloud-customers/${org.id}` })
    }
  }
  for (const org of ONPREM_ORGS) {
    if (org.name.toLowerCase().includes(q) || org.contactEmail.toLowerCase().includes(q)) {
      results.push({ type: 'onprem_org', id: org.id, label: org.name, sublabel: `On-Prem · ${org.plan}`, href: `/onprem-customers/${org.id}` })
    }
    for (const ns of org.namespaces) {
      if (ns.name.toLowerCase().includes(q) || ns.clusterName.toLowerCase().includes(q)) {
        results.push({ type: 'namespace', id: ns.id, orgId: org.id, label: ns.name, sublabel: `${org.name} · ${ns.clusterName}`, href: `/onprem-customers/${org.id}/namespaces/${ns.id}` })
      }
    }
  }
  return results
}
