export type UserRole = 'super_admin' | 'cloud_customer_admin' | 'onprem_customer_admin'

export type OrgStatus = 'active' | 'suspended' | 'churned' | 'degraded'
export type HealthStatus = 'healthy' | 'degraded' | 'down'
export type NamespaceStatus = 'running' | 'degraded' | 'down'
export type WorkflowStatus = 'success' | 'failed' | 'running'
export type InvoiceStatus = 'paid' | 'pending' | 'failed'
export type FlagScope = 'global' | 'org' | 'namespace'

export interface TrendPoint {
  date: string
  value: number
}

export interface ErrorBreakdownItem {
  type: string
  count: number
  color: string
}

export interface FeatureFlag {
  id: string
  label: string
  description: string
  enabled: boolean
  scope: FlagScope
  updatedAt: string
}

export interface EnvVar {
  id: string
  key: string
  value: string
  isSecret: boolean
  updatedAt: string
}

export interface ApiKey {
  id: string
  label: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export interface Invoice {
  id: string
  amount: number
  status: InvoiceStatus
  issuedAt: string
  paidAt: string | null
  downloadUrl: string
}

export interface WorkflowRun {
  id: string
  name: string
  status: WorkflowStatus
  startedAt: string
  duration: number
  triggeredBy: string
}

export interface Namespace {
  id: string
  name: string
  orgId: string
  clusterId: string
  clusterName: string
  status: NamespaceStatus
  version: string
  lastSeen: string
  activeWorkflows: number
  executionsToday: number
}

export interface NamespaceDetail extends Namespace {
  region: string
  kubernetesVersion: string
  nodeCount: number
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  executionsTrend: TrendPoint[]
  apiCallsTrend: TrendPoint[]
  latestVersion: string
  featureFlags: FeatureFlag[]
  envVars: EnvVar[]
  logs: LogEntry[]
  errorBreakdown: ErrorBreakdownItem[]
  recentWorkflows: WorkflowRun[]
  uptime: number
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  source: string
}

export interface CloudOrg {
  id: string
  name: string
  status: OrgStatus
  plan: string
  createdAt: string
  mrr: number
  activeUsers: number
  totalWorkflows: number
  apiCallsThisMonth: number
  apiCallsTrend: TrendPoint[]
  contactEmail: string
  contactName: string
}

export type WorkflowDefStatus = 'active' | 'paused'
export type ConnectorStatus = 'active' | 'degraded' | 'down'

export interface BarPoint {
  label: string
  value: number
}

export interface TenantStats {
  total: number
  active: number
  newThisMonth: number
}

export interface WorkflowMetrics {
  total: number
  active: number
  executionsToday: number
  avgExecutionMs: number
}

export interface WorkflowSummary {
  id: string
  name: string
  status: WorkflowDefStatus
  lastRun: string
  executions7d: number
  successRate: number
  avgDurationMs: number
}

export interface Connector {
  id: string
  name: string
  type: string
  status: ConnectorStatus
  callsToday: number
  errorRate: number
  lastActivity: string
}

// Shared shape for the 5-tab detail sections, reused by both the cloud org
// detail page (5.5) and the on-prem namespace detail page (5.7). Scoped by
// whichever id the container's fetcher was called with.
export interface DetailMetrics {
  id: string
  activeTenants: number
  executionsToday: number
  successRate: number
  tenants: TenantStats
  tenantGrowth: BarPoint[]
  apiCallsThisMonth: number
  storageUsedGb: number
  storageLimitGb: number
  activeUsers: number
  workflows: WorkflowMetrics
  workflowList: WorkflowSummary[]
  connectors: Connector[]
}

// Normalized chart series the detail sections consume, selected from either
// CloudOrgDetail or NamespaceDetail so the sections stay data-source-agnostic.
export interface DetailCharts {
  executionsTrend: TrendPoint[]
  apiCallsTrend: TrendPoint[]
  errorBreakdown: ErrorBreakdownItem[]
}

// Minimal structural view of a TanStack Query result, so shared presentational
// sections can accept a query without importing the query library.
export interface QueryLike<T> {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export interface CloudOrgDetail extends CloudOrg {
  billingCycle: 'monthly' | 'annual'
  nextBillingDate: string
  paymentMethod: string
  invoices: Invoice[]
  featureFlags: FeatureFlag[]
  envVars: EnvVar[]
  apiKeys: ApiKey[]
  workflowExecutionsTrend: TrendPoint[]
  errorBreakdown: ErrorBreakdownItem[]
}

export interface OnPremOrg {
  id: string
  name: string
  status: OrgStatus
  plan: string
  createdAt: string
  licenseExpiresAt: string
  totalNamespaces: number
  totalClusters: number
  contactEmail: string
  contactName: string
  namespaces: Namespace[]
}

export interface OnPremNamespaceRow extends Namespace {
  createdAt: string
}

export interface OnPremOrgDetail {
  org: OnPremOrg
  latestVersion: string
  namespaces: OnPremNamespaceRow[]
}

export interface OverviewStats {
  totalCloudOrgs: number
  totalOnPremOrgs: number
  totalActiveUsers: number
  totalApiCallsToday: number
  degradedOrDownCount: number
  mrr: number
  cloudOrgsTrend: TrendPoint[]
  apiCallsTrend: TrendPoint[]
}

export interface CloudDashboard {
  org: CloudOrg
  recentWorkflows: WorkflowRun[]
  errorRate: number
  uptime: number
}

export interface OnPremDashboard {
  org: OnPremOrg
  recentWorkflows: WorkflowRun[]
  totalExecutionsToday: number
  degradedNamespaces: number
  errorRate: number
  uptime: number
}

export interface CreditConsumer {
  name: string
  credits: number
  percent: number
}

export interface AiCredits {
  orgId: string
  balance: number
  used: number
  limit: number
  resetDate: string
  usageTrend: TrendPoint[]
  topConsumers: CreditConsumer[]
}

export type SearchResultType = 'org' | 'namespace' | 'connector'

export interface SearchResultItem {
  type: SearchResultType
  id: string
  name: string
  breadcrumb: string
  href: string
}

export interface SearchResults {
  organizations: SearchResultItem[]
  namespaces: SearchResultItem[]
  connectors: SearchResultItem[]
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  orgId?: string
}

// Compat shape consumed by the existing 5.x pages/guards (Phase 6 — D-033).
export interface AuthContextValue {
  user: AuthUser
  role: UserRole
}

// ── Supabase-backed identity (Phase 6 — matches the Postgres schema § 4) ──────
export type AccountType = 'super_admin' | 'cloud_customer' | 'onprem_customer'
export type MemberRole = 'owner' | 'member'
export type UserStatus = 'invited' | 'active' | 'disabled'
export type DeploymentType = 'cloud' | 'on_premise' | 'internal'

export interface ProfileOrg {
  name: string
  deploymentType: DeploymentType
  externalRef: string | null
}

export interface Profile {
  id: string
  email: string
  fullName: string | null
  orgId: string
  accountType: AccountType
  role: MemberRole
  subRoleId: string | null
  status: UserStatus
  org: ProfileOrg | null
}

// ── RBAC / provisioning (Phase 6.4 — matches the Postgres schema § 4) ──────────
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface SubRole {
  id: string
  accountType: AccountType
  orgId: string | null // null = system/global sub-role (D-032)
  name: string
  permissions: Record<string, boolean>
  isSystem: boolean
}

// A super-admin profile row rendered in the admin management table. Joins the
// sub-role name for display.
export interface ManagedUser {
  id: string
  email: string
  fullName: string | null
  accountType: AccountType
  role: MemberRole
  status: UserStatus
  subRoleId: string | null
  subRoleName: string | null
  createdAt: string
}

export interface Invitation {
  id: string
  email: string
  orgId: string
  accountType: AccountType
  role: MemberRole
  status: InvitationStatus
  createdAt: string
  expiresAt: string
  orgName: string | null
}
