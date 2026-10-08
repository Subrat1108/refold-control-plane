-- Refold CS Hub — FICTIONAL demo data (Phase 7.1, build-spec-v3 § 5).
--
-- CONFIDENTIALITY (spec § 0): this repo is public. Every name, account, risk,
-- ticket and metric below is fictional (reusing the already-established demo
-- companies Prism Analytics / Meridian Laboratories). Never add real customer
-- data to this file.
--
-- Idempotent: every write is a plain UPDATE, an INSERT ... ON CONFLICT DO
-- NOTHING keyed on a fixed id, or (metric_values) a natural-key ON CONFLICT —
-- safe to run this script more than once, on any environment, with no
-- duplicate or changed side effects on a second run.
--
-- Creates NO auth users. Attributes every record to whichever super_admin
-- profile already exists (resolved dynamically, oldest first) rather than a
-- fixed demo id — so this works standalone against a cloud project that only
-- has the real super-admin you provisioned yourself, with none of the local
-- demo users. If no super_admin profile exists yet, every created_by/
-- updated_by/owner/edl field below just lands NULL (all nullable) rather than
-- erroring — provision at least one super_admin first for attribution to show.
--
-- Local dev: included verbatim by supabase/seed.sql on every `db reset`.
-- Cloud: NOT run automatically. Paste this file into the Supabase SQL Editor
-- (Dashboard → SQL Editor) against the cloud project if you want the live
-- site to show sample CS Hub data — safe to re-run if you do it more than once.

do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id
  from public.profiles
  where account_type = 'super_admin'
  order by created_at asc
  limit 1;

  -- Two fictional demo accounts — created here if they don't already exist
  -- (e.g. a cloud project seeded only from migrations, with no local demo
  -- seed). On conflict, the existing row (from seed.sql locally) is untouched.
  insert into public.organizations (id, name, deployment_type, plan, status, external_ref) values
    ('00000000-0000-0000-0000-000000000002', 'Prism Analytics',       'cloud',      'growth',                 'active', 'org_cloud_001'),
    ('00000000-0000-0000-0000-000000000003', 'Meridian Laboratories', 'on_premise', 'self_hosted_enterprise', 'active', 'org_onprem_001')
  on conflict (id) do nothing;

  -- Phase 7 fields (health/lifecycle were already backfilled to 'active'/'live'
  -- by the organizations_extend migration for rows that pre-date it; these add
  -- variety + the fields that migration couldn't guess). owner_profile_id is
  -- NOT set here (7.2a, D-070): it's a derived column now — only the primary
  -- EDL/TA assignment in account_assignments can produce a value, and a
  -- direct write like this one would just be silently overridden back to
  -- whatever that derivation computes (NULL here on cloud, since this script
  -- never creates people — "do not add people to the cloud demo-data script").
  update public.organizations set
    segment_id = (select id from public.segments where name = 'Enterprise'),
    data_access_mode = 'api',
    aliases = array['prism-analytics', 'prismanalytics.io']
  where id = '00000000-0000-0000-0000-000000000002';

  update public.organizations set
    segment_id = (select id from public.segments where name = 'SMB'),
    health = 'caution', -- visual variety (Prism stays 'active')
    data_access_mode = 'manual', -- air-gapped on-prem; no API access
    aliases = array['meridian-labs', 'meridian-labs.jp']
  where id = '00000000-0000-0000-0000-000000000003';

  -- Projects
  insert into public.projects
    (id, org_id, name, release_no, start_date, go_live_date, expected_end_date,
     health, live_tenants, dev_uat_tenants, goals,
     issue_tracker_url, source, created_by, updated_by, verified_at) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
     'Workflow Automation Rollout', 'R42', '2026-06-01', '2026-10-15', '2026-11-01',
     'on_schedule', 148, 12, array['Migrate legacy ETL jobs to Refold workflows', 'Cut average build time by 30%'],
     'https://issues.example.com/browse/PRISM-42', 'manual',
     v_admin_id, v_admin_id, now()),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
     'Genomics Pipeline Integration', 'R17', '2026-05-15', '2026-11-30', '2026-12-15',
     'caution', 63, 8, array['Automate sample-intake pipeline', 'Pass internal security review'],
     'https://issues.example.com/browse/MERI-17', 'manual',
     v_admin_id, v_admin_id, now())
  on conflict (id) do nothing;

  -- Project members (7.2a replaces projects.fdes/edl_profile_id — D-071).
  -- Prism's project keeps its EDL (previously edl_profile_id); Meridian's had
  -- none. Fictional FDE assignments are local-only (seed.sql), not here —
  -- "do not add people to the cloud demo-data script" (D-069 fixtures note).
  if v_admin_id is not null then
    insert into public.project_members (project_id, profile_id, role) values
      ('10000000-0000-0000-0000-000000000001', v_admin_id, 'edl')
    on conflict (project_id, profile_id, role) do nothing;
  end if;

  -- Milestones
  insert into public.milestones (id, project_id, org_id, period, description, status, source, created_by) values
    ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-08-01', 'Phase 1 connector mapping complete', 'done', 'manual', v_admin_id),
    ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-09-01', 'Pilot tenant cutover', 'in_progress', 'manual', v_admin_id),
    ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-10-01', 'Full production rollout', 'not_started', 'manual', v_admin_id),
    ('11000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-09-01', 'Data schema validation', 'done', 'manual', v_admin_id),
    ('11000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-10-01', 'UAT sign-off', 'at_risk', 'manual', v_admin_id)
  on conflict (id) do nothing;

  -- Accomplishments
  insert into public.accomplishments (id, project_id, org_id, period, text, source, created_by) values
    ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-09-01', 'Reduced average integration build time by 35% after the connector refactor', 'manual', v_admin_id),
    ('12000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-09-01', 'Completed internal security review with no critical findings', 'manual', v_admin_id)
  on conflict (id) do nothing;

  -- Risks
  insert into public.risks (id, project_id, org_id, risk, impact, mitigation, severity, status, owner, source, created_by) values
    ('13000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
     'Pilot tenant data volume exceeds staging capacity', 'Could delay pilot cutover by 2-3 weeks',
     'Provisioning additional staging capacity', 'medium', 'mitigating', 'Marcus Chen', 'manual', v_admin_id),
    ('13000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
     'Air-gapped environment blocks automated metric collection', 'EBR metrics must be manually compiled each quarter',
     'Exploring a manual export workflow with customer IT', 'high', 'open', 'Yuki Tanaka', 'manual', v_admin_id)
  on conflict (id) do nothing;

  -- Asks
  insert into public.asks (id, project_id, org_id, text, owner, status, source, created_by) values
    ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
     'Need customer to confirm the pilot tenant list by end of month', 'Marcus Chen', 'open', 'manual', v_admin_id)
  on conflict (id) do nothing;

  -- Escalation (Meridian — matches the project's 'caution' health, visual variety)
  insert into public.escalations (id, org_id, project_id, title, severity, raised_by, raised_at, status, source, created_by) values
    ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
     'Customer reports repeated workflow timeouts in UAT', 'high', 'Yuki Tanaka', now() - interval '3 days', 'in_progress',
     'manual', v_admin_id)
  on conflict (id) do nothing;

  -- Tickets
  insert into public.tickets (id, org_id, external_key, title, priority, status, opened_at, system, source, created_by) values
    ('16000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'SUP-1042', 'API rate limit question', 'p3', 'resolved', now() - interval '20 days', 'Zendesk', 'manual', v_admin_id),
    ('16000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'SUP-1058', 'Webhook retry failing intermittently', 'p2', 'open', now() - interval '4 days', 'Zendesk', 'manual', v_admin_id),
    ('16000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'SUP-1091', 'UAT timeout investigation', 'p1', 'open', now() - interval '2 days', 'Zendesk', 'manual', v_admin_id)
  on conflict (id) do nothing;

  -- Engagements (touchpoints)
  insert into public.engagements (id, org_id, type, engagement_date, attendees, summary, source, created_by) values
    ('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'qbr', '2026-09-20',
     array['Marcus Chen', 'Priya Sharma'], 'Q3 business review — on track for pilot cutover, discussed staging capacity risk.',
     'manual', v_admin_id),
    ('17000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'check_in', '2026-09-25',
     array['Yuki Tanaka', 'Priya Sharma'], 'Monthly check-in — reviewed UAT timeout escalation and security review results.',
     'manual', v_admin_id)
  on conflict (id) do nothing;

  -- Metric values (natural-key dedupe — no fixed id needed)
  insert into public.metric_values (org_id, project_id, metric_key, period, value, source, created_by) values
    ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'workflow_success_rate', '2026-08-01', 98.7, 'manual', v_admin_id),
    ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'workflow_success_rate', '2026-09-01', 99.1, 'manual', v_admin_id),
    ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'execution_volume', '2026-09-01', 24718, 'manual', v_admin_id),
    ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'workflow_success_rate', '2026-09-01', 94.3, 'manual', v_admin_id),
    ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'mttr', '2026-09-01', 46, 'manual', v_admin_id)
  on conflict (org_id, metric_key, period, project_id) do nothing;

  -- Proposals (2 pending — exercises the Approvals inbox, 7.3). proposed_by/
  -- triggered_by are free text per the schema (D-057), not profile FKs, so
  -- these need no admin-id substitution.
  insert into public.proposals
    (id, org_id, target_table, target_id, operation, payload, source, source_ref,
     evidence_url, evidence_excerpt, confidence, proposed_by, triggered_by, status) values
    ('18000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'risks', null, 'create',
     '{"risk": "Customer mentioned API latency spikes during peak hours", "impact": "May affect pilot tenant SLA", "severity": "medium"}'::jsonb,
     'agent', 'slack:C123/1733000000.000100',
     'https://example.slack.com/archives/C123/p1733000000000100',
     'Customer mentioned API latency spikes during peak hours in #prism-analytics.', 0.72,
     'cs-sync-agent', 'system', 'pending'),
    ('18000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'metric_values', null, 'create',
     '{"metric_key": "mttr", "period": "2026-10-01", "value": 42}'::jsonb,
     'file', 'usage-export:2026-10-07',
     null, 'Extracted from the October usage export bundle.', 0.95,
     'cs-sync-agent', 'system', 'pending')
  on conflict (id) do nothing;
end $$;
