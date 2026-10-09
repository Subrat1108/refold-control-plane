import { Link } from 'react-router-dom'
import {
  useSupabaseAuth,
  usePersonRoles,
  useAccountsRaw,
  useRecentActivityOrgIds,
  useProposals,
  useMilestonesDue,
  useOpenEscalationsAll,
  useOpenP1P2Tickets,
  useLastEngagements,
  useCoverage,
  coverageStatusFor,
  useHasReports,
  useMyReports,
  useAuditLog,
  useScope,
  useScopedAccountIds,
} from '@/hooks'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { ScopeSwitcher } from '@/components/ScopeSwitcher'
import { CardSkeleton } from '@/components/SkeletonLoader'
import { formatDate } from '@/utils/formatDate'
import type { CoverageSection } from '@/types'

const PAGE = 'home'
const STALE_DAYS = 14
const COVERAGE_SECTIONS: CoverageSection[] = ['projects', 'milestones', 'risks', 'escalations', 'tickets', 'engagements', 'metrics']

function inScope(orgId: string, scopedIds: string[] | null | undefined): boolean {
  if (scopedIds === null || scopedIds === undefined) return true // "everyone" or not yet resolved
  return scopedIds.includes(orgId)
}

export function HomePage() {
  const { profile } = useSupabaseAuth()
  const { scope, scopeTarget, setScope } = useScope(PAGE)
  const { data: scopedIds } = useScopedAccountIds(scope, scopeTarget)
  const { data: hasReports } = useHasReports(profile?.id ?? null)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Home</h1>
          <p className="text-sm text-muted-foreground mt-0.5">What needs your attention today.</p>
        </div>
        <ScopeSwitcher scope={scope} scopeTarget={scopeTarget} onChange={setScope} />
      </div>

      <MyAccountsSection />
      <NeedsAttentionSection scopedIds={scopedIds} />
      {hasReports && <MyReportsSection profileId={profile!.id} />}
      <RecentActivitySection scopedIds={scopedIds} />
    </div>
  )
}

// ── My accounts at a glance ──────────────────────────────────────────────

function MyAccountsSection() {
  const { profile } = useSupabaseAuth()
  const { data: myRoles, isLoading: rolesLoading } = usePersonRoles(profile?.id ?? null)
  const { data: accounts, isLoading: accountsLoading } = useAccountsRaw()
  const { data: recentActivity } = useRecentActivityOrgIds()

  const active = (myRoles ?? []).filter((r) => !r.endedAt)
  const rows = active.map((r) => ({
    ...r,
    health: accounts?.find((a) => a.id === r.orgId)?.health ?? 'active',
    activeRecently: recentActivity?.has(r.orgId) ?? false,
  }))

  const columns: Column<typeof rows[number]>[] = [
    { key: 'account', header: 'Account', render: (r) => <Link to={`/accounts/${r.orgId}`} className="font-medium text-foreground hover:underline">{r.accountName ?? '—'}</Link> },
    { key: 'role', header: 'My role', render: (r) => <span className="uppercase text-xs text-muted-foreground">{r.role}</span> },
    { key: 'health', header: 'Health', render: (r) => <StatusBadge status={r.health} /> },
    { key: 'activity', header: 'Activity', render: (r) => r.activeRecently ? <span className="text-xs text-primary font-medium">Changed in last 24h</span> : <span className="text-xs text-muted-foreground">Quiet</span> },
  ]

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">My accounts</h2>
      <div className="bg-white rounded-xl shadow-card p-6">
        {rolesLoading || accountsLoading ? <CardSkeleton /> : (
          <DataTable columns={columns} data={rows} rowKey={(r) => r.id} emptyTitle="No active roles yet" emptyDescription="Add yourself to an account from Portfolio or an Account 360 page." />
        )}
      </div>
    </section>
  )
}

// ── Needs attention ──────────────────────────────────────────────────────

function NeedsAttentionSection({ scopedIds }: { scopedIds: string[] | null | undefined }) {
  const { data: proposals } = useProposals({ orgIds: scopedIds ?? null })
  const { data: milestones } = useMilestonesDue()
  const { data: escalations } = useOpenEscalationsAll()
  const { data: tickets } = useOpenP1P2Tickets()
  const { data: lastEngagements } = useLastEngagements()
  const { data: accounts } = useAccountsRaw()
  const { data: coverage } = useCoverage()

  const scopedMilestones = (milestones ?? []).filter((m) => inScope(m.orgId, scopedIds))
  const scopedEscalations = (escalations ?? []).filter((e) => inScope(e.orgId, scopedIds))
  const scopedTickets = (tickets ?? []).filter((t) => inScope(t.orgId, scopedIds))

  const noEngagement = (accounts ?? [])
    .filter((a) => inScope(a.id, scopedIds))
    .filter((a) => {
      const last = lastEngagements?.[a.id]
      if (!last) return true
      return Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) >= STALE_DAYS
    })

  const staleCoverage = (accounts ?? [])
    .filter((a) => inScope(a.id, scopedIds))
    .flatMap((a) => COVERAGE_SECTIONS.filter((s) => coverageStatusFor(coverage, a.id, s) === 'stale').map((s) => ({ account: a, section: s })))

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Needs attention</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AttentionCard title="Pending approvals" count={(proposals ?? []).length} to="/approvals">
          {(proposals ?? []).slice(0, 5).map((p) => <p key={p.id} className="text-sm text-muted-foreground">{p.operation} · {p.targetTable.replace(/_/g, ' ')} — {p.accountName ?? '—'}</p>)}
        </AttentionCard>
        <AttentionCard title="Milestones due or overdue" count={scopedMilestones.length}>
          {scopedMilestones.slice(0, 5).map((m) => (
            <Link key={m.id} to={`/accounts/${m.orgId}`} className="block text-sm text-muted-foreground hover:text-foreground">
              {m.description} — {m.accountName ?? '—'} {m.overdue && <span className="text-red-600 font-medium">(overdue)</span>}
            </Link>
          ))}
        </AttentionCard>
        <AttentionCard title="Open escalations" count={scopedEscalations.length}>
          {scopedEscalations.slice(0, 5).map((e) => (
            <Link key={e.id} to={`/accounts/${e.orgId}`} className="block text-sm text-muted-foreground hover:text-foreground">{e.title} — {e.accountName ?? '—'} <StatusBadge status={e.severity} /></Link>
          ))}
        </AttentionCard>
        <AttentionCard title="Open P1/P2 tickets" count={scopedTickets.length}>
          {scopedTickets.slice(0, 5).map((t) => (
            <Link key={t.id} to={`/accounts/${t.orgId}`} className="block text-sm text-muted-foreground hover:text-foreground">{t.title} — {t.accountName ?? '—'} <span className="uppercase text-xs">{t.priority}</span></Link>
          ))}
        </AttentionCard>
        <AttentionCard title={`No engagement in ${STALE_DAYS}+ days`} count={noEngagement.length}>
          {noEngagement.slice(0, 5).map((a) => <Link key={a.id} to={`/accounts/${a.id}`} className="block text-sm text-muted-foreground hover:text-foreground">{a.name}</Link>)}
        </AttentionCard>
        <AttentionCard title="Coverage stale 30+ days" count={staleCoverage.length}>
          {staleCoverage.slice(0, 5).map(({ account, section }) => (
            <Link key={`${account.id}-${section}`} to={`/accounts/${account.id}`} className="block text-sm text-muted-foreground hover:text-foreground">{account.name} — {section}</Link>
          ))}
        </AttentionCard>
      </div>
    </section>
  )
}

function AttentionCard({ title, count, to, children }: { title: string; count: number; to?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {to ? <Link to={to} className="text-xs font-medium text-primary hover:underline">{count}</Link> : <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>}
      </div>
      {count === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <div className="space-y-1">{children}</div>}
    </div>
  )
}

// ── My reports ───────────────────────────────────────────────────────────

function MyReportsSection({ profileId }: { profileId: string }) {
  const { data: reports } = useMyReports(profileId)
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">My reports</h2>
      <div className="bg-white rounded-xl shadow-card p-6 space-y-2">
        {(reports ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No one reports to you.</p> : (
          (reports ?? []).map((r) => <ReportRow key={r.id} profileId={r.id} name={r.fullName} />)
        )}
      </div>
    </section>
  )
}

function ReportRow({ profileId, name }: { profileId: string; name: string | null }) {
  const { data: milestones } = useMilestonesDue()
  const { data: escalations } = useOpenEscalationsAll()
  // This report's active account org ids — reuse person_account_ids via the
  // same scope helper the switcher uses, scoped to just this one person.
  const { data: theirOrgIds } = useScopedAccountIds('person', profileId)
  const overdue = (milestones ?? []).filter((m) => m.overdue && (theirOrgIds ?? []).includes(m.orgId)).length
  const openEsc = (escalations ?? []).filter((e) => (theirOrgIds ?? []).includes(e.orgId)).length
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
      <span className="text-foreground">{name ?? '—'}</span>
      <span className="text-muted-foreground">{overdue} overdue · {openEsc} open escalations</span>
    </div>
  )
}

// ── Recent activity ──────────────────────────────────────────────────────

function RecentActivitySection({ scopedIds }: { scopedIds: string[] | null | undefined }) {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { data } = useAuditLog({ orgIds: scopedIds ?? null, since, limit: 20 })

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
      <div className="bg-white rounded-xl shadow-card p-6 space-y-1.5">
        {(data?.rows ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing in the last 24 hours.</p> : (
          (data?.rows ?? []).map((a) => (
            <p key={a.id} className="text-sm text-muted-foreground">
              <span className="text-foreground">{a.actorName ?? a.onBehalfOf ?? 'system'}</span> {a.action.replace(/_/g, ' ')} {a.recordTable?.replace(/_/g, ' ')}
              {a.accountName && <> on <Link to={`/accounts/${a.orgId}`} className="hover:underline">{a.accountName}</Link></>} · {formatDate(a.createdAt)}
            </p>
          ))
        )}
      </div>
    </section>
  )
}
