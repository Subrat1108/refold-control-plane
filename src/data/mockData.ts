import type {
  CloudOrg,
  CloudOrgDetail,
  OnPremOrg,
  NamespaceDetail,
  FeatureFlag,
  OverviewStats,
  CloudDashboard,
  TrendPoint,
  WorkflowRun,
} from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const delay = () => new Promise<void>((r) => setTimeout(r, 200))

function maybeThrow() {
  if (Math.random() < 0.1) throw new Error('Simulated server error')
}

function trend30(base: number, variance: number): TrendPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date('2025-05-11')
    d.setDate(d.getDate() + i)
    const v = Math.round(base * (1 + (Math.random() - 0.5) * variance))
    return { date: d.toISOString().slice(0, 10), value: v }
  })
}

// ─── Static Data ─────────────────────────────────────────────────────────────

const FEATURE_FLAGS_POOL: FeatureFlag[] = [
  { id: 'ff_001', label: 'AI Credits', description: 'Enable AI-powered credit estimation on workflow runs', enabled: true, scope: 'global', updatedAt: '2025-05-20T09:00:00Z' },
  { id: 'ff_002', label: 'Advanced Analytics', description: 'Expose detailed execution metrics in the dashboard', enabled: false, scope: 'org', updatedAt: '2025-04-14T15:30:00Z' },
  { id: 'ff_003', label: 'Webhook Retry UI', description: 'Show retry controls directly in the webhook log view', enabled: true, scope: 'global', updatedAt: '2025-06-01T11:00:00Z' },
  { id: 'ff_004', label: 'Multi-region Routing', description: 'Allow workflows to route executions to nearest region', enabled: false, scope: 'namespace', updatedAt: '2025-03-28T08:45:00Z' },
  { id: 'ff_005', label: 'Dark Mode', description: 'Beta dark theme for the customer dashboard', enabled: false, scope: 'org', updatedAt: '2025-05-05T17:20:00Z' },
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchOverviewStats(): Promise<OverviewStats> {
  await delay(); maybeThrow()
  return {
    totalCloudOrgs: CLOUD_ORGS.length,
    totalOnPremOrgs: ONPREM_ORGS.length,
    totalActiveUsers: 1_238,
    totalApiCallsToday: 287_419,
    degradedOrDownCount: 2,
    mrr: 369_700,
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
  return {
    ...base,
    billingCycle: 'monthly',
    nextBillingDate: '2025-07-01T00:00:00Z',
    paymentMethod: 'Visa ●●●● 4242',
    invoices: [
      { id: 'inv_001', amount: base.mrr, status: 'paid', issuedAt: '2025-05-01T00:00:00Z', paidAt: '2025-05-03T00:00:00Z', downloadUrl: '#' },
      { id: 'inv_002', amount: base.mrr, status: 'paid', issuedAt: '2025-04-01T00:00:00Z', paidAt: '2025-04-02T00:00:00Z', downloadUrl: '#' },
    ],
    featureFlags: FEATURE_FLAGS_POOL.slice(0, 3),
    envVars: [
      { id: 'ev_001', key: 'DATABASE_URL', value: 'postgres://user:pass@host/db', isSecret: true, updatedAt: '2025-05-01T00:00:00Z' },
      { id: 'ev_002', key: 'WEBHOOK_SECRET', value: 'whsec_abc123xyz', isSecret: true, updatedAt: '2025-04-18T00:00:00Z' },
      { id: 'ev_003', key: 'APP_ENV', value: 'production', isSecret: false, updatedAt: '2025-03-10T00:00:00Z' },
    ],
    apiKeys: [
      { id: 'ak_001', label: 'Production API Key', prefix: 'rfd_live_', createdAt: '2024-01-15T00:00:00Z', lastUsedAt: '2025-06-09T08:31:00Z', expiresAt: null },
    ],
    workflowExecutionsTrend: trend30(480, 0.28),
    errorBreakdown: [
      { type: 'Timeout', count: 147, color: '#ef4444' },
      { type: 'Auth failure', count: 89, color: '#f59e0b' },
      { type: 'Rate limit', count: 63, color: '#6366F1' },
      { type: 'Parse error', count: 31, color: '#8b5cf6' },
    ],
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

export async function fetchNamespaceDetail(nsId: string): Promise<NamespaceDetail> {
  await delay(); maybeThrow()
  const ns = ONPREM_ORGS.flatMap((o) => o.namespaces).find((n) => n.id === nsId)
  if (!ns) throw new Error(`Namespace ${nsId} not found`)
  return {
    ...ns,
    region: 'ap-northeast-1',
    kubernetesVersion: '1.29.3',
    nodeCount: 6,
    cpuUsage: 43,
    memoryUsage: 67,
    diskUsage: 29,
    executionsTrend: trend30(14_000, 0.2),
    featureFlags: FEATURE_FLAGS_POOL.slice(1, 4),
    envVars: [
      { id: 'nsev_001', key: 'N8N_ENCRYPTION_KEY', value: 'enc_xg8vu91kp', isSecret: true, updatedAt: '2025-05-22T00:00:00Z' },
      { id: 'nsev_002', key: 'DB_HOST', value: 'pg-primary.internal', isSecret: false, updatedAt: '2025-04-01T00:00:00Z' },
    ],
    logs: [
      { id: 'log_001', timestamp: '2025-06-09T11:44:52Z', level: 'warn', message: 'Workflow execution queue depth exceeds threshold (1200)', source: 'queue-manager' },
      { id: 'log_002', timestamp: '2025-06-09T11:42:17Z', level: 'error', message: 'Database connection pool exhausted', source: 'db-connector' },
      { id: 'log_003', timestamp: '2025-06-09T11:40:01Z', level: 'info', message: 'Auto-scaler triggered: +2 nodes requested', source: 'autoscaler' },
    ],
    errorBreakdown: [
      { type: 'Timeout', count: 312, color: '#ef4444' },
      { type: 'Connection refused', count: 178, color: '#f59e0b' },
      { type: 'OOM killed', count: 54, color: '#6366F1' },
    ],
    uptime: 99.7,
  }
}

export async function fetchFeatureFlags(): Promise<FeatureFlag[]> {
  await delay(); maybeThrow()
  return [...FEATURE_FLAGS_POOL]
}

export async function fetchCloudDashboard(orgId: string): Promise<CloudDashboard> {
  await delay(); maybeThrow()
  const org = CLOUD_ORGS.find((o) => o.id === orgId) ?? CLOUD_ORGS[0]
  const recentWorkflows: WorkflowRun[] = [
    { id: 'wr_001', name: 'Invoice Sync', status: 'success', startedAt: '2025-06-09T11:40:00Z', duration: 3, triggeredBy: 'schedule' },
    { id: 'wr_002', name: 'Lead Enrichment', status: 'failed', startedAt: '2025-06-09T11:38:00Z', duration: 17, triggeredBy: 'webhook' },
    { id: 'wr_003', name: 'Daily Report Builder', status: 'success', startedAt: '2025-06-09T11:00:00Z', duration: 42, triggeredBy: 'schedule' },
    { id: 'wr_004', name: 'Slack Notification Relay', status: 'running', startedAt: '2025-06-09T11:45:00Z', duration: 0, triggeredBy: 'webhook' },
  ]
  return { org, recentWorkflows, errorRate: 1.7, uptime: 99.93 }
}
