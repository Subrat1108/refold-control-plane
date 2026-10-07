-- Phase 7.1 — proposals, sync_state, sync_runs (build-spec-v3 § 3, § 4, § 5).
-- These are the write-pipeline plumbing tables, not CS "record" tables: they do
-- NOT get the generic provenance columns (source/source_ref/created_by/…) —
-- they already carry their own analogous fields per spec. They DO get the
-- generic audit trigger (attached in 20261007000008) for mutation visibility.

create table public.proposals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references public.organizations(id) on delete cascade, -- denormalized for the Approvals inbox "by account" filter (§3.1)
  target_table     text not null,
  target_id        uuid,                              -- null on create
  operation        public.proposal_operation not null,
  payload          jsonb not null,
  source           public.record_source not null,
  source_ref       text,
  evidence_url     text,
  evidence_excerpt text check (char_length(evidence_excerpt) <= 280),
  confidence       numeric check (confidence >= 0 and confidence <= 1),
  proposed_by      text not null,                      -- e.g. 'cs-sync-agent' or a human identifier; not a strict FK (§4.6)
  triggered_by     text,                                -- profile id or literal 'system' (§4.6) — mixed type, kept as text
  run_id           uuid,                                -- FK added below once sync_runs exists
  status           public.proposal_status not null default 'pending',
  decided_by       uuid references public.profiles(id) on delete set null,
  decided_at       timestamptz,
  reason           text,
  created_at       timestamptz not null default now()
);

create table public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  mode         public.sync_run_mode not null,
  triggered_by text not null,                           -- profile id or literal 'system'
  scope        jsonb,                                   -- {account, record_type, since} per §4.3
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       public.sync_run_status not null default 'running',
  counts       jsonb,
  cost         numeric
);

alter table public.proposals add constraint proposals_run_id_fkey
  foreign key (run_id) references public.sync_runs(id) on delete set null;

-- Sync unit = (account, record type) with a watermark (§4.4) — composite PK.
create table public.sync_state (
  org_id         uuid not null references public.organizations(id) on delete cascade,
  record_type    text not null,
  last_synced_at timestamptz,
  last_status    text,
  last_error     text,
  locked_until   timestamptz,
  primary key (org_id, record_type)
);

create index proposals_org_id_idx  on public.proposals (org_id);
create index proposals_status_idx on public.proposals (status);

alter table public.proposals  enable row level security;
alter table public.sync_runs  enable row level security;
alter table public.sync_state enable row level security;

create policy proposals_select on public.proposals
  for select to authenticated using (public.is_super_admin());
create policy proposals_insert on public.proposals
  for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy proposals_update on public.proposals
  for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy proposals_delete on public.proposals
  for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy sync_runs_select on public.sync_runs
  for select to authenticated using (public.is_super_admin());
create policy sync_runs_insert on public.sync_runs
  for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy sync_runs_update on public.sync_runs
  for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy sync_runs_delete on public.sync_runs
  for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy sync_state_select on public.sync_state
  for select to authenticated using (public.is_super_admin());
create policy sync_state_insert on public.sync_state
  for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy sync_state_update on public.sync_state
  for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy sync_state_delete on public.sync_state
  for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on public.proposals, public.sync_runs, public.sync_state to authenticated, service_role;
