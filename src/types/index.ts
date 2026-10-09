export type UserRole = 'super_admin' | 'cloud_customer_admin' | 'onprem_customer_admin'

export type OrgStatus = 'active' | 'suspended' | 'churned' | 'degraded'
export type HealthStatus = 'healthy' | 'degraded' | 'down'
// R2 (D-049/D-050): on-prem hierarchy is cluster → namespace → org → tenant. A
// namespace or cluster can be decommissioned (local/ephemeral — D-052).
export type NamespaceStatus = 'running' | 'degraded' | 'down' | 'decommissioned'
export type ClusterStatus = 'active' | 'decommissioned'
export type WorkflowStatus = 'success' | 'failed' | 'running'
export type InvoiceStatus = 'paid' | 'pending' | 'failed'
// R2b (D-053): feature flags scope at four levels of the on-prem hierarchy.
export type FlagScope = 'global' | 'cluster' | 'namespace' | 'org'

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

// R2: a namespace is infra hosting multiple orgs. Its detail carries the header
// facts + namespace-level env vars (D-051 — tenants/metrics moved to NamespaceOrg).
export interface NamespaceDetail extends Namespace {
  region: string
  kubernetesVersion: string
  nodeCount: number
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  latestVersion: string
  envVars: EnvVar[]
  logs: LogEntry[]
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

// R2 (D-050): cluster is first-class. A customer org owns clusters; a cluster
// hosts namespaces; a namespace hosts orgs (NamespaceOrg).
export interface Cluster {
  id: string
  customerOrgId: string
  name: string
  region?: string
  status: ClusterStatus
  createdAt: string
}

export interface OnPremClusterGroup {
  cluster: Cluster
  namespaces: OnPremNamespaceRow[]
}

export interface OnPremOrgDetail {
  org: OnPremOrg
  latestVersion: string
  clusters: OnPremClusterGroup[]
}

// R2 (D-051): the org WITHIN a namespace (displayed in the UI as "Organizations").
// Named NamespaceOrg to avoid colliding with the top-level customer Organization.
// Tenants + ALL metrics are scoped by this entity, not the namespace.
export interface NamespaceOrg {
  id: string
  namespaceId: string
  name: string
  plan?: string
  status: OrgStatus
  createdAt: string
  contactName?: string
  contactEmail?: string
  tenants: number      // summary counts for the list table
  activeUsers: number
}

export interface NamespaceOrgDetail extends NamespaceOrg {
  executionsTrend: TrendPoint[]
  apiCallsTrend: TrendPoint[]
  errorBreakdown: ErrorBreakdownItem[]
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
  reportsTo: string | null // optional, UX only — never permissions
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
  reportsTo: string | null // optional, UX only — never permissions
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

// ── Phase 7 — Refold CS Hub (build-spec-v3 § 5). Backend only this session (7.1)
// — no UI wiring yet. Mirrors the Postgres schema in supabase/migrations/
// 20261007*.sql. Distinct from the existing mock CloudOrg/OnPremOrg shapes
// (those stay as-is, still backing the frozen customer-facing mock UI).

export type OrgHealth = 'active' | 'caution' | 'risk'
export type LifecycleStage = 'prospect' | 'poc' | 'onboarding' | 'live' | 'expansion' | 'renewal' | 'churned'
export type DeploymentModel = 'cloud' | 'onprem_managed' | 'onprem_airgapped'
export type DataAccessMode = 'api' | 'manual' | 'mixed'

export type ProjectHealth = 'completed' | 'on_schedule' | 'caution' | 'at_risk'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'done' | 'at_risk'
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical' // shared by risks + escalations
export type RiskStatus = 'open' | 'mitigating' | 'resolved' | 'accepted'
export type AskStatus = 'open' | 'in_progress' | 'resolved'
export type EscalationStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'p1' | 'p2' | 'p3' | 'p4'
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed'
export type EngagementType = 'call' | 'check_in' | 'qbr' | 'ebr' | 'note'

export type RecordSource = 'manual' | 'agent' | 'chat' | 'api' | 'file'
export type ProposalOperation = 'create' | 'update' | 'delete'
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'superseded'
export type SyncRunMode = 'scoped' | 'backfill' | 'daily'
export type SyncRunStatus = 'running' | 'success' | 'failed' | 'partial'
export type PortfolioNoteKind = 'milestone' | 'recommendation'

export interface Segment {
  id: string
  name: string
  sort: number
}

// The full extended `organizations` row (Phase 6 core columns + Phase 7 CS
// columns) — the CS Hub's "Account". Separate from CloudOrg/OnPremOrg, which
// are mock-data shapes for the frozen customer UI, not a mirror of this table.
export interface Account {
  id: string
  name: string
  deploymentType: DeploymentType
  plan: string | null
  status: OrgStatus
  externalRef: string | null
  segmentId: string | null
  deploymentModel: DeploymentModel | null
  health: OrgHealth
  lifecycleStage: LifecycleStage
  dataAccessMode: DataAccessMode | null
  aliases: string[]
  healthReason: string | null // 7.2b
  verifiedAt: string | null // 7.2b
  updatedBy: string | null // 7.2b
  createdAt: string
}

// Shared provenance fields on every CS record table (not lookups, not
// proposals/sync_state/sync_runs, which carry their own analogous columns).
export interface Provenance {
  source: RecordSource
  sourceRef: string | null
  createdBy: string | null
  updatedBy: string | null
  verifiedAt: string | null
  proposalId: string | null
}

export interface Project extends Provenance {
  id: string
  orgId: string
  name: string
  releaseNo: string | null
  startDate: string | null
  goLiveDate: string | null
  expectedEndDate: string | null
  health: ProjectHealth
  liveTenants: number
  devUatTenants: number
  goals: string[]
  issueTrackerUrl: string | null
  createdAt: string
}

export interface Milestone extends Provenance {
  id: string
  projectId: string
  orgId: string
  period: string
  description: string
  status: MilestoneStatus
  createdAt: string
}

export interface Accomplishment extends Provenance {
  id: string
  projectId: string
  orgId: string
  period: string
  text: string
  createdAt: string
}

export interface Risk extends Provenance {
  id: string
  projectId: string | null
  orgId: string
  risk: string
  impact: string
  mitigation: string | null
  severity: RiskSeverity
  status: RiskStatus
  owner: string | null
  createdAt: string
}

export interface Ask extends Provenance {
  id: string
  projectId: string | null
  orgId: string
  text: string
  owner: string | null
  status: AskStatus
  createdAt: string
}

export interface Escalation extends Provenance {
  id: string
  orgId: string
  projectId: string | null
  title: string
  severity: RiskSeverity
  raisedBy: string | null
  raisedAt: string
  status: EscalationStatus
  resolution: string | null
  createdAt: string
}

export interface Ticket extends Provenance {
  id: string
  orgId: string
  externalKey: string
  title: string
  priority: TicketPriority
  status: TicketStatus
  openedAt: string
  updatedAt: string
  url: string | null
  system: string
  createdAt: string
}

export interface Engagement extends Provenance {
  id: string
  orgId: string
  type: EngagementType
  engagementDate: string
  attendees: string[]
  summary: string
  followUps: string | null
  createdAt: string
}

export interface MetricDefinition {
  key: string
  label: string
  unit: string
  category: string
  hasBaseline: boolean
  sort: number
}

export interface MetricValue extends Provenance {
  id: string
  orgId: string
  projectId: string | null
  metricKey: string
  period: string
  value: number
  baselineValue: number | null
  createdAt: string
}

export interface PortfolioNote extends Provenance {
  id: string
  period: string
  kind: PortfolioNoteKind
  body: string
  impact: string | null
  createdAt: string
}

export interface Proposal {
  id: string
  orgId: string | null
  targetTable: string
  targetId: string | null
  operation: ProposalOperation
  payload: Record<string, unknown>
  source: RecordSource
  sourceRef: string | null
  evidenceUrl: string | null
  evidenceExcerpt: string | null
  confidence: number | null
  proposedBy: string
  triggeredBy: string | null
  runId: string | null
  status: ProposalStatus
  decidedBy: string | null
  decidedAt: string | null
  reason: string | null
  createdAt: string
}

export interface SyncState {
  orgId: string
  recordType: string
  lastSyncedAt: string | null
  lastStatus: string | null
  lastError: string | null
  lockedUntil: string | null
}

export interface SyncRun {
  id: string
  mode: SyncRunMode
  triggeredBy: string
  scope: Record<string, unknown> | null
  startedAt: string
  finishedAt: string | null
  status: SyncRunStatus
  counts: Record<string, unknown> | null
  cost: number | null
}

// ── Equal-admins model (supersedes 7.2a's titles/teams/account_assignments;
// build-spec-v3 § 5; product-overview.md § 12). Every admin is equal; a
// person's involvement in an account is a per-account ROLE TAG for
// record-keeping only, with history. reports_to is an optional, permission-
// free UX convenience.

export type AssignmentRole = 'edl' | 'ta' | 'fde' // shared by account_roles and project_members
// 'team_id' is a dead scope value at the DB level (unused, left in place —
// Postgres can't cleanly drop one enum value) but no longer produced/accepted
// by the app: no teams left to target. 'team' means "my team" (reports-based).
export type SavedViewScope = 'mine' | 'team' | 'everyone' | 'person' | 'team_id'

export interface AccountRole {
  id: string
  profileId: string
  orgId: string
  role: AssignmentRole
  startedAt: string
  endedAt: string | null
}

export interface ProjectMember {
  id: string
  projectId: string
  profileId: string
  role: AssignmentRole
  createdAt: string
}

// Composed shape for one row of an account's active-roles list (joins the
// assigned person's name for display) — used by Portfolio/Account 360's
// "add to my accounts" UI and the People directory.
export interface AccountRoleRow {
  id: string
  orgId: string
  accountName: string | null
  profileId: string
  profileName: string | null
  role: AssignmentRole
  startedAt: string
  endedAt: string | null
}

export interface SavedView {
  id: string
  ownerProfileId: string
  name: string
  page: string
  scope: SavedViewScope
  scopeTarget: string | null // profiles.id when scope='person'
  filters: Record<string, unknown>
  sort: Record<string, unknown> | null
  columns: string[] | null
  isDefault: boolean
  pinned: boolean
  createdAt: string
}

// ── Phase 7.2b — Portfolio + Account 360 (build-spec-v3 § 6; product-overview
// § 5.2–5.3). Composed row shapes the Portfolio board/Account 360 screens
// read; the underlying tables (projects, milestones, escalations, …) already
// shipped in 7.1 — nothing here is new schema beyond `Account`'s 3 new fields.

export type CoverageSection = 'projects' | 'milestones' | 'risks' | 'escalations' | 'tickets' | 'engagements' | 'metrics'
export type CoverageStatus = 'current' | 'stale' | 'missing'

// One row of the Portfolio board: an Account plus the aggregates the board
// and Account 360 header both show, computed client-side from the
// per-table queries in usePortfolio.ts (no new SQL).
export interface PortfolioAccountRow extends Account {
  segmentName: string | null
  edlNames: string | null // active account_roles where role='edl', joined for display
  openEscalationCount: number
  nextMilestone: { description: string; period: string } | null
  lastEngagementAt: string | null
  coveragePct: number
}

export interface ProjectMemberRow {
  id: string
  projectId: string
  profileId: string
  profileName: string | null
  role: AssignmentRole
}

// ── Phase 7.3 — Approvals inbox + audit log screen (build-spec-v3 § 3.1,
// § 3.2). `Proposal` (types/index.ts) and `audit_log` already shipped in
// 7.1 — these are just the composed/joined row shapes the two screens read.

export interface ProposalRow extends Proposal {
  accountName: string | null
}

export interface AuditLogEntry {
  id: string
  actorId: string | null
  actorName: string | null
  onBehalfOf: string | null
  action: string
  recordTable: string | null
  recordId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  orgId: string | null
  accountName: string | null
  proposalId: string | null
  createdAt: string
}

// ── Standups (equal-admins model Part 3; product-overview.md § 5.7).
// Anyone hosts; participants are pre-filled from reports_to + a remembered
// set (saved_views), not a fixed team roster.

export type ActionItemStatus = 'open' | 'done'

export interface Standup {
  id: string
  hostProfileId: string
  standupDate: string
  createdAt: string
}

export interface StandupRow extends Standup {
  hostName: string | null
  participantCount: number
}

export interface StandupEntry {
  id: string
  standupId: string
  profileId: string
  yesterday: string | null
  today: string | null
  blockers: string | null
  createdAt: string
}

export interface StandupEntryRow extends StandupEntry {
  profileName: string | null
}

export interface ActionItem {
  id: string
  standupEntryId: string | null
  orgId: string | null
  ownerProfileId: string | null
  description: string
  dueDate: string | null
  status: ActionItemStatus
  createdBy: string | null
  createdAt: string
}
