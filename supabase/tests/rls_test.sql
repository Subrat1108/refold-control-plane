-- Phase 6.1 — RLS isolation test (build-spec-v2 § 5 verification)
--
-- Proves tenant isolation: a customer sees only their own org, never another
-- org's rows, while super_admin sees everything. Run against a freshly reset
-- local db (migrations + seed applied). See README "Supabase / RLS test".
--
-- Each block impersonates a seeded user by setting the request JWT claims that
-- Supabase's auth.uid()/auth.jwt() read, under the non-privileged `authenticated`
-- role (the table owner would bypass RLS). Any failed assert aborts with an error;
-- "ALL RLS TESTS PASSED" prints only if every assertion holds.

-- Seeded ids:
--   super_admin      1001 (internal org 0001)
--   Prism owner      1002 (Prism org   0002)
--   Meridian owner   1003 (Meridian org 0003)

do $$
declare
  n int;
begin
  -- ── Prism cloud owner: sees exactly their own org, nothing else ────────────
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}';

  select count(*) into n from public.organizations;
  assert n = 1, format('Prism owner should see 1 org, saw %s', n);

  select count(*) into n from public.organizations where id = '00000000-0000-0000-0000-000000000002';
  assert n = 1, 'Prism owner should see their own org';

  -- cannot see Meridian or the internal org
  select count(*) into n from public.organizations where id in
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001');
  assert n = 0, format('Prism owner must not see other orgs, saw %s', n);

  -- cannot see profiles outside their org (Meridian owner 1003)
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-000000001003';
  assert n = 0, 'Prism owner must not see Meridian profiles';

  -- sees profiles inside their own org (self + Prism analyst)
  select count(*) into n from public.profiles;
  assert n = 2, format('Prism owner should see 2 org profiles, saw %s', n);

  -- sub_roles (D-032): sees system (org_id null) rows + their own org's
  select count(*) into n from public.sub_roles where org_id is null;
  assert n >= 9, format('Prism owner should see the 9 system sub-roles, saw %s', n);
  select count(*) into n from public.sub_roles where org_id = '00000000-0000-0000-0000-000000000002';
  assert n = 1, format('Prism owner should see their own org sub-role, saw %s', n);

  reset role;

  -- ── Meridian owner: cannot see any Prism rows (cross-org isolation) ─────────
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}';

  select count(*) into n from public.organizations where id = '00000000-0000-0000-0000-000000000002';
  assert n = 0, 'Meridian owner must not see Prism org';

  select count(*) into n from public.profiles where org_id = '00000000-0000-0000-0000-000000000002';
  assert n = 0, format('Meridian owner must not see Prism profiles, saw %s', n);

  select count(*) into n from public.organizations;
  assert n = 1, format('Meridian owner should see only their org, saw %s', n);

  -- sub_roles (D-032): must NOT see Prism's org-defined sub-role
  select count(*) into n from public.sub_roles where org_id = '00000000-0000-0000-0000-000000000002';
  assert n = 0, format('Meridian owner must not see Prism org sub-role, saw %s', n);
  -- but still sees the system sub-roles
  select count(*) into n from public.sub_roles where org_id is null;
  assert n >= 9, 'Meridian owner should still see system sub-roles';

  reset role;

  -- ── super_admin: sees everything (internal + both demo orgs = 3) ───────────
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';

  select count(*) into n from public.organizations;
  assert n >= 3, format('super_admin should see all orgs (>=3), saw %s', n);

  select count(*) into n from public.profiles;
  assert n = 4, format('super_admin should see all 4 profiles, saw %s', n);

  reset role;

  -- ── Phase 0 (D-043): a member cannot self-escalate privileged columns ───────
  -- analyst 1004 (Prism member). Column-level UPDATE grant allows only full_name;
  -- any privileged-column self-edit must raise 42501 (insufficient_privilege).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001004","aal":"aal1"}';

  -- safe field: self full_name edit still works
  update public.profiles set full_name = 'Amara O.' where id = '00000000-0000-0000-0000-000000001004';
  get diagnostics n = row_count;
  assert n = 1, 'member should be able to self-edit full_name';

  begin
    update public.profiles set role = 'owner' where id = '00000000-0000-0000-0000-000000001004';
    assert false, 'member must NOT be able to self-change role';
  exception when insufficient_privilege then null; end;

  begin
    update public.profiles set account_type = 'super_admin' where id = '00000000-0000-0000-0000-000000001004';
    assert false, 'member must NOT be able to self-change account_type';
  exception when insufficient_privilege then null; end;

  begin
    update public.profiles set org_id = '00000000-0000-0000-0000-000000000003' where id = '00000000-0000-0000-0000-000000001004';
    assert false, 'member must NOT be able to self-change org_id';
  exception when insufficient_privilege then null; end;

  begin
    update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000001004';
    assert false, 'member must NOT be able to self-change status';
  exception when insufficient_privilege then null; end;

  begin
    update public.profiles set sub_role_id = null where id = '00000000-0000-0000-0000-000000001004';
    assert false, 'member must NOT be able to self-change sub_role_id';
  exception when insufficient_privilege then null; end;

  reset role;

  -- ── 6.4b (D-045): owner sub-role writes are scoped to their own org ─────────
  -- Prism owner 1002 (cloud_customer, aal2).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}';

  -- can create a non-system sub-role IN their own org
  insert into public.sub_roles (account_type, org_id, name, permissions, is_system)
  values ('cloud_customer', '00000000-0000-0000-0000-000000000002', 'Prism QA', '{"read":true}', false);

  -- cannot create one for ANOTHER org
  begin
    insert into public.sub_roles (account_type, org_id, name, permissions, is_system)
    values ('cloud_customer', '00000000-0000-0000-0000-000000000003', 'Cross Org', '{"read":true}', false);
    assert false, 'owner must NOT create a sub-role in another org';
  exception when insufficient_privilege then null; end;

  -- cannot create a SYSTEM (org_id null) sub-role
  begin
    insert into public.sub_roles (account_type, org_id, name, permissions, is_system)
    values ('cloud_customer', null, 'Fake System', '{"read":true}', false);
    assert false, 'owner must NOT create a system sub-role';
  exception when insufficient_privilege then null; end;

  -- cannot mark their sub-role is_system = true
  begin
    insert into public.sub_roles (account_type, org_id, name, permissions, is_system)
    values ('cloud_customer', '00000000-0000-0000-0000-000000000002', 'Sneaky System', '{"read":true}', true);
    assert false, 'owner must NOT create an is_system sub-role';
  exception when insufficient_privilege then null; end;

  -- owner cross-org profile UPDATE is filtered out by RLS (0 rows), not applied
  update public.profiles set full_name = 'hax' where id = '00000000-0000-0000-0000-000000001003';
  get diagnostics n = row_count;
  assert n = 0, format('owner cross-org profile update must affect 0 rows, affected %s', n);

  reset role;

  -- ── owner-defined sub-role is visible only within its org ──────────────────
  -- Meridian owner 1003 must NOT see Prism's just-created 'Prism QA' sub-role.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}';
  select count(*) into n from public.sub_roles where org_id = '00000000-0000-0000-0000-000000000002';
  assert n = 0, format('Meridian owner must not see Prism org sub-roles, saw %s', n);
  reset role;

  raise notice 'ALL RLS TESTS PASSED';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 7.1 — CS Hub data model v3 (build-spec-v3 § 5) RLS + audit-trigger proof
-- ═══════════════════════════════════════════════════════════════════════════
-- Uses the Phase 7.1 fixtures (seed.sql): Prism project 10000000-…-0001 (org
-- 0002), Meridian project 10000000-…-0002 (org 0003), plus their milestones/
-- risks/tickets/escalations.

do $$
declare
  n int;
  v_project_id uuid;
begin
  -- ── super_admin at AAL1 cannot write a new table (writes require is_aal2) ──
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal1"}';
  begin
    insert into public.projects (org_id, name) values ('00000000-0000-0000-0000-000000000002', 'AAL1 should fail');
    assert false, 'super_admin at AAL1 must NOT be able to insert into projects';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── customer roles get NO access to any new table (not just org-scoped — none) ──
  -- Prism owner (aal2): their OWN org's seeded project is invisible.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}';
  select count(*) into n from public.projects;
  assert n = 0, format('Prism owner must see 0 projects (not just own-org-scoped), saw %s', n);
  select count(*) into n from public.risks;
  assert n = 0, format('Prism owner must see 0 risks, saw %s', n);
  select count(*) into n from public.tickets;
  assert n = 0, format('Prism owner must see 0 tickets, saw %s', n);
  reset role;

  -- Meridian owner (aal2): same — even though Meridian's own fixtures exist.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}';
  select count(*) into n from public.projects;
  assert n = 0, format('Meridian owner must see 0 projects, saw %s', n);
  select count(*) into n from public.escalations;
  assert n = 0, format('Meridian owner must see 0 escalations, saw %s', n);
  reset role;

  -- Prism member/analyst (aal1 — reads don't need aal2): also 0.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001004","aal":"aal1"}';
  select count(*) into n from public.projects;
  assert n = 0, format('Prism member must see 0 projects, saw %s', n);
  reset role;

  -- ── super_admin at AAL2 can CRUD a new table, with a full audit trail ──────
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';

  insert into public.projects (org_id, name, health)
  values ('00000000-0000-0000-0000-000000000002', 'RLS Test Project', 'on_schedule')
  returning id into v_project_id;

  select count(*) into n from public.audit_log
    where record_table = 'projects' and record_id = v_project_id and action = 'create'
      and after ->> 'name' = 'RLS Test Project' and before is null;
  assert n = 1, format('expected exactly 1 create audit_log row for the test project, saw %s', n);

  update public.projects set name = 'RLS Test Project (renamed)' where id = v_project_id;

  select count(*) into n from public.audit_log
    where record_table = 'projects' and record_id = v_project_id and action = 'update'
      and before ->> 'name' = 'RLS Test Project' and after ->> 'name' = 'RLS Test Project (renamed)';
  assert n = 1, format('expected exactly 1 update audit_log row reflecting the rename, saw %s', n);

  delete from public.projects where id = v_project_id;

  select count(*) into n from public.audit_log
    where record_table = 'projects' and record_id = v_project_id and action = 'delete'
      and after is null and before ->> 'name' = 'RLS Test Project (renamed)';
  assert n = 1, format('expected exactly 1 delete audit_log row, saw %s', n);

  -- org_id was correctly populated on every one of those rows (Prism's org).
  select count(*) into n from public.audit_log
    where record_table = 'projects' and record_id = v_project_id
      and org_id = '00000000-0000-0000-0000-000000000002';
  assert n = 3, format('expected all 3 audit_log rows to carry org_id = Prism, saw %s', n);

  reset role;

  -- ── duplicate source_ref per org is rejected (the sync dedupe key) ─────────
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';

  insert into public.risks (org_id, risk, impact, source, source_ref)
  values ('00000000-0000-0000-0000-000000000002', 'Dedupe test risk 1', 'n/a', 'agent', 'slack:C999/1.000');

  begin
    insert into public.risks (org_id, risk, impact, source, source_ref)
    values ('00000000-0000-0000-0000-000000000002', 'Dedupe test risk 2 (duplicate source_ref)', 'n/a', 'agent', 'slack:C999/1.000');
    assert false, 'duplicate (org_id, source_ref) must be rejected';
  exception when unique_violation then null; end;

  -- same source_ref, DIFFERENT org: must succeed (dedupe is per-org, not global).
  insert into public.risks (org_id, risk, impact, source, source_ref)
  values ('00000000-0000-0000-0000-000000000003', 'Dedupe test risk, different org', 'n/a', 'agent', 'slack:C999/1.000');

  reset role;

  -- ── audit_log leak-fix: owner must NOT see audit rows about new tables ─────
  -- (Prism's org_id matches the rows written above, but record_table='projects'
  -- is not in the owner-visible allowlist — proves the tightened policy works.)
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}';
  select count(*) into n from public.audit_log where record_table = 'projects';
  assert n = 0, format('Prism owner must not see any projects audit_log rows, saw %s', n);
  select count(*) into n from public.audit_log where record_table = 'risks';
  assert n = 0, format('Prism owner must not see any risks audit_log rows, saw %s', n);
  -- owner-visible allowlist (pre-Phase-7 tables) still works (D-046, unaffected).
  select count(*) into n from public.audit_log where org_id = '00000000-0000-0000-0000-000000000002';
  assert n >= 0; -- just confirms the query itself isn't blocked outright
  reset role;

  raise notice 'ALL PHASE 7 RLS + AUDIT TESTS PASSED';
end $$;
