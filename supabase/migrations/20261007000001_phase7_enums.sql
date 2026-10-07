-- Phase 7.1 — CS Hub data model v3, enums (build-spec-v3 § 5).
-- New enum types only; no existing enums touched. Values marked "(assumed)" in
-- the accompanying devlog/decisions entries are not explicitly enumerated in
-- the spec — chosen as sensible defaults, easy to ALTER TYPE … ADD VALUE later.

create type public.org_health        as enum ('active', 'caution', 'risk');
create type public.lifecycle_stage   as enum ('prospect', 'poc', 'onboarding', 'live', 'expansion', 'renewal', 'churned');
create type public.deployment_model  as enum ('cloud', 'onprem_managed', 'onprem_airgapped');
create type public.data_access_mode  as enum ('api', 'manual', 'mixed');

create type public.project_health    as enum ('completed', 'on_schedule', 'caution', 'at_risk');
create type public.milestone_status  as enum ('not_started', 'in_progress', 'done', 'at_risk');       -- assumed
create type public.risk_severity     as enum ('low', 'medium', 'high', 'critical');                   -- assumed; shared by risks + escalations
create type public.risk_status       as enum ('open', 'mitigating', 'resolved', 'accepted');           -- assumed
create type public.ask_status        as enum ('open', 'in_progress', 'resolved');                      -- assumed
create type public.escalation_status as enum ('open', 'in_progress', 'resolved', 'closed');            -- assumed
create type public.ticket_priority   as enum ('p1', 'p2', 'p3', 'p4');                                 -- assumed
create type public.ticket_status     as enum ('open', 'pending', 'resolved', 'closed');                -- assumed
create type public.engagement_type   as enum ('call', 'check_in', 'qbr', 'ebr', 'note');

create type public.record_source     as enum ('manual', 'agent', 'chat', 'api', 'file');
create type public.proposal_operation as enum ('create', 'update', 'delete');
create type public.proposal_status   as enum ('pending', 'approved', 'rejected', 'superseded');
create type public.sync_run_mode     as enum ('scoped', 'backfill', 'daily');
create type public.sync_run_status   as enum ('running', 'success', 'failed', 'partial');              -- assumed
create type public.portfolio_note_kind as enum ('milestone', 'recommendation');
