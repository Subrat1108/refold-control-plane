// Phase 7.2b — Portfolio board + Account 360. Same pattern as
// useTeamStructure.ts (direct supabase client + TanStack Query, real data).
// The underlying tables all shipped in 7.1 with super-admin RLS + AAL2
// writes + the generic audit trigger already attached — this file is reads
// and writes against schema that already exists, plus the 3 columns 7.2b
// adds to organizations (health_reason, verified_at, updated_by).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Account,
  Accomplishment,
  Ask,
  AssignmentRole,
  CoverageSection,
  CoverageStatus,
  Engagement,
  EngagementType,
  Escalation,
  EscalationStatus,
  LifecycleStage,
  Milestone,
  MetricDefinition,
  MetricValue,
  OrgHealth,
  PortfolioAccountRow,
  PortfolioNote,
  PortfolioNoteKind,
  Project,
  ProjectHealth,
  ProjectMemberRow,
  Risk,
  RiskSeverity,
  RiskStatus,
  AskStatus,
  Segment,
  Ticket,
  TicketPriority,
  TicketStatus,
} from '@/types'

const INTERNAL_ORG_ID = '00000000-0000-0000-0000-000000000001'
const STALE_DAYS = 30

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstOf<T>(v: any): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Generic "mark verified" — reused by every CS record table's row actions.
export async function markVerified(table: string, id: string, actorId: string): Promise<void> {
  const { error } = await supabase.from(table).update({ verified_at: new Date().toISOString(), updated_by: actorId }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Segments (lookup) ───────────────────────────────────────────────────────

async function fetchSegments(): Promise<Segment[]> {
  const { data, error } = await supabase.from('segments').select('id, name, sort').order('sort', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export function useSegments() {
  return useQuery({ queryKey: ['segments'], queryFn: fetchSegments })
}

// ── Accounts (organizations, excluding the internal Refold org) ────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAccount(row: any): Account {
  return {
    id: row.id,
    name: row.name,
    deploymentType: row.deployment_type,
    plan: row.plan,
    status: row.status,
    externalRef: row.external_ref,
    segmentId: row.segment_id,
    deploymentModel: row.deployment_model,
    health: row.health,
    lifecycleStage: row.lifecycle_stage,
    ownerProfileId: row.owner_profile_id,
    dataAccessMode: row.data_access_mode,
    aliases: row.aliases ?? [],
    healthReason: row.health_reason,
    verifiedAt: row.verified_at,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
  }
}

const ACCOUNT_COLUMNS =
  'id, name, deployment_type, plan, status, external_ref, segment_id, deployment_model, health, lifecycle_stage, owner_profile_id, data_access_mode, aliases, health_reason, verified_at, updated_by, created_at'

async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase.from('organizations').select(ACCOUNT_COLUMNS).neq('id', INTERNAL_ORG_ID).order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapAccount)
}

export function useAccountsRaw() {
  return useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
}

async function fetchAccount(orgId: string): Promise<Account | null> {
  const { data, error } = await supabase.from('organizations').select(ACCOUNT_COLUMNS).eq('id', orgId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapAccount(data) : null
}

export function useAccount(orgId: string | null) {
  return useQuery({ queryKey: ['account', orgId], queryFn: () => fetchAccount(orgId!), enabled: !!orgId })
}

export interface CreateAccountInput {
  name: string
  segmentId: string | null
  deploymentModel: Account['deploymentModel']
  deploymentType: Account['deploymentType']
}

// "Add account" (product-overview § 5.2) — creates the organizations row
// directly, no owner invite, no Edge Function; the existing
// organizations_insert RLS policy (super_admin + AAL2) already allows this.
export async function createAccount(input: CreateAccountInput): Promise<string> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name,
      segment_id: input.segmentId,
      deployment_model: input.deploymentModel,
      deployment_type: input.deploymentType,
      lifecycle_stage: 'prospect',
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export interface UpdateAccountInput {
  name?: string
  segmentId?: string | null
  deploymentModel?: Account['deploymentModel']
  lifecycleStage?: LifecycleStage
  ownerProfileId?: string | null
  health?: OrgHealth
  healthReason?: string | null
}

export async function updateAccount(orgId: string, patch: UpdateAccountInput, actorId: string): Promise<void> {
  const update: Record<string, unknown> = { updated_by: actorId }
  if (patch.name !== undefined) update.name = patch.name
  if (patch.segmentId !== undefined) update.segment_id = patch.segmentId
  if (patch.deploymentModel !== undefined) update.deployment_model = patch.deploymentModel
  if (patch.lifecycleStage !== undefined) update.lifecycle_stage = patch.lifecycleStage
  if (patch.ownerProfileId !== undefined) update.owner_profile_id = patch.ownerProfileId
  if (patch.health !== undefined) update.health = patch.health
  if (patch.healthReason !== undefined) update.health_reason = patch.healthReason
  const { error } = await supabase.from('organizations').update(update).eq('id', orgId)
  if (error) throw new Error(error.message)
}

// ── Board aggregates — one query per table across every account, grouped
// client-side by org_id (small admin-panel scale; avoids N+1 per-account
// round trips and needs no new SQL). ──────────────────────────────────────

async function fetchOpenEscalationCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('escalations').select('org_id, status').not('status', 'in', '(resolved,closed)')
  if (error) throw new Error(error.message)
  const out: Record<string, number> = {}
  for (const row of data ?? []) out[row.org_id] = (out[row.org_id] ?? 0) + 1
  return out
}

export function useOpenEscalationCounts() {
  return useQuery({ queryKey: ['open-escalation-counts'], queryFn: fetchOpenEscalationCounts })
}

async function fetchNextMilestones(): Promise<Record<string, { description: string; period: string }>> {
  const { data, error } = await supabase
    .from('milestones')
    .select('org_id, description, period, status')
    .neq('status', 'done')
    .order('period', { ascending: true })
  if (error) throw new Error(error.message)
  const out: Record<string, { description: string; period: string }> = {}
  for (const row of data ?? []) {
    if (!out[row.org_id]) out[row.org_id] = { description: row.description, period: row.period }
  }
  return out
}

export function useNextMilestones() {
  return useQuery({ queryKey: ['next-milestones'], queryFn: fetchNextMilestones })
}

async function fetchLastEngagements(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('engagements').select('org_id, engagement_date').order('engagement_date', { ascending: false })
  if (error) throw new Error(error.message)
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    if (!out[row.org_id]) out[row.org_id] = row.engagement_date
  }
  return out
}

export function useLastEngagements() {
  return useQuery({ queryKey: ['last-engagements'], queryFn: fetchLastEngagements })
}

// ── Coverage (product-overview § 3.3, § 5.2) — per account, per section:
// current (≥1 row, most-recently-verified-or-created within STALE_DAYS) /
// stale (rows exist, none recent) / missing (no rows). "Pending approval" has
// no backing data until 7.3's proposals ship, so it never appears yet. ─────

const COVERAGE_TABLES: Record<CoverageSection, string> = {
  projects: 'projects',
  milestones: 'milestones',
  risks: 'risks',
  escalations: 'escalations',
  tickets: 'tickets',
  engagements: 'engagements',
  metrics: 'metric_values',
}

async function fetchCoverageTimestamps(table: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from(table).select('org_id, verified_at, created_at')
  if (error) throw new Error(error.message)
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    const stamp = row.verified_at ?? row.created_at
    if (!out[row.org_id] || stamp > out[row.org_id]) out[row.org_id] = stamp
  }
  return out
}

export type CoverageMatrix = Record<string, Record<CoverageSection, CoverageStatus>>

async function fetchCoverage(): Promise<CoverageMatrix> {
  const sections = Object.keys(COVERAGE_TABLES) as CoverageSection[]
  const perSection = await Promise.all(sections.map((s) => fetchCoverageTimestamps(COVERAGE_TABLES[s])))
  const out: CoverageMatrix = {}
  sections.forEach((section, i) => {
    for (const [orgId, stamp] of Object.entries(perSection[i])) {
      out[orgId] ??= {} as Record<CoverageSection, CoverageStatus>
      const age = daysSince(stamp)
      out[orgId][section] = age !== null && age <= STALE_DAYS ? 'current' : 'stale'
    }
  })
  return out
}

export function useCoverage() {
  return useQuery({ queryKey: ['coverage'], queryFn: fetchCoverage })
}

export function coverageStatusFor(matrix: CoverageMatrix | undefined, orgId: string, section: CoverageSection): CoverageStatus {
  return matrix?.[orgId]?.[section] ?? 'missing'
}

export function coveragePct(matrix: CoverageMatrix | undefined, orgId: string): number {
  const sections = Object.keys(COVERAGE_TABLES) as CoverageSection[]
  const current = sections.filter((s) => coverageStatusFor(matrix, orgId, s) === 'current').length
  return Math.round((current / sections.length) * 100)
}

// ── Composed Portfolio board rows ───────────────────────────────────────────

export function usePortfolioAccounts() {
  const accounts = useAccountsRaw()
  const segments = useSegments()
  const escalationCounts = useOpenEscalationCounts()
  const nextMilestones = useNextMilestones()
  const lastEngagements = useLastEngagements()
  const coverage = useCoverage()

  const isLoading = accounts.isLoading || segments.isLoading
  const isError = accounts.isError || segments.isError

  const data: PortfolioAccountRow[] | undefined = accounts.data?.map((a) => ({
    ...a,
    segmentName: segments.data?.find((s) => s.id === a.segmentId)?.name ?? null,
    ownerName: null, // resolved by the caller (needs ManagedUser list — avoids a second N+1 lookup here)
    openEscalationCount: escalationCounts.data?.[a.id] ?? 0,
    nextMilestone: nextMilestones.data?.[a.id] ?? null,
    lastEngagementAt: lastEngagements.data?.[a.id] ?? null,
    coveragePct: coveragePct(coverage.data, a.id),
  }))

  return { data, isLoading, isError, refetch: accounts.refetch }
}

// ── Org audit trail (Account 360 Overview "recent activity") ───────────────

export interface AuditLogRow {
  id: string
  action: string
  actorName: string | null
  createdAt: string
}

async function fetchOrgAuditLog(orgId: string, limit: number): Promise<AuditLogRow[]> {
  // Explicit FK hint (D-068): audit_log has exactly one relationship to
  // profiles today (actor_id), but every embed touching profiles gets the
  // hint on principle.
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, created_at, profiles!audit_log_actor_id_fkey(full_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    action: row.action,
    actorName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    createdAt: row.created_at,
  }))
}

export function useOrgAuditLog(orgId: string | null, limit = 5) {
  return useQuery({ queryKey: ['org-audit-log', orgId, limit], queryFn: () => fetchOrgAuditLog(orgId!, limit), enabled: !!orgId })
}

// ── Projects ─────────────────────────────────────────────────────────────

async function fetchProjects(orgId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, org_id, name, release_no, start_date, go_live_date, expected_end_date, health, live_tenants, dev_uat_tenants, goals, issue_tracker_url, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    releaseNo: row.release_no,
    startDate: row.start_date,
    goLiveDate: row.go_live_date,
    expectedEndDate: row.expected_end_date,
    health: row.health,
    liveTenants: row.live_tenants,
    devUatTenants: row.dev_uat_tenants,
    goals: row.goals ?? [],
    issueTrackerUrl: row.issue_tracker_url,
    source: row.source,
    sourceRef: row.source_ref,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    verifiedAt: row.verified_at,
    proposalId: row.proposal_id,
    createdAt: row.created_at,
  }))
}

export function useProjects(orgId: string | null) {
  return useQuery({ queryKey: ['projects', orgId], queryFn: () => fetchProjects(orgId!), enabled: !!orgId })
}

export interface ProjectInput {
  name: string
  releaseNo?: string | null
  startDate?: string | null
  goLiveDate?: string | null
  expectedEndDate?: string | null
  health?: ProjectHealth
  liveTenants?: number
  devUatTenants?: number
  goals?: string[]
  issueTrackerUrl?: string | null
}

export async function createProject(orgId: string, input: ProjectInput, actorId: string): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      name: input.name,
      release_no: input.releaseNo ?? null,
      start_date: input.startDate ?? null,
      go_live_date: input.goLiveDate ?? null,
      expected_end_date: input.expectedEndDate ?? null,
      health: input.health ?? 'on_schedule',
      live_tenants: input.liveTenants ?? 0,
      dev_uat_tenants: input.devUatTenants ?? 0,
      goals: input.goals ?? [],
      issue_tracker_url: input.issueTrackerUrl ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function updateProject(id: string, patch: Partial<ProjectInput>, actorId: string): Promise<void> {
  const update: Record<string, unknown> = { updated_by: actorId }
  if (patch.name !== undefined) update.name = patch.name
  if (patch.releaseNo !== undefined) update.release_no = patch.releaseNo
  if (patch.startDate !== undefined) update.start_date = patch.startDate
  if (patch.goLiveDate !== undefined) update.go_live_date = patch.goLiveDate
  if (patch.expectedEndDate !== undefined) update.expected_end_date = patch.expectedEndDate
  if (patch.health !== undefined) update.health = patch.health
  if (patch.liveTenants !== undefined) update.live_tenants = patch.liveTenants
  if (patch.devUatTenants !== undefined) update.dev_uat_tenants = patch.devUatTenants
  if (patch.goals !== undefined) update.goals = patch.goals
  if (patch.issueTrackerUrl !== undefined) update.issue_tracker_url = patch.issueTrackerUrl
  const { error } = await supabase.from('projects').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Project members (D-077's deferred assignment UI) ───────────────────────

async function fetchProjectMembers(projectId: string): Promise<ProjectMemberRow[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select('id, project_id, profile_id, role, profiles!project_members_profile_id_fkey(full_name)')
    .eq('project_id', projectId)
    .order('role', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    projectId: row.project_id,
    profileId: row.profile_id,
    profileName: firstOf<{ full_name: string | null }>(row.profiles)?.full_name ?? null,
    role: row.role,
  }))
}

export function useProjectMembers(projectId: string | null) {
  return useQuery({ queryKey: ['project-members', projectId], queryFn: () => fetchProjectMembers(projectId!), enabled: !!projectId })
}

export async function addProjectMember(projectId: string, profileId: string, role: AssignmentRole): Promise<void> {
  const { error } = await supabase.from('project_members').insert({ project_id: projectId, profile_id: profileId, role })
  if (error) throw new Error(error.message)
}

export async function removeProjectMember(id: string): Promise<void> {
  const { error } = await supabase.from('project_members').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Milestones / accomplishments (per project) ──────────────────────────────

async function fetchMilestones(projectId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('id, project_id, org_id, period, description, status, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('project_id', projectId)
    .order('period', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, projectId: r.project_id, orgId: r.org_id, period: r.period, description: r.description, status: r.status,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useMilestones(projectId: string | null) {
  return useQuery({ queryKey: ['milestones', projectId], queryFn: () => fetchMilestones(projectId!), enabled: !!projectId })
}

export async function createMilestone(projectId: string, orgId: string, input: { period: string; description: string; status?: Milestone['status'] }, actorId: string): Promise<void> {
  const { error } = await supabase.from('milestones').insert({ project_id: projectId, org_id: orgId, period: input.period, description: input.description, status: input.status ?? 'not_started', created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function updateMilestone(id: string, patch: Partial<{ period: string; description: string; status: Milestone['status'] }>, actorId: string): Promise<void> {
  const { error } = await supabase.from('milestones').update({ ...patch, updated_by: actorId }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteMilestone(id: string): Promise<void> {
  const { error } = await supabase.from('milestones').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

async function fetchAccomplishments(projectId: string): Promise<Accomplishment[]> {
  const { data, error } = await supabase
    .from('accomplishments')
    .select('id, project_id, org_id, period, text, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('project_id', projectId)
    .order('period', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, projectId: r.project_id, orgId: r.org_id, period: r.period, text: r.text,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useAccomplishments(projectId: string | null) {
  return useQuery({ queryKey: ['accomplishments', projectId], queryFn: () => fetchAccomplishments(projectId!), enabled: !!projectId })
}

export async function createAccomplishment(projectId: string, orgId: string, input: { period: string; text: string }, actorId: string): Promise<void> {
  const { error } = await supabase.from('accomplishments').insert({ project_id: projectId, org_id: orgId, period: input.period, text: input.text, created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function updateAccomplishment(id: string, patch: Partial<{ period: string; text: string }>, actorId: string): Promise<void> {
  const { error } = await supabase.from('accomplishments').update({ ...patch, updated_by: actorId }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteAccomplishment(id: string): Promise<void> {
  const { error } = await supabase.from('accomplishments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Risks / asks (org-level when project_id is null, else per-project) ─────

async function fetchRisks(orgId: string): Promise<Risk[]> {
  const { data, error } = await supabase
    .from('risks')
    .select('id, project_id, org_id, risk, impact, mitigation, severity, status, owner, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, projectId: r.project_id, orgId: r.org_id, risk: r.risk, impact: r.impact, mitigation: r.mitigation, severity: r.severity, status: r.status, owner: r.owner,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useRisks(orgId: string | null) {
  return useQuery({ queryKey: ['risks', orgId], queryFn: () => fetchRisks(orgId!), enabled: !!orgId })
}

export interface RiskInput {
  risk: string
  impact: string
  mitigation?: string | null
  severity?: RiskSeverity
  status?: RiskStatus
  owner?: string | null
}

export async function createRisk(orgId: string, projectId: string | null, input: RiskInput, actorId: string): Promise<void> {
  const { error } = await supabase.from('risks').insert({ org_id: orgId, project_id: projectId, risk: input.risk, impact: input.impact, mitigation: input.mitigation ?? null, severity: input.severity ?? 'medium', status: input.status ?? 'open', owner: input.owner ?? null, created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function updateRisk(id: string, patch: Partial<RiskInput>, actorId: string): Promise<void> {
  const { error } = await supabase.from('risks').update({ ...patch, updated_by: actorId }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteRisk(id: string): Promise<void> {
  const { error } = await supabase.from('risks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

async function fetchAsks(orgId: string): Promise<Ask[]> {
  const { data, error } = await supabase
    .from('asks')
    .select('id, project_id, org_id, text, owner, status, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, projectId: r.project_id, orgId: r.org_id, text: r.text, owner: r.owner, status: r.status,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useAsks(orgId: string | null) {
  return useQuery({ queryKey: ['asks', orgId], queryFn: () => fetchAsks(orgId!), enabled: !!orgId })
}

export async function createAsk(orgId: string, projectId: string | null, input: { text: string; owner?: string | null; status?: AskStatus }, actorId: string): Promise<void> {
  const { error } = await supabase.from('asks').insert({ org_id: orgId, project_id: projectId, text: input.text, owner: input.owner ?? null, status: input.status ?? 'open', created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function updateAsk(id: string, patch: Partial<{ text: string; owner: string | null; status: AskStatus }>, actorId: string): Promise<void> {
  const { error } = await supabase.from('asks').update({ ...patch, updated_by: actorId }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteAsk(id: string): Promise<void> {
  const { error } = await supabase.from('asks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Escalations ──────────────────────────────────────────────────────────

async function fetchEscalations(orgId: string): Promise<Escalation[]> {
  const { data, error } = await supabase
    .from('escalations')
    .select('id, org_id, project_id, title, severity, raised_by, raised_at, status, resolution, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('org_id', orgId)
    .order('raised_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, orgId: r.org_id, projectId: r.project_id, title: r.title, severity: r.severity, raisedBy: r.raised_by, raisedAt: r.raised_at, status: r.status, resolution: r.resolution,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useEscalations(orgId: string | null) {
  return useQuery({ queryKey: ['escalations', orgId], queryFn: () => fetchEscalations(orgId!), enabled: !!orgId })
}

export interface EscalationInput {
  title: string
  severity?: RiskSeverity
  raisedBy?: string | null
  projectId?: string | null
}

export async function createEscalation(orgId: string, input: EscalationInput, actorId: string): Promise<void> {
  const { error } = await supabase.from('escalations').insert({ org_id: orgId, project_id: input.projectId ?? null, title: input.title, severity: input.severity ?? 'medium', raised_by: input.raisedBy ?? null, created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function resolveEscalation(id: string, status: EscalationStatus, resolution: string | null, actorId: string): Promise<void> {
  const { error } = await supabase.from('escalations').update({ status, resolution, updated_by: actorId }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteEscalation(id: string): Promise<void> {
  const { error } = await supabase.from('escalations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Tickets (manual entry this block; sync-driven Refresh is 7.5) ─────────

async function fetchTickets(orgId: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, org_id, external_key, title, priority, status, opened_at, updated_at, url, system, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('org_id', orgId)
    .order('opened_at', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, orgId: r.org_id, externalKey: r.external_key, title: r.title, priority: r.priority, status: r.status, openedAt: r.opened_at, updatedAt: r.updated_at, url: r.url, system: r.system,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useTickets(orgId: string | null) {
  return useQuery({ queryKey: ['tickets', orgId], queryFn: () => fetchTickets(orgId!), enabled: !!orgId })
}

export interface TicketInput {
  externalKey: string
  title: string
  priority?: TicketPriority
  status?: TicketStatus
  url?: string | null
  system: string
}

export async function createTicket(orgId: string, input: TicketInput, actorId: string): Promise<void> {
  const { error } = await supabase.from('tickets').insert({ org_id: orgId, external_key: input.externalKey, title: input.title, priority: input.priority ?? 'p3', status: input.status ?? 'open', url: input.url ?? null, system: input.system, created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function updateTicket(id: string, patch: Partial<TicketInput>, actorId: string): Promise<void> {
  const update: Record<string, unknown> = { updated_by: actorId, updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.priority !== undefined) update.priority = patch.priority
  if (patch.status !== undefined) update.status = patch.status
  if (patch.url !== undefined) update.url = patch.url
  const { error } = await supabase.from('tickets').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTicket(id: string): Promise<void> {
  const { error } = await supabase.from('tickets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Engagements ──────────────────────────────────────────────────────────

async function fetchEngagements(orgId: string): Promise<Engagement[]> {
  const { data, error } = await supabase
    .from('engagements')
    .select('id, org_id, type, engagement_date, attendees, summary, follow_ups, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('org_id', orgId)
    .order('engagement_date', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, orgId: r.org_id, type: r.type, engagementDate: r.engagement_date, attendees: r.attendees ?? [], summary: r.summary, followUps: r.follow_ups,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useEngagements(orgId: string | null) {
  return useQuery({ queryKey: ['engagements', orgId], queryFn: () => fetchEngagements(orgId!), enabled: !!orgId })
}

export interface EngagementInput {
  type: EngagementType
  engagementDate: string
  attendees?: string[]
  summary: string
  followUps?: string | null
}

export async function createEngagement(orgId: string, input: EngagementInput, actorId: string): Promise<void> {
  const { error } = await supabase.from('engagements').insert({ org_id: orgId, type: input.type, engagement_date: input.engagementDate, attendees: input.attendees ?? [], summary: input.summary, follow_ups: input.followUps ?? null, created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function updateEngagement(id: string, patch: Partial<EngagementInput>, actorId: string): Promise<void> {
  const update: Record<string, unknown> = { updated_by: actorId }
  if (patch.type !== undefined) update.type = patch.type
  if (patch.engagementDate !== undefined) update.engagement_date = patch.engagementDate
  if (patch.attendees !== undefined) update.attendees = patch.attendees
  if (patch.summary !== undefined) update.summary = patch.summary
  if (patch.followUps !== undefined) update.follow_ups = patch.followUps
  const { error } = await supabase.from('engagements').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteEngagement(id: string): Promise<void> {
  const { error } = await supabase.from('engagements').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Metrics ──────────────────────────────────────────────────────────────

async function fetchMetricDefinitions(): Promise<MetricDefinition[]> {
  const { data, error } = await supabase.from('metric_definitions').select('key, label, unit, category, has_baseline, sort').order('sort', { ascending: true })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ key: r.key, label: r.label, unit: r.unit, category: r.category, hasBaseline: r.has_baseline, sort: r.sort }))
}

export function useMetricDefinitions() {
  return useQuery({ queryKey: ['metric-definitions'], queryFn: fetchMetricDefinitions })
}

async function fetchMetricValues(orgId: string): Promise<MetricValue[]> {
  const { data, error } = await supabase
    .from('metric_values')
    .select('id, org_id, project_id, metric_key, period, value, baseline_value, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .eq('org_id', orgId)
    .order('period', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, orgId: r.org_id, projectId: r.project_id, metricKey: r.metric_key, period: r.period, value: Number(r.value), baselineValue: r.baseline_value === null ? null : Number(r.baseline_value),
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function useMetricValues(orgId: string | null) {
  return useQuery({ queryKey: ['metric-values', orgId], queryFn: () => fetchMetricValues(orgId!), enabled: !!orgId })
}

export async function upsertMetricValue(orgId: string, input: { metricKey: string; period: string; value: number; baselineValue?: number | null; projectId?: string | null }, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('metric_values')
    .upsert(
      { org_id: orgId, project_id: input.projectId ?? null, metric_key: input.metricKey, period: input.period, value: input.value, baseline_value: input.baselineValue ?? null, created_by: actorId, updated_by: actorId },
      { onConflict: 'org_id,metric_key,period,project_id' },
    )
  if (error) throw new Error(error.message)
}

export async function deleteMetricValue(id: string): Promise<void> {
  const { error } = await supabase.from('metric_values').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Portfolio notes (board's "key milestones" / "recommendations + impact") ─

async function fetchPortfolioNotes(): Promise<PortfolioNote[]> {
  const { data, error } = await supabase
    .from('portfolio_notes')
    .select('id, period, kind, body, impact, source, source_ref, created_by, updated_by, verified_at, proposal_id, created_at')
    .order('period', { ascending: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, period: r.period, kind: r.kind, body: r.body, impact: r.impact,
    source: r.source, sourceRef: r.source_ref, createdBy: r.created_by, updatedBy: r.updated_by, verifiedAt: r.verified_at, proposalId: r.proposal_id, createdAt: r.created_at,
  }))
}

export function usePortfolioNotes() {
  return useQuery({ queryKey: ['portfolio-notes'], queryFn: fetchPortfolioNotes })
}

export async function createPortfolioNote(input: { period: string; kind: PortfolioNoteKind; body: string; impact?: string | null }, actorId: string): Promise<void> {
  const { error } = await supabase.from('portfolio_notes').insert({ period: input.period, kind: input.kind, body: input.body, impact: input.impact ?? null, created_by: actorId, updated_by: actorId })
  if (error) throw new Error(error.message)
}

export async function updatePortfolioNote(id: string, patch: Partial<{ body: string; impact: string | null }>, actorId: string): Promise<void> {
  const { error } = await supabase.from('portfolio_notes').update({ ...patch, updated_by: actorId }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deletePortfolioNote(id: string): Promise<void> {
  const { error } = await supabase.from('portfolio_notes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
