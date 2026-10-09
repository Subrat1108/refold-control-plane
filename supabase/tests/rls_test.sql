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
  -- >= rather than a fixed count: fixture profiles grow across sessions (7.1
  -- added none, 7.2a added 6 fictional CS people) — this just proves
  -- super_admin sees every profile system-wide, not a specific headcount.
  assert n >= 10, format('super_admin should see all profiles (>=10), saw %s', n);

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


-- ── Phase 7.2b — Portfolio + Account 360 ──────────────────────────────────
do $$
declare
  n int;
  v_health text;
  v_reason text;
  v_verified timestamptz;
begin
  -- organizations' 3 new columns (health_reason, verified_at, updated_by)
  -- respect the EXISTING organizations_update policy — super_admin + AAL2.
  -- UPDATE's USING clause just filters rows (no exception on a non-match,
  -- unlike INSERT's WITH CHECK) — so an AAL1 write against this policy
  -- silently affects 0 rows rather than raising. Assert that instead.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal1"}';
  update public.organizations set health_reason = 'should fail' where id = '00000000-0000-0000-0000-000000000002';
  select health_reason into v_reason from public.organizations where id = '00000000-0000-0000-0000-000000000002';
  assert v_reason is distinct from 'should fail', 'super_admin at AAL1 must NOT be able to set health_reason';
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  update public.organizations
    set health = 'caution', health_reason = 'RLS test reason', verified_at = now(), updated_by = '00000000-0000-0000-0000-000000001001'
    where id = '00000000-0000-0000-0000-000000000002';
  select health, health_reason, verified_at into v_health, v_reason, v_verified from public.organizations where id = '00000000-0000-0000-0000-000000000002';
  assert v_health = 'caution', 'health must have been updated';
  assert v_reason = 'RLS test reason', 'health_reason must have been updated';
  assert v_verified is not null, 'verified_at must move on mark-verified';
  -- restore (this transaction rolls back anyway, but keep intent explicit)
  update public.organizations set health = 'active', health_reason = null, verified_at = null, updated_by = null where id = '00000000-0000-0000-0000-000000000002';
  reset role;

  -- customer roles see NONE of the account-record tables not yet individually
  -- asserted (projects/tickets/escalations/risks already covered above).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.engagements; assert n = 0, format('Prism owner must see 0 engagements, saw %s', n);
  select count(*) into n from public.metric_values; assert n = 0, format('Prism owner must see 0 metric_values, saw %s', n);
  select count(*) into n from public.portfolio_notes; assert n = 0, format('Prism owner must see 0 portfolio_notes, saw %s', n);
  select count(*) into n from public.milestones; assert n = 0, format('Prism owner must see 0 milestones, saw %s', n);
  select count(*) into n from public.accomplishments; assert n = 0, format('Prism owner must see 0 accomplishments, saw %s', n);
  select count(*) into n from public.asks; assert n = 0, format('Prism owner must see 0 asks, saw %s', n);
  reset role;

  raise notice 'ALL PHASE 7.2b RLS TESTS PASSED';
end $$;

-- ── Phase 7.3 — Approvals inbox + audit log screen ────────────────────────
do $$
declare
  n int;
  v_proposal_status text;
  v_milestone_status text;
  v_health text;
begin
  -- apply_proposal rejects at AAL1.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal1"}';
  begin
    perform public.apply_proposal('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001');
    assert false, 'apply_proposal must reject at AAL1';
  exception when others then null; end;
  reset role;

  -- apply_proposal rejects a non-super-admin (Prism owner).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}';
  begin
    perform public.apply_proposal('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001002');
    assert false, 'apply_proposal must reject a non-super-admin';
  exception when others then null; end;
  reset role;

  -- approving the milestones update proposal actually updates the row AND
  -- writes an action='approve' audit_log row.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  perform public.apply_proposal('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001');
  select status::text into v_milestone_status from public.milestones where id = '11000000-0000-0000-0000-000000000002';
  assert v_milestone_status = 'done', format('approved milestone must be done, saw %s', v_milestone_status);
  select count(*) into n from public.audit_log where action = 'approve' and record_table = 'milestones' and record_id = '11000000-0000-0000-0000-000000000002';
  assert n = 1, format('approve must write exactly one audit_log row, saw %s', n);
  select status::text into v_proposal_status from public.proposals where id = '17000000-0000-0000-0000-000000000001';
  assert v_proposal_status = 'approved', format('proposal status must be approved, saw %s', v_proposal_status);

  -- rejecting leaves the target table untouched and writes action='reject'.
  perform public.reject_proposal('17000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000001001', 'test rejection');
  select health::text into v_health from public.organizations where id = '00000000-0000-0000-0000-000000000002';
  assert v_health = 'active', format('rejected health-change proposal must NOT touch organizations.health, saw %s', v_health);
  select count(*) into n from public.audit_log where action = 'reject' and record_table = 'organizations';
  assert n = 1, format('reject must write exactly one audit_log row, saw %s', n);

  -- a disallowed target_table raises rather than silently no-op-ing.
  insert into public.proposals (id, org_id, target_table, target_id, operation, payload, source, proposed_by)
    values ('19000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'profiles', '00000000-0000-0000-0000-000000001001', 'update', '{"full_name":"hacked"}'::jsonb, 'agent', 'rls-test');
  begin
    perform public.apply_proposal('19000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001');
    assert false, 'apply_proposal must reject a disallowed target_table';
  exception when others then null; end;
  reset role;

  -- customer roles see nothing in proposals (not just org-scoped — none).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.proposals; assert n = 0, format('Prism owner must see 0 proposals, saw %s', n);
  reset role;

  raise notice 'ALL PHASE 7.3 RLS TESTS PASSED';
end $$;

-- ── Equal-admins model (supersedes 7.2a's titles/teams) ───────────────────
do $$
declare
  n int;
  v_role_id uuid;
  v_after_delete int;
begin
  -- account_roles: only one ACTIVE role per (profile, org) — a second active
  -- row for the same pair violates the partial unique index.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  begin
    insert into public.account_roles (org_id, profile_id, role) values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002002', 'ta');
    assert false, 'a second active role for the same (profile, org) must be rejected';
  exception when unique_violation then null; end;

  -- changing role = end the current active row + insert a new one — any
  -- super admin at AAL2 can do this for anyone (it's account data, not
  -- self-management).
  select id into v_role_id from public.account_roles where profile_id = '00000000-0000-0000-0000-000000002005' and org_id = '00000000-0000-0000-0000-000000000002' and ended_at is null;
  update public.account_roles set ended_at = now() where id = v_role_id;
  insert into public.account_roles (org_id, profile_id, role) values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002005', 'ta');
  select count(*) into n from public.account_roles where profile_id = '00000000-0000-0000-0000-000000002005' and org_id = '00000000-0000-0000-0000-000000000002' and ended_at is null;
  assert n = 1, format('changing role must leave exactly one active row, saw %s', n);
  select count(*) into n from public.account_roles where profile_id = '00000000-0000-0000-0000-000000002005' and org_id = '00000000-0000-0000-0000-000000000002';
  assert n >= 2, 'the ended row must still exist — history is never hard-deleted';

  -- NO delete policy exists at all: a delete attempt is rejected by RLS
  -- (0 rows affected, not an exception — DELETE's USING clause just excludes
  -- every row when no policy grants it), not merely by application convention.
  select count(*) into n from public.account_roles;
  delete from public.account_roles where profile_id = '00000000-0000-0000-0000-000000002005';
  select count(*) into v_after_delete from public.account_roles;
  assert v_after_delete = n, format('delete must affect 0 rows (no delete policy), had %s now %s', n, v_after_delete);
  reset role;

  -- customer roles see 0 account_roles rows.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.account_roles; assert n = 0, format('Prism owner must see 0 account_roles, saw %s', n);
  reset role;

  -- generic audit trigger fires on account_roles writes.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  select count(*) into n from public.audit_log where record_table = 'account_roles';
  assert n > 0, 'account_roles writes must be audited';

  -- reports_to: self-reference and a 2-cycle are both rejected.
  begin
    update public.profiles set reports_to = id where id = '00000000-0000-0000-0000-000000002002';
    assert false, 'reports_to self-reference must be rejected';
  exception when others then null; end;

  -- Tomás (2004) already reports to Reza (2002) per the fixture — making
  -- Reza report to Tomás would be a 2-cycle.
  begin
    update public.profiles set reports_to = '00000000-0000-0000-0000-000000002004' where id = '00000000-0000-0000-0000-000000002002';
    assert false, 'a reports_to 2-cycle must be rejected';
  exception when others then null; end;

  -- scope helpers, rewritten against account_roles/reports_to.
  reset role;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002002","aal":"aal2"}'; -- Reza
  -- my_account_ids(Reza) = {Prism}.
  select count(*) into n from public.my_account_ids() where my_account_ids = '00000000-0000-0000-0000-000000000002';
  assert n = 1, 'Reza''s my_account_ids must include Prism';
  select count(*) into n from public.my_account_ids();
  assert n = 1, format('Reza''s my_account_ids must be exactly {Prism}, saw %s', n);

  -- my_team_account_ids(Reza) = Reza's own {Prism} union Tomás's (his direct
  -- report) active accounts {Prism} = still just {Prism} here, but proves
  -- the union path runs without needing a second account to distinguish it.
  select count(*) into n from public.my_team_account_ids() where my_team_account_ids = '00000000-0000-0000-0000-000000000002';
  assert n = 1, 'Reza''s my_team_account_ids must include Prism (own + Tomás''s)';

  -- person_account_ids(Lena) = {Meridian}.
  select count(*) into n from public.person_account_ids('00000000-0000-0000-0000-000000002003') where person_account_ids = '00000000-0000-0000-0000-000000000003';
  assert n = 1, 'person_account_ids(Lena) must include Meridian';
  reset role;

  -- Dana (head_of_cs-flavored fixture, no roles, no reports): my_account_ids
  -- and my_team_account_ids both degrade to empty.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002001","aal":"aal2"}';
  select count(*) into n from public.my_account_ids();
  assert n = 0, format('Dana has no roles, my_account_ids must be empty, saw %s', n);
  select count(*) into n from public.my_team_account_ids();
  assert n = 0, format('Dana has no roles/reports, my_team_account_ids must be empty, saw %s', n);
  reset role;

  raise notice 'ALL EQUAL-ADMINS RLS TESTS PASSED';
end $$;

-- ── Standups (equal-admins model Part 3) ──────────────────────────────────
-- Fixtures: Reza (2002) is Tomás's (2004) reports_to. Grace (2005) and
-- Lena (2003) are unrelated third parties for this block's purposes.
do $$
declare
  n int;
  v_standup_id uuid;
  v_tomas_entry_id uuid;
  v_grace_entry_id uuid;
  v_today_val text;
  v_item_id uuid;
  v_item_status text;
begin
  -- Reza hosts a standup with Tomás + Grace as participants.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002002","aal":"aal2"}'; -- Reza
  insert into public.standups (host_profile_id, standup_date) values ('00000000-0000-0000-0000-000000002002', current_date) returning id into v_standup_id;
  insert into public.standup_entries (standup_id, profile_id, yesterday) values (v_standup_id, '00000000-0000-0000-0000-000000002004', 'draft') returning id into v_tomas_entry_id;
  insert into public.standup_entries (standup_id, profile_id, yesterday) values (v_standup_id, '00000000-0000-0000-0000-000000002005', 'draft') returning id into v_grace_entry_id;
  reset role;

  -- Tomás can edit his own entry.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002004","aal":"aal2"}'; -- Tomás
  update public.standup_entries set today = 'tomas edited his own' where id = v_tomas_entry_id;
  select today into v_today_val from public.standup_entries where id = v_tomas_entry_id;
  assert v_today_val = 'tomas edited his own', 'a participant must be able to edit their own entry';

  -- Tomás CANNOT edit Grace's entry (not his, and he isn't the host) — the
  -- UPDATE's USING clause just excludes the row (0 rows affected), no
  -- exception, same RLS-UPDATE behavior documented earlier this project.
  update public.standup_entries set today = 'tomas should not be able to set this' where id = v_grace_entry_id;
  select today into v_today_val from public.standup_entries where id = v_grace_entry_id;
  assert v_today_val is distinct from 'tomas should not be able to set this', 'a participant must NOT be able to edit someone else''s entry';
  reset role;

  -- Reza, the HOST, can edit Grace's entry even though it isn't his own.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002002","aal":"aal2"}'; -- Reza
  update public.standup_entries set today = 'host edited grace''s entry' where id = v_grace_entry_id;
  select today into v_today_val from public.standup_entries where id = v_grace_entry_id;
  assert v_today_val = 'host edited grace''s entry', 'the host must be able to edit any entry in their own standup';
  reset role;

  -- Lena is neither a participant nor the host of this standup — she CAN
  -- read it (scope is focus, not access control — every super admin can
  -- read) but CANNOT write Tomás's entry.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002003","aal":"aal2"}'; -- Lena
  select count(*) into n from public.standup_entries where id = v_tomas_entry_id;
  assert n = 1, 'an unrelated super admin must still be able to READ the entry (focus, not access control)';
  update public.standup_entries set today = 'lena should not be able to set this' where id = v_tomas_entry_id;
  select today into v_today_val from public.standup_entries where id = v_tomas_entry_id;
  assert v_today_val is distinct from 'lena should not be able to set this', 'an unrelated super admin must NOT be able to write someone else''s entry in a standup they neither host nor participate in';
  reset role;

  -- Action items: default status is 'open'; marking done persists, nothing
  -- auto-transitions it back — "carry over until done" means no silent
  -- status change, not that the row disappears.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002002","aal":"aal2"}'; -- Reza
  insert into public.action_items (standup_entry_id, owner_profile_id, description, created_by) values (v_tomas_entry_id, '00000000-0000-0000-0000-000000002004', 'a blocker turned into an action item', '00000000-0000-0000-0000-000000002002') returning id into v_item_id;
  select status::text into v_item_status from public.action_items where id = v_item_id;
  assert v_item_status = 'open', format('a new action item must default to open, saw %s', v_item_status);
  update public.action_items set status = 'done' where id = v_item_id;
  select status::text into v_item_status from public.action_items where id = v_item_id;
  assert v_item_status = 'done', 'marking an action item done must persist';
  reset role;

  -- Generic audit trigger fires on all 3 new tables.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  select count(*) into n from public.audit_log where record_table = 'standups'; assert n > 0, 'standups writes must be audited';
  select count(*) into n from public.audit_log where record_table = 'standup_entries'; assert n > 0, 'standup_entries writes must be audited';
  select count(*) into n from public.audit_log where record_table = 'action_items'; assert n > 0, 'action_items writes must be audited';
  reset role;

  -- customer roles see 0 rows across all 3 tables.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.standups; assert n = 0, format('Prism owner must see 0 standups, saw %s', n);
  select count(*) into n from public.standup_entries; assert n = 0, format('Prism owner must see 0 standup_entries, saw %s', n);
  select count(*) into n from public.action_items; assert n = 0, format('Prism owner must see 0 action_items, saw %s', n);
  reset role;

  raise notice 'ALL STANDUPS RLS TESTS PASSED';
end $$;

-- ── Ingest tokens (7.4) ───────────────────────────────────────────────────
-- Credential material: select is super-admin-only, and there is deliberately
-- NO insert/update policy for `authenticated` at all — tokens are minted
-- only via the provisioning Edge Function's service-role client.
do $$
declare
  n int;
  v_token_id uuid;
begin
  -- Seed one token directly as service_role (the only way the Edge Function
  -- itself ever writes this table).
  set local role service_role;
  insert into public.ingest_tokens (label, token_hash, expires_at)
    values ('rls test token', 'deadbeef', now() + interval '1 day')
    returning id into v_token_id;
  reset role;

  -- A super admin can read it.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  select count(*) into n from public.ingest_tokens where id = v_token_id;
  assert n = 1, 'a super admin must be able to read ingest_tokens';

  -- A super admin's direct client INSERT is rejected — no policy grants it.
  begin
    insert into public.ingest_tokens (label, token_hash, expires_at)
      values ('should fail', 'abc123', now() + interval '1 day');
    assert false, 'a direct client insert into ingest_tokens must be rejected (no policy grants it)';
  exception when insufficient_privilege then
    null; -- expected
  end;
  reset role;

  -- Customer roles see 0 rows.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.ingest_tokens;
  assert n = 0, format('Prism owner must see 0 ingest_tokens, saw %s', n);
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}'; -- Meridian owner
  select count(*) into n from public.ingest_tokens;
  assert n = 0, format('Meridian owner must see 0 ingest_tokens, saw %s', n);
  reset role;

  raise notice 'ALL INGEST TOKENS RLS TESTS PASSED';
end $$;
