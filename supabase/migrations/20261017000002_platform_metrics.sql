-- Platform metrics, stage 1 — the vocabulary the CS team actually uses.
--
-- The catalogue held 15 EBR-style business measures and nothing operational,
-- so "how many workflow executions", "which apps are they using", "what is
-- their error rate" and "how much token are they burning" had nowhere to
-- live. Worse, all 15 were being offered as things to TYPE IN, when most are
-- outcomes that should fall out of the base figures.

-- ── 1. a metric knows where it comes from ─────────────────────────────────
create type public.metric_kind as enum ('observed', 'derived', 'judgement');

alter table public.metric_definitions
  add column kind public.metric_kind not null default 'judgement',
  -- For a derived metric: how it is computed, shown in the UI so it is
  -- obvious why it cannot be entered by hand.
  add column formula text;

comment on column public.metric_definitions.kind is
  'observed = measured by Refold and ingested (API or the on-prem agent); derived = computed from observed metrics, never entered; judgement = a person''s assessment, entered by hand.';

-- ── 2. a value can be a breakdown, and can describe any span ──────────────
create type public.metric_granularity as enum ('day', 'week', 'month');

alter table public.metric_values
  -- "Which apps are they using most" is a breakdown, not a number:
  -- metric_key='app_usage', dimension='slack'. Null for plain metrics, so
  -- every existing row and query is unaffected.
  add column dimension text,
  -- A single `period` date cannot distinguish 1 Oct's daily figure from
  -- October's monthly total. Existing rows follow the first-of-month
  -- convention, hence the default.
  add column granularity public.metric_granularity not null default 'month';

comment on column public.metric_values.dimension is
  'Optional breakdown within a metric — an app slug for app_usage, an error type for failures. Null means the metric has no breakdown.';

-- Both must join the uniqueness key. This key has already silently
-- overwritten data once by being too narrow (D-155, tenant_id), and would do
-- so again: without `dimension` every app would overwrite the last, and
-- without `granularity` a daily figure would overwrite the monthly one for
-- the first of the month.
alter table public.metric_values
  drop constraint if exists metric_values_scope_period_key;

alter table public.metric_values
  add constraint metric_values_scope_period_key
  unique nulls not distinct (org_id, tenant_id, metric_key, dimension, period, granularity, project_id);

-- ── 3. map an account to its Refold record ────────────────────────────────
-- Pulling per-account figures needs to know which Refold org an account IS.
-- `tenants` has carried these since the hierarchy work; `organizations` had
-- nothing at all, so no account could be matched to the source system.
alter table public.organizations
  add column refold_org_id text;

comment on column public.organizations.refold_org_id is
  'The Refold organisation this account corresponds to. Without it the metrics pull cannot identify the account in the source system.';

-- ── 4. the operational catalogue ──────────────────────────────────────────
-- Existing keys are RECLASSIFIED rather than duplicated: `execution_volume`
-- already means workflow executions, and `active_connectors` already counts
-- apps in production. Adding parallel keys would split the same measure in
-- two and make every chart ambiguous.
update public.metric_definitions set kind = 'observed'
 where key in ('execution_volume', 'active_connectors', 'agent_mcp_usage', 'mttr');

update public.metric_definitions
   set kind = 'derived',
       formula = '100 - (workflow_failures / execution_volume * 100)'
 where key = 'workflow_success_rate';

update public.metric_definitions
   set kind = 'derived',
       formula = 'self-healed failures / workflow_failures * 100'
 where key = 'self_healing_rate';

-- Everything else stays 'judgement' by default: engineering hours saved, SI
-- savings, deal acceleration and the governance checks are assessments, not
-- measurements, and no API will ever produce them.

insert into public.metric_definitions (key, label, unit, category, has_baseline, sort, kind, formula) values
  -- observed: ingested from the Refold API (cloud, dedicated cluster) or
  -- pushed by the on-prem agent.
  ('tenant_count',       'Tenants (signups)',      'count',   'platform', false, 100, 'observed', null),
  ('active_workflows',   'Active workflows',       'count',   'platform', false, 110, 'observed', null),
  ('workflow_failures',  'Failed executions',      'count',   'platform', false, 120, 'observed', null),
  ('token_usage',        'Token utilisation',      'count',   'platform', false, 130, 'observed', null),
  -- Dimensioned: one row per app, so "which apps are they using most" is a
  -- ranking rather than a single meaningless total.
  ('app_usage',          'App usage',              'count',   'platform', false, 140, 'observed', null),
  -- derived: computed from the above, never entered.
  ('error_rate',         'Error rate',             'percent', 'platform', false, 150, 'derived',
   'workflow_failures / execution_volume * 100'),
  ('executions_per_tenant', 'Executions per tenant', 'count', 'platform', false, 160, 'derived',
   'execution_volume / tenant_count')
on conflict (key) do nothing;

-- ── 5. provenance for pushed metrics ──────────────────────────────────────
-- An on-prem agent writes directly rather than proposing, so the only way to
-- trace a wrong figure back to the agent that sent it is to record which
-- token it used — the same provenance `proposals` already keeps.
alter table public.metric_values
  add column ingest_token_id uuid references public.ingest_tokens(id) on delete set null;

comment on column public.metric_values.ingest_token_id is
  'Which ingest token pushed this figure, when it came from a customer''s on-prem agent. Null for values entered by a person or pulled from the Refold API.';
