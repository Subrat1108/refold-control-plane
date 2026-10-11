-- 7.5-pre2 Session 2 — "Account match needed" (build-spec-v3 extension; see
-- docs/decisions.md and the devlog session entry for the full design).
--
-- The agent never invents an account or promotes a tenant — when `ingest`
-- can't resolve an account/tenant identifier via an exact account_sources
-- match, it files an `account_resolution` proposal (target_table =
-- 'account_resolution', a meta-kind — never a real CS table) and HOLDS the
-- dependent record (status = 'held', blocked_by_resolution_id set) instead
-- of guessing or rejecting it outright. A human resolves it from the
-- Approvals inbox one of four ways; resolving releases every held record
-- linked to it through the exact same dedupe/upsert logic `ingest` already
-- uses (supabase/functions/_shared/dedupe.ts — extracted from `ingest` this
-- session so both it and the new resolution action share one decision
-- tree, never two copies drifting apart).
--
-- `sync_learnings` is pulled forward minimally from the (not-yet-built)
-- Session 3 learning loop: only its table shape and the two DETERMINISTIC
-- write kinds this session needs (`alias_map` on a successful resolution,
-- `ignore` on "not a customer") are wired up here. `rule`/`example` (agent-
-- written), the admin "Sync learnings" screen, and the active-rule-count/
-- conflict guardrails are explicitly Session 3 scope, not touched here.

-- 'held' added in 20261011000002_held_status.sql (split out — see that
-- file's comment for why).

alter table public.proposals
  add column blocked_by_resolution_id uuid references public.proposals(id) on delete set null;

-- Race-safety backstops, same philosophy as 7.4's proposals_pending_dedupe:
-- two overlapping runs reporting the same never-seen-before identifier (or
-- the same fact blocked on it) must not create two resolution proposals or
-- two held rows. account_resolution rows have no real org_id yet (or, for a
-- tenant-scope resolution, org_id is the already-known account) — excluded
-- from the index key entirely for resolution_dedupe (target_table alone
-- disambiguates it from every real record type), and normalized via
-- coalesce for held_dedupe so a null org_id (account-scope) is still one
-- consistent dedupe bucket per (table, source_ref).
create unique index proposals_resolution_dedupe on public.proposals (target_table, source_ref)
  where target_table = 'account_resolution' and status = 'pending' and source_ref is not null;

create unique index proposals_held_dedupe on public.proposals (target_table, source_ref, coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'held' and source_ref is not null;

create type public.learning_kind as enum ('alias_map', 'ignore', 'rule', 'example');
create type public.learning_status as enum ('active', 'retired');

create table public.sync_learnings (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.learning_kind not null,
  org_id              uuid references public.organizations(id) on delete cascade, -- null = global (e.g. a global ignore)
  tenant_id           uuid references public.tenants(id) on delete cascade,
  content             jsonb not null,
  source_decision_ids uuid[] not null default '{}',
  created_by          text not null, -- a profile id (human) or 'cs-sync-agent' — mixed type like proposals.triggered_by (§4.6)
  status              public.learning_status not null default 'active',
  last_used_at        timestamptz,
  hits                int not null default 0,
  created_at          timestamptz not null default now()
);

create index sync_learnings_org_id_idx on public.sync_learnings (org_id);
create index sync_learnings_kind_idx   on public.sync_learnings (kind);

alter table public.sync_learnings enable row level security;

create policy sync_learnings_select on public.sync_learnings for select to authenticated using (public.is_super_admin());
create policy sync_learnings_insert on public.sync_learnings for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy sync_learnings_update on public.sync_learnings for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy sync_learnings_delete on public.sync_learnings for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on public.sync_learnings to authenticated, service_role;

create trigger sync_learnings_audit after insert or update or delete on public.sync_learnings for each row execute function public.write_audit_log();
