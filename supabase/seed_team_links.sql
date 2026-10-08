-- Phase 7.2a — local-only links that need BOTH seed.sql's fictional CS people
-- AND phase7_demo_data.sql's fixture projects to already exist. Runs THIRD
-- (see config.toml's [db.seed].sql_paths) — project_members.project_id would
-- violate its FK if this ran any earlier, since the project rows only exist
-- after phase7_demo_data.sql has run.
--
-- Local only — never shipped to the cloud demo-data script (these people
-- don't exist there).

insert into public.project_members (project_id, profile_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002002', 'edl'), -- Reza -> Prism project
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002004', 'fde'), -- Tomás -> Prism project
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002006', 'fde')  -- Owen -> Meridian project
on conflict (project_id, profile_id, role) do nothing;
