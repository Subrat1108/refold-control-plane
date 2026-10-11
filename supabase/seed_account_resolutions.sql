-- 7.5-pre2 Session 2 — fictional "account match needed" fixtures, local
-- only (never shipped to the cloud demo-data script — see seed_proposals.sql
-- for the same convention). One unresolved identifier + one held record per
-- decision the Approvals inbox's pinned section supports, so `npm run e2e`
-- can exercise all four without needing the real ingest pipeline to have
-- run first.

insert into public.proposals (id, target_table, operation, payload, source, source_ref, proposed_by, status) values
  ('20000000-0000-0000-0000-000000000001', 'account_resolution', 'create',
   '{"scope": "account", "observedName": "smoke-map-existing", "knownOrgId": null, "candidates": []}'::jsonb,
   'agent', 'smoke-map-existing', 'cs-sync-agent', 'pending'),
  ('20000000-0000-0000-0000-000000000002', 'account_resolution', 'create',
   '{"scope": "account", "observedName": "smoke-map-tenant", "knownOrgId": null, "candidates": []}'::jsonb,
   'agent', 'smoke-map-tenant', 'cs-sync-agent', 'pending'),
  ('20000000-0000-0000-0000-000000000003', 'account_resolution', 'create',
   '{"scope": "account", "observedName": "smoke-create-account", "knownOrgId": null, "candidates": []}'::jsonb,
   'agent', 'smoke-create-account', 'cs-sync-agent', 'pending'),
  ('20000000-0000-0000-0000-000000000004', 'account_resolution', 'create',
   '{"scope": "account", "observedName": "smoke-ignore", "knownOrgId": null, "candidates": []}'::jsonb,
   'agent', 'smoke-ignore', 'cs-sync-agent', 'pending')
on conflict (id) do nothing;

insert into public.proposals (id, target_table, operation, payload, source, source_ref, proposed_by, status, blocked_by_resolution_id) values
  ('20000000-0000-0000-0000-000000000011', 'escalations', 'create', '{"recordType": "escalation", "rawData": {"title": "smoke test escalation (map existing)"}, "rawProjectRef": null, "rawTenantRef": null}'::jsonb,
   'agent', 'smoke:res-1', 'cs-sync-agent', 'held', '20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000012', 'escalations', 'create', '{"recordType": "escalation", "rawData": {"title": "smoke test escalation (map tenant)"}, "rawProjectRef": null, "rawTenantRef": null}'::jsonb,
   'agent', 'smoke:res-2', 'cs-sync-agent', 'held', '20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000013', 'escalations', 'create', '{"recordType": "escalation", "rawData": {"title": "smoke test escalation (create account)"}, "rawProjectRef": null, "rawTenantRef": null}'::jsonb,
   'agent', 'smoke:res-3', 'cs-sync-agent', 'held', '20000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000014', 'escalations', 'create', '{"recordType": "escalation", "rawData": {"title": "smoke test escalation (ignore)"}, "rawProjectRef": null, "rawTenantRef": null}'::jsonb,
   'agent', 'smoke:res-4', 'cs-sync-agent', 'held', '20000000-0000-0000-0000-000000000004')
on conflict (id) do nothing;
