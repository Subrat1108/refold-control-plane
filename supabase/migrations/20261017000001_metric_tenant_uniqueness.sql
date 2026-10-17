-- Stage 2c — a tenant's metrics are its own.
--
-- `metric_values` has carried `tenant_id` since the tenants work, and
-- apply_proposal() has been inserting it ever since — but the uniqueness
-- constraint was never widened to match:
--
--   unique nulls not distinct (org_id, metric_key, period, project_id)
--
-- So two tenants of the same account recording the same metric for the same
-- period collide, and the second silently overwrites the first. Nothing has
-- hit it yet only because no metric rows exist at all (verified against
-- production: 0 rows). It would have bitten the first time an on-prem
-- customer reported per-namespace figures, which is exactly what this stage
-- is for.
alter table public.metric_values
  drop constraint if exists metric_values_org_id_metric_key_period_project_id_key;

alter table public.metric_values
  add constraint metric_values_scope_period_key
  unique nulls not distinct (org_id, tenant_id, metric_key, period, project_id);

comment on constraint metric_values_scope_period_key on public.metric_values is
  'One value per metric per period per SCOPE, where scope is the account plus optionally a tenant and a project. tenant_id must be part of this or a tenant''s figures overwrite its siblings''.';
