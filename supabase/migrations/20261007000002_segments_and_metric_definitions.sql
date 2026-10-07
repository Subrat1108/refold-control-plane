-- Phase 7.1 — lookup tables: segments, metric_definitions (build-spec-v3 § 2.2, § 5).
-- Pure lookups: super-admin only, RLS-gated, AAL2 on writes — but NOT given the
-- generic provenance columns or audit trigger (those attach to CS record tables
-- + organizations only; see 20261007000008). Editable in the UI later, no enum.

create table public.segments (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  sort      int  not null default 0,
  created_at timestamptz not null default now()
);

insert into public.segments (name, sort) values
  ('Enterprise', 1),
  ('SMB', 2);

-- metric_key is the natural key — short, stable, referenced directly by
-- metric_values.metric_key (no surrogate id needed for a pure catalog).
create table public.metric_definitions (
  key          text primary key,
  label        text not null,
  unit         text not null,
  category     text not null,
  has_baseline boolean not null default false,
  sort         int not null default 0
);

-- Seed: build-spec-v3 § 2.2 EBR metric catalog (generic, safe to commit).
insert into public.metric_definitions (key, label, unit, category, has_baseline, sort) values
  ('avg_build_time',          'Avg integration build time',          'hours',   'velocity',             true,  10),
  ('engineering_hours_saved', 'Engineering hours saved',             'hours',   'velocity',             false, 20),
  ('active_connectors',       'Active production connectors',        'count',   'velocity',             false, 30),
  ('workflow_success_rate',   'Workflow success rate',               'percent', 'operations',           false, 40),
  ('self_healing_rate',       'Self-healing rate',                   'percent', 'operations',           false, 50),
  ('mttr',                    'MTTR',                                'minutes', 'operations',           false, 60),
  ('execution_volume',        'Execution volume',                    'count',   'operations',           false, 70),
  ('si_outsourcing_savings',  'SI / outsourcing savings',             'usd',     'financial_roi',        true,  80),
  ('deal_acceleration',       'Pipeline / deal acceleration',         'days',    'financial_roi',        true,  90),
  ('maintenance_cost_offset', 'Maintenance cost offset',              'usd',     'financial_roi',        true,  100),
  ('integration_catalog_pct', 'Integration catalog coverage',         'percent', 'adoption',             false, 110),
  ('agent_mcp_usage',         'Agent & MCP usage',                   'count',   'adoption',             false, 120),
  ('p1_p2_sla',               'P1/P2 response SLA',                  'percent', 'governance_support',   false, 130),
  ('security_review_status',  'SOC2 / security / retention check',   'status',  'governance_support',   false, 140),
  ('docs_feedback_score',     'Docs feedback',                       'score',   'governance_support',   false, 150);

alter table public.segments           enable row level security;
alter table public.metric_definitions enable row level security;

create policy segments_select on public.segments
  for select to authenticated using (public.is_super_admin());
create policy segments_insert on public.segments
  for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy segments_update on public.segments
  for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy segments_delete on public.segments
  for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy metric_definitions_select on public.metric_definitions
  for select to authenticated using (public.is_super_admin());
create policy metric_definitions_insert on public.metric_definitions
  for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy metric_definitions_update on public.metric_definitions
  for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy metric_definitions_delete on public.metric_definitions
  for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on public.segments, public.metric_definitions to authenticated, service_role;
