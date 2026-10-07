-- Phase 6.1 — LOCAL demo fixtures (build-spec-v2 § 12)
-- Runs on `supabase db reset` for local dev ONLY (never shipped to prod). Gives
-- later blocks a couple of orgs + users to render. Passwords are demo-only.
--
-- Note: we insert auth.users + a matching auth.identities row directly (a
-- standard local-seed shortcut) so the demo logins work and the profiles FK is
-- satisfied. This runs only on a FRESH db init or `supabase db reset` — a plain
-- `supabase start` on an existing volume does NOT re-run it, so after pulling
-- seed changes you must `supabase db reset` for the new logins to exist.

create extension if not exists pgcrypto with schema extensions;

-- ── demo organizations ───────────────────────────────────────────────────────
-- external_ref doubles as the metrics-provider key. Until 6.5 wires live
-- metrics, it holds the MOCK org id so the 5.x pages render for these users
-- against the mock data provider (D-027/D-033).
insert into public.organizations (id, name, deployment_type, plan, status, external_ref) values
  ('00000000-0000-0000-0000-000000000002', 'Prism Analytics',       'cloud',       'growth',                 'active', 'org_cloud_001'),
  ('00000000-0000-0000-0000-000000000003', 'Meridian Laboratories', 'on_premise',  'self_hosted_enterprise', 'active', 'org_onprem_001')
on conflict (id) do nothing;

-- ── demo auth users ──────────────────────────────────────────────────────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001001', 'authenticated', 'authenticated',
   'super@refold.internal',   extensions.crypt('demo-super-2026',   extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001002', 'authenticated', 'authenticated',
   'owner@prismanalytics.io', extensions.crypt('demo-owner-2026',   extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001003', 'authenticated', 'authenticated',
   'owner@meridian-labs.jp',  extensions.crypt('demo-owner-2026',   extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001004', 'authenticated', 'authenticated',
   'analyst@prismanalytics.io', extensions.crypt('demo-analyst-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
on conflict (id) do nothing;

-- ── matching identities ──────────────────────────────────────────────────────
-- GoTrue-created users always have an auth.identities row; we add one per demo
-- user so the seed matches real structure and stays correct across GoTrue
-- versions (some flows/versions expect it). provider_id = user id for email.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001001',
   '{"sub":"00000000-0000-0000-0000-000000001001","email":"super@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000001002',
   '{"sub":"00000000-0000-0000-0000-000000001002","email":"owner@prismanalytics.io","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000001003',
   '{"sub":"00000000-0000-0000-0000-000000001003","email":"owner@meridian-labs.jp","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000001004',
   '{"sub":"00000000-0000-0000-0000-000000001004","email":"analyst@prismanalytics.io","email_verified":true,"phone_verified":false}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- ── demo org-defined sub-role (Prism only) — exercises the D-032 org_id scoping ─
insert into public.sub_roles (id, account_type, org_id, name, permissions, is_system) values
  ('00000000-0000-0000-0000-000000000210', 'cloud_customer',
   '00000000-0000-0000-0000-000000000002', 'Prism Finance', '{"read": true, "export": true}', false)
on conflict (id) do nothing;

-- ── demo profiles ────────────────────────────────────────────────────────────
-- super-admin (internal org)
insert into public.profiles (id, email, full_name, org_id, account_type, role, sub_role_id, status, created_by) values
  ('00000000-0000-0000-0000-000000001001', 'super@refold.internal', 'Priya Sharma',
   '00000000-0000-0000-0000-000000000001', 'super_admin', 'owner',
   '00000000-0000-0000-0000-000000000101', 'active', null),
-- Prism cloud owner
  ('00000000-0000-0000-0000-000000001002', 'owner@prismanalytics.io', 'Marcus Chen',
   '00000000-0000-0000-0000-000000000002', 'cloud_customer', 'owner',
   '00000000-0000-0000-0000-000000000201', 'active', '00000000-0000-0000-0000-000000001001'),
-- Meridian on-prem owner
  ('00000000-0000-0000-0000-000000001003', 'owner@meridian-labs.jp', 'Yuki Tanaka',
   '00000000-0000-0000-0000-000000000003', 'onprem_customer', 'owner',
   '00000000-0000-0000-0000-000000000301', 'active', '00000000-0000-0000-0000-000000001001'),
-- Prism member (analyst)
  ('00000000-0000-0000-0000-000000001004', 'analyst@prismanalytics.io', 'Amara Osei',
   '00000000-0000-0000-0000-000000000002', 'cloud_customer', 'member',
   '00000000-0000-0000-0000-000000000202', 'active', '00000000-0000-0000-0000-000000001002')
on conflict (id) do nothing;

-- ── Phase 7.1 — CS Hub fixtures (build-spec-v3 § 5) ─────────────────────────────
-- FICTIONAL only (confidentiality rule, spec § 0) — reuses the two existing
-- fictional demo accounts rather than inventing new org rows. Enough for 7.2/7.3
-- to render: projects, milestones, accomplishments, risks, an ask, an
-- escalation, tickets, engagements, metric values, and 2 pending proposals.
-- All attributed to the super-admin profile (Priya Sharma) as created_by.

-- Extend the two demo accounts with Phase 7 fields (health/lifecycle already
-- backfilled by the organizations_extend migration; these add variety + the
-- fields that migration couldn't guess: segment, owner, data access mode).
update public.organizations set
  segment_id = (select id from public.segments where name = 'Enterprise'),
  owner_profile_id = '00000000-0000-0000-0000-000000001001',
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
   health, live_tenants, dev_uat_tenants, goals, fdes, edl_profile_id,
   issue_tracker_url, source, created_by, updated_by, verified_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Workflow Automation Rollout', 'R42', '2026-06-01', '2026-10-15', '2026-11-01',
   'on_schedule', 148, 12, array['Migrate legacy ETL jobs to Refold workflows', 'Cut average build time by 30%'],
   array['Jordan Reyes'], '00000000-0000-0000-0000-000000001001',
   'https://issues.example.com/browse/PRISM-42', 'manual',
   '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001001', now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   'Genomics Pipeline Integration', 'R17', '2026-05-15', '2026-11-30', '2026-12-15',
   'caution', 63, 8, array['Automate sample-intake pipeline', 'Pass internal security review'],
   array['Sam Okafor'], null,
   'https://issues.example.com/browse/MERI-17', 'manual',
   '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001001', now())
on conflict (id) do nothing;

-- Milestones
insert into public.milestones (id, project_id, org_id, period, description, status, source, created_by) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-08-01', 'Phase 1 connector mapping complete', 'done', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-09-01', 'Pilot tenant cutover', 'in_progress', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-10-01', 'Full production rollout', 'not_started', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('11000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-09-01', 'Data schema validation', 'done', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('11000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-10-01', 'UAT sign-off', 'at_risk', 'manual', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- Accomplishments
insert into public.accomplishments (id, project_id, org_id, period, text, source, created_by) values
  ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-09-01', 'Reduced average integration build time by 35% after the connector refactor', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('12000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-09-01', 'Completed internal security review with no critical findings', 'manual', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- Risks
insert into public.risks (id, project_id, org_id, risk, impact, mitigation, severity, status, owner, source, created_by) values
  ('13000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Pilot tenant data volume exceeds staging capacity', 'Could delay pilot cutover by 2-3 weeks',
   'Provisioning additional staging capacity', 'medium', 'mitigating', 'Marcus Chen', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('13000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   'Air-gapped environment blocks automated metric collection', 'EBR metrics must be manually compiled each quarter',
   'Exploring a manual export workflow with customer IT', 'high', 'open', 'Yuki Tanaka', 'manual', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- Asks
insert into public.asks (id, project_id, org_id, text, owner, status, source, created_by) values
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Need customer to confirm the pilot tenant list by end of month', 'Marcus Chen', 'open', 'manual', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- Escalation (Meridian — matches the project's 'caution' health, visual variety)
insert into public.escalations (id, org_id, project_id, title, severity, raised_by, raised_at, status, source, created_by) values
  ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   'Customer reports repeated workflow timeouts in UAT', 'high', 'Yuki Tanaka', now() - interval '3 days', 'in_progress',
   'manual', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- Tickets
insert into public.tickets (id, org_id, external_key, title, priority, status, opened_at, system, source, created_by) values
  ('16000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'SUP-1042', 'API rate limit question', 'p3', 'resolved', now() - interval '20 days', 'Zendesk', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('16000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'SUP-1058', 'Webhook retry failing intermittently', 'p2', 'open', now() - interval '4 days', 'Zendesk', 'manual', '00000000-0000-0000-0000-000000001001'),
  ('16000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'SUP-1091', 'UAT timeout investigation', 'p1', 'open', now() - interval '2 days', 'Zendesk', 'manual', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- Engagements (touchpoints)
insert into public.engagements (id, org_id, type, engagement_date, attendees, summary, source, created_by) values
  ('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'qbr', '2026-09-20',
   array['Marcus Chen', 'Priya Sharma'], 'Q3 business review — on track for pilot cutover, discussed staging capacity risk.',
   'manual', '00000000-0000-0000-0000-000000001001'),
  ('17000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'check_in', '2026-09-25',
   array['Yuki Tanaka', 'Priya Sharma'], 'Monthly check-in — reviewed UAT timeout escalation and security review results.',
   'manual', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- Metric values
insert into public.metric_values (org_id, project_id, metric_key, period, value, source, created_by) values
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'workflow_success_rate', '2026-08-01', 98.7, 'manual', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'workflow_success_rate', '2026-09-01', 99.1, 'manual', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'execution_volume', '2026-09-01', 24718, 'manual', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'workflow_success_rate', '2026-09-01', 94.3, 'manual', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'mttr', '2026-09-01', 46, 'manual', '00000000-0000-0000-0000-000000001001')
on conflict (org_id, metric_key, period, project_id) do nothing;

-- Proposals (2 pending — exercises the Approvals inbox, 7.3)
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
