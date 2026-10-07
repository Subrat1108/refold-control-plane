-- Phase 7.1 — projects + its sub-tables (build-spec-v3 § 2, § 5).
-- Every table here is a CS "record" table: it carries the generic provenance
-- columns (source, source_ref, created_by, updated_by, verified_at, proposal_id)
-- and an org_id dedupe key (unique on (org_id, source_ref) where source_ref is
-- not null) — this is what the agentic sync uses to avoid double-proposing the
-- same Slack message / ticket / etc. created_by/updated_by are app-supplied, not
-- trigger-derived. The generic audit trigger is attached in 20261007000008.
--
-- milestones/accomplishments/risks/asks denormalize org_id from their project
-- (rather than requiring a join) so the dedupe constraint and the audit trigger
-- both work generically across every record table without special-casing.

create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  release_no        text,
  start_date        date,
  go_live_date      date,
  expected_end_date date,
  health            public.project_health not null default 'on_schedule',
  live_tenants      int not null default 0,
  dev_uat_tenants   int not null default 0,
  goals             text[] not null default '{}',
  fdes              text[] not null default '{}',
  edl_profile_id    uuid references public.profiles(id) on delete set null,
  issue_tracker_url text,
  -- provenance
  source       public.record_source not null default 'manual',
  source_ref   text,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  verified_at  timestamptz,
  proposal_id  uuid references public.proposals(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  period      date not null,          -- first-of-month convention
  description text not null,
  status      public.milestone_status not null default 'not_started',
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.accomplishments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  period      date not null,
  text        text not null,
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.risks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,   -- nullable: org-level risks need no project
  org_id      uuid not null references public.organizations(id) on delete cascade,
  risk        text not null,
  impact      text not null,
  mitigation  text,
  severity    public.risk_severity not null default 'medium',
  status      public.risk_status not null default 'open',
  owner       text,                                                     -- free text: may be a customer-side person, no contacts table yet (Phase 8)
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.asks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  text        text not null,
  owner       text,
  status      public.ask_status not null default 'open',
  source      public.record_source not null default 'manual',
  source_ref  text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  proposal_id uuid references public.proposals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index projects_org_id_idx       on public.projects (org_id);
create index milestones_project_id_idx on public.milestones (project_id);
create index accomplishments_project_id_idx on public.accomplishments (project_id);
create index risks_project_id_idx      on public.risks (project_id);
create index asks_project_id_idx       on public.asks (project_id);

create unique index projects_org_source_ref_key        on public.projects        (org_id, source_ref) where source_ref is not null;
create unique index milestones_org_source_ref_key       on public.milestones       (org_id, source_ref) where source_ref is not null;
create unique index accomplishments_org_source_ref_key  on public.accomplishments  (org_id, source_ref) where source_ref is not null;
create unique index risks_org_source_ref_key            on public.risks            (org_id, source_ref) where source_ref is not null;
create unique index asks_org_source_ref_key             on public.asks             (org_id, source_ref) where source_ref is not null;

alter table public.projects        enable row level security;
alter table public.milestones      enable row level security;
alter table public.accomplishments enable row level security;
alter table public.risks           enable row level security;
alter table public.asks            enable row level security;

create policy projects_select on public.projects for select to authenticated using (public.is_super_admin());
create policy projects_insert on public.projects for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy projects_update on public.projects for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy projects_delete on public.projects for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy milestones_select on public.milestones for select to authenticated using (public.is_super_admin());
create policy milestones_insert on public.milestones for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy milestones_update on public.milestones for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy milestones_delete on public.milestones for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy accomplishments_select on public.accomplishments for select to authenticated using (public.is_super_admin());
create policy accomplishments_insert on public.accomplishments for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy accomplishments_update on public.accomplishments for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy accomplishments_delete on public.accomplishments for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy risks_select on public.risks for select to authenticated using (public.is_super_admin());
create policy risks_insert on public.risks for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy risks_update on public.risks for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy risks_delete on public.risks for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy asks_select on public.asks for select to authenticated using (public.is_super_admin());
create policy asks_insert on public.asks for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy asks_update on public.asks for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy asks_delete on public.asks for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on
  public.projects, public.milestones, public.accomplishments, public.risks, public.asks
to authenticated, service_role;
