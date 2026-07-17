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

export interface AiCredits {
  orgId: string
  balance: number
  used: number
  limit: number
  resetDate: string
  usageTrend: TrendPoint[]
}

export interface SearchResult {
  type: 'cloud_org' | 'onprem_org' | 'namespace'
  id: string
  orgId?: string
  label: string
  sublabel: string
  href: string
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  orgId?: string
}

export interface AuthContextValue {
  user: AuthUser
  role: UserRole
  setRole: (role: UserRole) => void
}
