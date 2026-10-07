-- Phase 7.1 — remaining account-level CS record tables (build-spec-v3 § 2, § 5).
-- Same provenance/dedupe pattern as 20261007000005, except portfolio_notes: it
-- has NO org_id (it's portfolio-wide per the domain model, § 2), so its dedupe
-- key is source_ref alone.

create table public.escalations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  title       text not null,
  severity    public.risk_severity not null default 'medium',   -- shared vocabulary with risks
  raised_by   text,                                              -- free text: may be a customer-side person
  raised_at   timestamptz not null default now(),
  status      public.escalation_status not null default 'open',
  resolution  text,
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  external_key text not null,
  title       text not null,
  priority    public.ticket_priority not null default 'p3',
  status      public.ticket_status not null default 'open',
  opened_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  url         text,
  system      text not null,                                     -- e.g. 'Zendesk', 'Jira' (free text — no fixed system list)
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, system, external_key)                           -- natural key, in addition to the generic source_ref dedupe
);

create table public.engagements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  type            public.engagement_type not null,
  engagement_date date not null,
  attendees       text[] not null default '{}',
  summary         text not null,
  follow_ups      text,
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.metric_values (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  project_id     uuid references public.projects(id) on delete cascade,
  metric_key     text not null references public.metric_definitions(key) on delete restrict,
  period         date not null,                                   -- first-of-month convention
  value          numeric not null,
  baseline_value numeric,
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique nulls not distinct (org_id, metric_key, period, project_id)  -- prevents duplicate entries for the same period even without a source_ref
);

create table public.portfolio_notes (
  id          uuid primary key default gen_random_uuid(),
  period      date not null,
  kind        public.portfolio_note_kind not null,
  body        text not null,
  impact      text,
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index escalations_org_id_idx   on public.escalations (org_id);
create index tickets_org_id_idx       on public.tickets (org_id);
create index engagements_org_id_idx   on public.engagements (org_id);
create index metric_values_org_id_idx on public.metric_values (org_id);

create unique index escalations_org_source_ref_key   on public.escalations   (org_id, source_ref) where source_ref is not null;
create unique index tickets_org_source_ref_key        on public.tickets       (org_id, source_ref) where source_ref is not null;
create unique index engagements_org_source_ref_key    on public.engagements   (org_id, source_ref) where source_ref is not null;
create unique index metric_values_org_source_ref_key  on public.metric_values (org_id, source_ref) where source_ref is not null;
-- portfolio_notes has no org_id — dedupe on source_ref alone.
create unique index portfolio_notes_source_ref_key    on public.portfolio_notes (source_ref) where source_ref is not null;

alter table public.escalations     enable row level security;
alter table public.tickets         enable row level security;
alter table public.engagements     enable row level security;
alter table public.metric_values   enable row level security;
alter table public.portfolio_notes enable row level security;

create policy escalations_select on public.escalations for select to authenticated using (public.is_super_admin());
create policy escalations_insert on public.escalations for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy escalations_update on public.escalations for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy escalations_delete on public.escalations for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy tickets_select on public.tickets for select to authenticated using (public.is_super_admin());
create policy tickets_insert on public.tickets for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy tickets_update on public.tickets for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy tickets_delete on public.tickets for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy engagements_select on public.engagements for select to authenticated using (public.is_super_admin());
create policy engagements_insert on public.engagements for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy engagements_update on public.engagements for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy engagements_delete on public.engagements for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy metric_values_select on public.metric_values for select to authenticated using (public.is_super_admin());
create policy metric_values_insert on public.metric_values for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy metric_values_update on public.metric_values for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy metric_values_delete on public.metric_values for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy portfolio_notes_select on public.portfolio_notes for select to authenticated using (public.is_super_admin());
create policy portfolio_notes_insert on public.portfolio_notes for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy portfolio_notes_update on public.portfolio_notes for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy portfolio_notes_delete on public.portfolio_notes for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on
  public.escalations, public.tickets, public.engagements, public.metric_values, public.portfolio_notes
to authenticated, service_role;
