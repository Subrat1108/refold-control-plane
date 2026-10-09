-- Phase 7.3 — fictional pending proposals, local only.
--
-- phase7_demo_data.sql (7.1, shipped to cloud too) already seeds 2 pending
-- proposals, both 'create' operations (risks, metric_values) — enough to
-- prove the inbox exists, but not enough to exercise 'update'/'delete' or
-- edit-then-approve. These 3 fill exactly that gap. Runs FOURTH (see
-- config.toml's [db.seed].sql_paths), after phase7_demo_data.sql's fixture
-- projects/milestones/tickets exist.
--
-- Never shipped to the cloud demo-data script — local only, to make 7.3's
-- screens fully testable during this build.

insert into public.proposals (id, org_id, target_table, target_id, operation, payload, source, source_ref, evidence_url, evidence_excerpt, confidence, proposed_by) values
  -- milestones update (agent) — "Pilot tenant cutover" moves to done.
  ('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'milestones', '11000000-0000-0000-0000-000000000002', 'update',
   '{"status": "done"}'::jsonb,
   'agent', 'slack:C100/42.001', 'https://slack.com/archives/C100/p42001', 'Team confirmed in #prism-delivery that the pilot cutover completed Friday.', 0.85, 'cs-sync-agent'),

  -- organizations health change (manual) — Prism, queued rather than applied
  -- directly, to prove even a manual-origin proposal flows through the inbox.
  ('17000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'organizations', '00000000-0000-0000-0000-000000000002', 'update',
   '{"health": "caution", "health_reason": "Pilot cutover milestone slipped two weeks"}'::jsonb,
   'manual', null, null, null, null, 'super@refold.internal'),

  -- tickets delete (agent) — a resolved ticket the sync determined is a dup.
  ('17000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'tickets', '16000000-0000-0000-0000-000000000001', 'delete',
   '{}'::jsonb,
   'agent', 'zendesk:SUP-1042', 'https://support.example.zendesk.com/tickets/1042', 'Duplicate of SUP-1039, already resolved there.', 0.78, 'cs-sync-agent')
on conflict (id) do nothing;
