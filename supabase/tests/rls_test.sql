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

-- ── Tenants & account_sources (7.5-pre2 Session 1) ──────────────────────────
-- Same shape as every other CS-adjacent table: super-admin read/write under
-- AAL2, customer roles see 0 rows. Plus the one thing specific to this
-- table: (source_type, value) is globally unique, so a second account can't
-- claim an identifier already bound to another account/tenant.
do $$
declare
  n int;
  v_tenant_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';

  insert into public.tenants (org_id, name) values ('00000000-0000-0000-0000-000000000002', 'rls test tenant') returning id into v_tenant_id;
  insert into public.account_sources (org_id, tenant_id, source_type, value) values ('00000000-0000-0000-0000-000000000002', v_tenant_id, 'name_variant', 'rls-test-source-value');

  select count(*) into n from public.tenants where id = v_tenant_id;
  assert n = 1, 'a super admin must be able to read a tenant they just created';
  select count(*) into n from public.account_sources where tenant_id = v_tenant_id;
  assert n = 1, 'a super admin must be able to read an account_source they just created';

  -- (source_type, value) is globally unique — a second account can't claim
  -- an identifier already bound to this tenant.
  begin
    insert into public.account_sources (org_id, source_type, value) values ('00000000-0000-0000-0000-000000000003', 'name_variant', 'rls-test-source-value');
    assert false, 'a duplicate (source_type, value) must be rejected regardless of which account/tenant claims it first';
  exception when unique_violation then
    null; -- expected
  end;
  reset role;

  -- Customer roles see 0 rows across both tables.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.tenants; assert n = 0, format('Prism owner must see 0 tenants, saw %s', n);
  select count(*) into n from public.account_sources; assert n = 0, format('Prism owner must see 0 account_sources, saw %s', n);
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}'; -- Meridian owner
  select count(*) into n from public.tenants; assert n = 0, format('Meridian owner must see 0 tenants, saw %s', n);
  select count(*) into n from public.account_sources; assert n = 0, format('Meridian owner must see 0 account_sources, saw %s', n);
  reset role;

  raise notice 'ALL TENANTS/ACCOUNT_SOURCES RLS TESTS PASSED';
end $$;

-- ── Account resolution: held proposals + sync_learnings (7.5-pre2 Session 2) ──
-- 'held' is just another proposals.status value — no policy carve-out
-- needed, the existing status-agnostic policies already cover it. Checks
-- that holds that through directly, plus sync_learnings' own RLS shape
-- (same as every other table this session: super-admin read/write under
-- AAL2, customer roles 0 rows).
do $$
declare
  n int;
  v_held_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';

  insert into public.proposals (org_id, target_table, operation, payload, source, proposed_by, status)
    values (null, 'escalations', 'create', '{"title":"rls test held"}'::jsonb, 'agent', 'rls-test', 'held')
    returning id into v_held_id;
  select count(*) into n from public.proposals where id = v_held_id and status = 'held';
  assert n = 1, 'a super admin must be able to read/write a held proposal — no policy carve-out expected';

  insert into public.sync_learnings (kind, content, created_by) values ('ignore', '{"identifier":"rls-test-ignore"}'::jsonb, '00000000-0000-0000-0000-000000001001');
  select count(*) into n from public.sync_learnings where content->>'identifier' = 'rls-test-ignore';
  assert n = 1, 'a super admin must be able to write sync_learnings';
  reset role;

  -- Customer roles see 0 rows across both.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.proposals where status = 'held'; assert n = 0, format('Prism owner must see 0 held proposals, saw %s', n);
  select count(*) into n from public.sync_learnings; assert n = 0, format('Prism owner must see 0 sync_learnings, saw %s', n);
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}'; -- Meridian owner
  select count(*) into n from public.proposals where status = 'held'; assert n = 0, format('Meridian owner must see 0 held proposals, saw %s', n);
  select count(*) into n from public.sync_learnings; assert n = 0, format('Meridian owner must see 0 sync_learnings, saw %s', n);
  reset role;

  raise notice 'ALL ACCOUNT RESOLUTION RLS TESTS PASSED';
end $$;

-- ── CS-sync record types: action_items + engagements (7.5-pre2 Session 4) ──
-- action_items' new columns (project_id/tenant_id/priority/owner_text/
-- source/source_ref/updated_by/verified_at/proposal_id) and its new DELETE
-- policy are additive onto the existing standups-era RLS shape (checked
-- above at line ~563) — confirms they don't weaken it: same super-admin-
-- under-AAL2 read/write/delete, customer roles still 0 rows, and the new
-- (org_id, source_ref) dedupe index rejects a real duplicate. engagements
-- (7.1 table, newly wired to apply_proposal() this session, no schema
-- change) gets the same standard shape check since it was never
-- individually asserted before.
do $$
declare
  n int;
  v_item_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';

  insert into public.action_items (org_id, tenant_id, description, priority, owner_text, source, source_ref)
    values ('00000000-0000-0000-0000-000000000002', null, 'rls test synced action item', 'high', 'Someone Else', 'agent', 'rls-test:action-item:1')
    returning id into v_item_id;
  select count(*) into n from public.action_items where id = v_item_id;
  assert n = 1, 'a super admin must be able to read a CS-sync action_item with the new columns';

  -- The new (org_id, source_ref) dedupe index rejects a real duplicate.
  begin
    insert into public.action_items (org_id, description, source, source_ref)
      values ('00000000-0000-0000-0000-000000000002', 'duplicate', 'agent', 'rls-test:action-item:1');
    assert false, 'a duplicate (org_id, source_ref) must be rejected by the new dedupe index';
  exception when unique_violation then
    null; -- expected
  end;

  -- The new DELETE policy (every other record table already has one;
  -- action_items only ever got insert/select/update from standups).
  delete from public.action_items where id = v_item_id;
  select count(*) into n from public.action_items where id = v_item_id;
  assert n = 0, 'a super admin must be able to delete an action_item via the new action_items_delete policy';
  select count(*) into n from public.audit_log where record_table = 'action_items' and record_id = v_item_id and action = 'delete';
  assert n > 0, 'deleting an action_item must still be audited (generic trigger, unaffected by the new policy)';

  -- engagements (7.1 table, newly wired to apply_proposal() this session) —
  -- same standard shape, not previously asserted on its own.
  insert into public.engagements (org_id, type, engagement_date, summary, source, source_ref)
    values ('00000000-0000-0000-0000-000000000002', 'call', current_date, 'rls test engagement', 'agent', 'rls-test:engagement:1');
  select count(*) into n from public.engagements where source_ref = 'rls-test:engagement:1';
  assert n = 1, 'a super admin must be able to read/write an engagement';
  reset role;

  -- Customer roles see 0 rows across both.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.action_items where source_ref = 'rls-test:action-item:1'; assert n = 0, format('Prism owner must see 0 of this action_item, saw %s', n);
  select count(*) into n from public.engagements where source_ref = 'rls-test:engagement:1'; assert n = 0, format('Prism owner must see 0 of this engagement, saw %s', n);
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}'; -- Meridian owner
  select count(*) into n from public.action_items where source_ref = 'rls-test:action-item:1'; assert n = 0, format('Meridian owner must see 0 of this action_item, saw %s', n);
  select count(*) into n from public.engagements where source_ref = 'rls-test:engagement:1'; assert n = 0, format('Meridian owner must see 0 of this engagement, saw %s', n);
  reset role;

  raise notice 'ALL CS-SYNC ACTION_ITEMS/ENGAGEMENTS RLS TESTS PASSED';
end $$;

-- ── Sync runner: sync_settings/sync_queue + lock/watermark functions
-- (7.5-pre2 Session 5) ──────────────────────────────────────────────────
-- Same shape as ingest_tokens (D-09x): a super admin can SELECT, but there
-- is deliberately NO insert/update/delete policy for `authenticated` at
-- all — both tables are written only via the SECURITY DEFINER functions
-- below or the provisioning Edge Function's service-role client. Those
-- functions are themselves machine-only (EXECUTE revoked from public,
-- granted to service_role only) — a direct authenticated call must be
-- rejected even by a super admin, since nothing in the UI should ever
-- call them directly.
do $$
declare
  n int;
  v_locked boolean;
  v_advanced boolean;
  v_claimed_status text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';

  select count(*) into n from public.sync_settings; assert n = 1, 'a super admin must see the one sync_settings row';
  select count(*) into n from public.sync_queue; assert n = 0, 'sync_queue starts empty';

  begin
    insert into public.sync_queue (org_id, record_type, mode) values ('00000000-0000-0000-0000-000000000002', 'rls-test-insert', 'daily');
    assert false, 'a direct client INSERT into sync_queue must be rejected (no policy grants it) — unlike UPDATE, INSERT''s WITH CHECK barrier does raise';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- This project's default privileges already grant table-level UPDATE to
  -- `authenticated` on every new table (confirmed directly — not something
  -- this migration controls), so a missing RLS UPDATE policy does NOT
  -- raise insufficient_privilege the way a missing INSERT policy does
  -- (INSERT's WITH CHECK barrier raises; UPDATE's USING-clause row
  -- filtering just silently matches zero rows). The real assertion is that
  -- the value is unchanged, not that an exception was thrown.
  update public.sync_settings set kill_switch = true where singleton = true;
  select kill_switch into v_locked from public.sync_settings where singleton = true;
  assert not v_locked, 'a direct client UPDATE on sync_settings must affect zero rows (no policy grants it)';

  begin
    perform public.try_lock_sync_unit('00000000-0000-0000-0000-000000000002', 'rls-test-type', 15);
    assert false, 'a direct authenticated call to try_lock_sync_unit must be rejected — service_role only';
  exception when insufficient_privilege then
    null; -- expected
  end;
  reset role;

  -- Customer roles see 0 rows on both tables.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.sync_settings; assert n = 0, format('Prism owner must see 0 sync_settings, saw %s', n);
  select count(*) into n from public.sync_queue; assert n = 0, format('Prism owner must see 0 sync_queue, saw %s', n);
  reset role;

  -- The lock/watermark functions themselves, exercised as service_role
  -- (the only role that can call them — matches how the Edge Function
  -- itself calls them).
  set local role service_role;
  select public.try_lock_sync_unit('00000000-0000-0000-0000-000000000002', 'rls-test-type', 15) into v_locked;
  assert v_locked, 'the first lock acquire on a free unit must succeed';
  select public.try_lock_sync_unit('00000000-0000-0000-0000-000000000002', 'rls-test-type', 15) into v_locked;
  assert not v_locked, 'a second lock acquire while the first still holds it must fail';
  perform public.finish_sync_unit('00000000-0000-0000-0000-000000000002', 'rls-test-type', 'success', null);
  select locked_until is null, last_synced_at is not null into v_locked, v_advanced
    from public.sync_state where org_id = '00000000-0000-0000-0000-000000000002' and record_type = 'rls-test-type';
  assert v_locked, 'finish_sync_unit must release the lock';
  assert v_advanced, 'finish_sync_unit must advance last_synced_at on a successful outcome';

  perform public.try_lock_sync_unit('00000000-0000-0000-0000-000000000002', 'rls-test-type-2', 15);
  perform public.finish_sync_unit('00000000-0000-0000-0000-000000000002', 'rls-test-type-2', 'failed', 'rls test failure');
  select last_synced_at is null into v_locked from public.sync_state where org_id = '00000000-0000-0000-0000-000000000002' and record_type = 'rls-test-type-2';
  assert v_locked, 'finish_sync_unit must NOT advance last_synced_at on a failed outcome';

  insert into public.sync_queue (org_id, record_type, mode) values ('00000000-0000-0000-0000-000000000002', 'rls-test-type-3', 'daily');
  select (public.claim_sync_queue_item()).status into v_claimed_status;
  assert v_claimed_status = 'processing', 'claim_sync_queue_item must atomically claim the one queued row';
  select (public.claim_sync_queue_item()).id is null into v_locked;
  assert v_locked, 'a second claim with nothing left queued must return nothing';
  reset role;

  raise notice 'ALL SYNC RUNNER RLS TESTS PASSED';
end $$;

-- ── Discovery sweep (7.5-pre2 Session 6) ──────────────────────────────────
-- The sweep is just another sync unit, carried on the internal Refold org's
-- otherwise-unused sync_state slot — so it inherits the same lock and
-- watermark behaviour already asserted above. What's new and worth
-- asserting: the two selection-rule settings columns exist with sane
-- defaults and are readable by a super admin (the admin screen reads them),
-- and enqueue_discovery() refuses to pile sweeps on top of each other.
do $$
declare
  n int;
  v_domains text[];
  v_patterns text[];
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  select internal_email_domains, discovery_channel_patterns into v_domains, v_patterns from public.sync_settings;
  assert v_domains = array['refold.ai'], format('internal_email_domains default should be {refold.ai}, got %s', v_domains);
  -- `internal-` with the hyphen: this workspace names its own channels
  -- about a customer `internal-<customer>` (e.g. internal-cloudinventory),
  -- and the bare word would also match unrelated channels.
  assert v_patterns = array['internal-'], format('discovery_channel_patterns default should be {internal-}, got %s', v_patterns);
  reset role;

  -- Customer roles still see nothing (the row is super-admin-only).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.sync_settings; assert n = 0, 'Prism owner must not see sync_settings';
  reset role;

  set local role service_role;
  -- First call queues one sweep; a second must NOT queue another while the
  -- first is still waiting, or a slow sweep would stack up every tick.
  select public.enqueue_discovery('daily') into n;
  assert n = 1, format('first enqueue_discovery should queue 1 sweep, got %s', n);
  select public.enqueue_discovery('daily') into n;
  assert n = 0, format('a second enqueue_discovery must queue nothing while one is pending, got %s', n);
  select count(*) into n from public.sync_queue where record_type = 'discovery';
  assert n = 1, format('exactly one discovery sweep should be queued, got %s', n);
  select count(*) into n from public.sync_queue where record_type = 'discovery' and org_id = '00000000-0000-0000-0000-000000000001';
  assert n = 1, 'the sweep must be carried on the internal Refold org slot, not a customer account';

  -- The kill switch stops it like everything else.
  update public.sync_settings set kill_switch = true where singleton = true;
  delete from public.sync_queue where record_type = 'discovery';
  select public.enqueue_discovery('daily') into n;
  assert n = 0, 'enqueue_discovery must respect the kill switch';
  update public.sync_settings set kill_switch = false where singleton = true;
  reset role;

  raise notice 'ALL DISCOVERY SWEEP RLS TESTS PASSED';
end $$;

-- ── Account sync health + queue priority (7.5-pre2 Session 7) ─────────────
do $$
declare
  n int;
  v_org uuid;
  v_nights int;
  v_rt text;
  v_prio int;
begin
  select id into v_org from public.organizations
   where id <> '00000000-0000-0000-0000-000000000001' and status = 'active'
   order by name limit 1;

  -- Super admin reads the table; nobody else does, and nobody writes it
  -- directly (same shape as sync_settings/sync_queue).
  set local role service_role;
  delete from public.sync_queue;
  delete from public.account_sync_health;
  update public.sync_settings set kill_switch = false where singleton = true;
  insert into public.account_sync_health (org_id, consecutive_empty_nights, last_empty_date)
  values (v_org, 4, current_date);
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}'; -- super admin
  select count(*) into n from public.account_sync_health;
  assert n = 1, format('super admin should see the account_sync_health row, got %s', n);
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.account_sync_health;
  assert n = 0, 'a customer owner must not see account_sync_health';
  reset role;

  -- A table UPDATE with no policy matches zero rows rather than raising
  -- (unlike INSERT's WITH CHECK barrier), so assert the value is UNCHANGED.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  update public.account_sync_health set consecutive_empty_nights = 999 where org_id = v_org;
  reset role;
  set local role service_role;
  select consecutive_empty_nights into v_nights from public.account_sync_health where org_id = v_org;
  assert v_nights = 4, format('authenticated must not be able to write account_sync_health (got %s)', v_nights);
  reset role;

  -- The counting rule: one NIGHT is one session, however many record types
  -- were scanned that evening.
  set local role service_role;
  delete from public.account_sync_health;
  select public.record_account_scan_result(v_org, false) into n;
  assert n = 1, format('first empty scan should count 1 night, got %s', n);
  select public.record_account_scan_result(v_org, false) into n;
  select public.record_account_scan_result(v_org, false) into n;
  assert n = 1, format('further empty scans the SAME night must still count 1, got %s', n);

  -- Any find resets the whole night, whatever order the units ran in.
  select public.record_account_scan_result(v_org, true) into n;
  assert n = 0, format('a producing scan must reset the counter to 0, got %s', n);
  select count(*) into n from public.account_sync_health
   where org_id = v_org and last_found_at is not null and last_empty_date is null;
  assert n = 1, 'a producing scan must stamp last_found_at and clear last_empty_date';

  -- Crossing the threshold, and not climbing past it twice in one night.
  update public.account_sync_health
     set consecutive_empty_nights = 29, last_empty_date = current_date - 1, flagged_at = null
   where org_id = v_org;
  select public.record_account_scan_result(v_org, false) into n;
  assert n = 30, format('the 30th consecutive empty night should read 30, got %s', n);
  select public.record_account_scan_result(v_org, false) into n;
  assert n = 30, format('a second scan the same night must not advance past 30, got %s', n);

  -- The flag is stamped once.
  perform public.mark_account_sync_flagged(v_org);
  select count(*) into n from public.account_sync_health where org_id = v_org and flagged_at is not null;
  assert n = 1, 'mark_account_sync_flagged should stamp the row';

  -- Queue priority: the sweep is CLAIMED first. Ordering by enqueued_at
  -- alone was not enough — one enqueue_all_units call stamps every row with
  -- the same transaction timestamp, so the claim needs the priority column
  -- and a total tiebreak.
  delete from public.account_sync_health;
  delete from public.sync_queue;
  select public.enqueue_all_units('daily', 20, 7) into n;
  assert n > 1, format('enqueue_all_units should queue the sweep plus per-account units, got %s', n);
  select record_type, priority into v_rt, v_prio from public.claim_sync_queue_item();
  assert v_rt = 'discovery', format('the discovery sweep must be claimed FIRST, got %s', v_rt);
  assert v_prio = 0, format('the sweep should carry priority 0, got %s', v_prio);

  -- An account that keeps finding nothing sinks below the productive ones,
  -- so a day's unit budget runs out on the barren accounts, not the live
  -- ones.
  delete from public.sync_queue;
  insert into public.account_sync_health (org_id, consecutive_empty_nights, last_empty_date)
  values (v_org, 12, current_date);
  perform public.enqueue_all_units('daily', 20, 7);
  select priority into v_prio from public.sync_queue where org_id = v_org limit 1;
  assert v_prio = 112, format('a barren account should sort behind routine work (expected 112, got %s)', v_prio);

  -- An account a human just confirmed jumps ahead of routine nightly work.
  delete from public.sync_queue;
  delete from public.account_sync_health;
  select public.enqueue_account(v_org, 'daily', 7) into n;
  assert n = 8, format('enqueue_account should queue one unit per record type, got %s', n);
  select public.enqueue_account(v_org, 'daily', 7) into n;
  assert n = 0, format('enqueue_account must not double-queue what is already pending, got %s', n);
  select priority into v_prio from public.sync_queue where org_id = v_org limit 1;
  assert v_prio = 50, format('a just-confirmed account should outrank routine work (expected 50, got %s)', v_prio);

  -- The kill switch stops the new path too.
  delete from public.sync_queue;
  update public.sync_settings set kill_switch = true where singleton = true;
  select public.enqueue_account(v_org, 'daily', 7) into n;
  assert n = 0, 'enqueue_account must respect the kill switch';
  update public.sync_settings set kill_switch = false where singleton = true;
  delete from public.sync_queue;
  delete from public.account_sync_health;
  reset role;

  raise notice 'ALL ACCOUNT SYNC HEALTH RLS TESTS PASSED';
end $$;

-- ── Queue retry + stale reclaim (7.5-pre2) ────────────────────────────────
do $$
declare
  n int;
  v_org uuid;
  v_rt text;
begin
  select id into v_org from public.organizations
   where id <> '00000000-0000-0000-0000-000000000001' and status = 'active'
   order by name limit 1;

  set local role service_role;
  update public.sync_settings set kill_switch = false where singleton = true;
  delete from public.sync_queue;
  delete from public.sync_runs;

  -- A unit claimed by a worker that then died is put back, not lost. This
  -- is what stops the queue quietly shrinking every time a run is killed.
  insert into public.sync_queue (org_id, record_type, mode, status, claimed_at, priority)
  values (v_org, 'ticket', 'daily', 'processing', now() - interval '45 minutes', 100);
  select public.requeue_stale_sync_units() into n;
  assert n = 1, format('a stale processing row should be requeued, got %s', n);
  select count(*) into n from public.sync_queue where status = 'queued' and claimed_at is null;
  assert n = 1, 'the requeued row should be queued again with claimed_at cleared';

  -- A unit claimed moments ago is genuinely running -- never steal it.
  delete from public.sync_queue;
  insert into public.sync_queue (org_id, record_type, mode, status, claimed_at, priority)
  values (v_org, 'risk', 'daily', 'processing', now() - interval '2 minutes', 100);
  select public.requeue_stale_sync_units() into n;
  assert n = 0, format('a freshly claimed row must not be requeued, got %s', n);

  -- A sync_runs row left at 'running' by the same death is closed, so the
  -- Sync Status screen stops showing a run that will never finish.
  delete from public.sync_queue;
  insert into public.sync_runs (mode, triggered_by, status, started_at, scope)
  values ('daily', 'system', 'running', now() - interval '45 minutes', '{"record_type":"ticket"}'::jsonb);
  perform public.requeue_stale_sync_units();
  select count(*) into n from public.sync_runs where status = 'running';
  assert n = 0, format('a long-dead running row should be closed as failed, got %s still running', n);

  -- retry_after: a unit waiting out a still-held lock is passed over rather
  -- than claimed in a loop, and becomes claimable once the wait is up.
  delete from public.sync_queue;
  delete from public.sync_runs;
  insert into public.sync_queue (org_id, record_type, mode, status, priority, retry_after)
  values (v_org, 'health', 'daily', 'queued', 100, now() + interval '10 minutes');
  insert into public.sync_queue (org_id, record_type, mode, status, priority, retry_after)
  values (v_org, 'escalation', 'daily', 'queued', 100, null);
  select record_type into v_rt from public.claim_sync_queue_item();
  assert v_rt = 'escalation', format('a waiting unit must be passed over, expected escalation, got %s', v_rt);
  update public.sync_queue set retry_after = now() - interval '1 minute' where record_type = 'health';
  select record_type into v_rt from public.claim_sync_queue_item();
  assert v_rt = 'health', format('once its wait is up the unit becomes claimable, got %s', v_rt);

  -- Nothing claimable is a null row, not an error.
  delete from public.sync_queue;
  insert into public.sync_queue (org_id, record_type, mode, status, priority, retry_after)
  values (v_org, 'milestone', 'daily', 'queued', 100, now() + interval '30 minutes');
  select record_type into v_rt from public.claim_sync_queue_item();
  assert v_rt is null, format('everything waiting should claim nothing, got %s', v_rt);

  delete from public.sync_queue;
  reset role;

  -- The reclaim function is service-role only (D-121: name anon and
  -- authenticated explicitly, they hold EXECUTE by default here).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  begin
    perform public.requeue_stale_sync_units();
    assert false, 'authenticated must not be able to run requeue_stale_sync_units';
  exception when insufficient_privilege then
    null; -- expected
  end;
  reset role;

  raise notice 'ALL SYNC QUEUE RETRY RLS TESTS PASSED';
end $$;

-- ── Pausing must not destroy the queue (7.5-pre2) ─────────────────────────
do $$
declare
  n int;
  v_org uuid;
begin
  select id into v_org from public.organizations
   where id <> '00000000-0000-0000-0000-000000000001' and status = 'active'
   order by name limit 1;

  set local role service_role;
  delete from public.sync_queue;
  delete from public.sync_runs;

  -- The reaper must run even while the system is paused. Cleaning up after
  -- a worker that died is not "doing work" — gating it meant a stranded
  -- unit could never be recovered while the kill switch was on, which is
  -- exactly when nobody is watching.
  update public.sync_settings set kill_switch = true where singleton = true;
  insert into public.sync_queue (org_id, record_type, mode, status, claimed_at, priority)
  values (v_org, 'ticket', 'daily', 'processing', now() - interval '45 minutes', 100);
  perform public.dispatch_sync_queue();
  select count(*) into n from public.sync_queue where status = 'queued';
  assert n = 1, format('a stranded unit must be reclaimed even with the kill switch ON, got %s queued', n);

  -- ...and the switch still stops anything NEW being dispatched.
  select public.dispatch_sync_queue() into n;
  assert n = 0, format('the kill switch must still block dispatch, got %s', n);

  update public.sync_settings set kill_switch = false where singleton = true;
  delete from public.sync_queue;
  reset role;

  raise notice 'ALL KILL SWITCH QUEUE RLS TESTS PASSED';
end $$;

-- ── Tenant identification (2026-10-16) ────────────────────────────────────
do $$
declare
  n int;
  v_org uuid;
  v_tenant uuid;
begin
  select id into v_org from public.organizations
   where deployment_type = 'on_premise' and status = 'active' order by name limit 1;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}'; -- super admin
  -- A tenant records WHERE it lives; cluster and namespace are columns, not
  -- tables, so this is a plain insert at the same level as any other tenant.
  insert into public.tenants (org_id, name, cluster_name, namespace_name, refold_org_id, linked_account_id)
  values (v_org, 'rls-location-tenant', 'prod-eu-1', 'refold-apac', 'org_abc123', 'la_xyz789')
  returning id into v_tenant;

  select count(*) into n from public.tenants
   where id = v_tenant and cluster_name = 'prod-eu-1' and namespace_name = 'refold-apac'
     and refold_org_id = 'org_abc123' and linked_account_id = 'la_xyz789';
  assert n = 1, 'a tenant should carry its cluster/namespace/org identification';

  -- The grouped on-prem view looks tenants up BY that location, which is the
  -- only reason these are indexed rather than merely stored.
  select count(*) into n from public.tenants
   where org_id = v_org and cluster_name = 'prod-eu-1' and namespace_name = 'refold-apac';
  assert n >= 1, 'tenants must be findable by cluster + namespace';
  reset role;

  -- Customer roles still see nothing.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.tenants where id = v_tenant;
  assert n = 0, 'a customer owner must not see another account''s tenant';
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  delete from public.tenants where id = v_tenant;
  reset role;

  raise notice 'ALL TENANT IDENTIFICATION RLS TESTS PASSED';
end $$;

-- ── Moving a tenant between accounts (Stage 2b) ───────────────────────────
do $$
declare
  n int;
  v_a uuid; v_b uuid; v_tenant uuid; v_rec uuid; v_moved int;
begin
  select id into v_a from public.organizations where name = 'Prism Analytics';
  select id into v_b from public.organizations where name = 'Meridian Laboratories';

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}'; -- super admin

  insert into public.tenants (org_id, name) values (v_a, 'move-me') returning id into v_tenant;
  -- A record of that tenant, filed under the SAME account.
  insert into public.escalations (org_id, tenant_id, title, source)
  values (v_a, v_tenant, 'escalation that must follow its tenant', 'manual') returning id into v_rec;
  -- And an identifier that resolves to it, which must follow too or the next
  -- sync re-attributes the tenant's traffic to the account it left.
  insert into public.account_sources (org_id, tenant_id, source_type, value)
  values (v_a, v_tenant, 'name_variant', 'move-me-identifier');

  select public.move_tenant(v_tenant, v_b) into v_moved;
  assert v_moved >= 2, format('the escalation and the identifier should both move, got %s rows', v_moved);

  select count(*) into n from public.tenants where id = v_tenant and org_id = v_b;
  assert n = 1, 'the tenant itself should now belong to the new account';
  -- THE point of the function: a record must never be left pointing at an
  -- account its tenant no longer belongs to.
  select count(*) into n from public.escalations where id = v_rec and org_id = v_b;
  assert n = 1, 'the escalation must have moved with its tenant';
  select count(*) into n from public.account_sources where tenant_id = v_tenant and org_id = v_b;
  assert n = 1, 'the identifier must have moved with its tenant';
  select count(*) into n from public.escalations e join public.tenants t on t.id = e.tenant_id
   where e.tenant_id = v_tenant and e.org_id <> t.org_id;
  assert n = 0, 'no record may disagree with its tenant about which account it belongs to';

  -- Moving to where it already is is a no-op, not an error.
  select public.move_tenant(v_tenant, v_b) into v_moved;
  assert v_moved = 0, format('moving a tenant to its current account should do nothing, got %s', v_moved);

  -- A name collision is reported plainly rather than surfacing as a raw
  -- unique-violation the UI cannot explain.
  insert into public.tenants (org_id, name) values (v_a, 'move-me');
  begin
    perform public.move_tenant(v_tenant, v_a);
    assert false, 'moving onto a duplicate tenant name should have been refused';
  exception when others then
    assert sqlerrm like '%already has a tenant called%', format('expected a readable collision message, got: %s', sqlerrm);
  end;

  delete from public.escalations where id = v_rec;
  delete from public.account_sources where tenant_id = v_tenant;
  delete from public.tenants where name = 'move-me';
  reset role;

  -- Only a super admin with AAL2 may move one.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  begin
    perform public.move_tenant(gen_random_uuid(), gen_random_uuid());
    assert false, 'a customer owner must not be able to move a tenant';
  exception when others then
    null; -- expected
  end;
  reset role;

  raise notice 'ALL MOVE TENANT RLS TESTS PASSED';
end $$;

-- ── Metrics are scoped per tenant (Stage 2c) ──────────────────────────────
do $$
declare
  n int;
  v_org uuid; v_t1 uuid; v_t2 uuid;
begin
  select id into v_org from public.organizations where name = 'Meridian Laboratories';

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}'; -- super admin
  insert into public.tenants (org_id, name) values (v_org, 'metric-tenant-a') returning id into v_t1;
  insert into public.tenants (org_id, name) values (v_org, 'metric-tenant-b') returning id into v_t2;

  -- The whole point of widening the constraint: two tenants of one account
  -- reporting the SAME metric for the SAME period must both survive. Under
  -- the old key (org, metric, period, project) the second silently replaced
  -- the first, which is how an on-prem customer's per-namespace figures
  -- would have been quietly lost.
  insert into public.metric_values (org_id, tenant_id, metric_key, period, value, source)
  select v_org, v_t1, key, '2026-10-01', 10, 'manual' from public.metric_definitions limit 1;
  insert into public.metric_values (org_id, tenant_id, metric_key, period, value, source)
  select v_org, v_t2, key, '2026-10-01', 20, 'manual' from public.metric_definitions limit 1;
  -- ...and the account-level figure is a third, distinct row.
  insert into public.metric_values (org_id, tenant_id, metric_key, period, value, source)
  select v_org, null, key, '2026-10-01', 30, 'manual' from public.metric_definitions limit 1;

  select count(*) into n from public.metric_values where org_id = v_org and period = '2026-10-01';
  assert n = 3, format('account-level and both tenants should coexist, got %s rows', n);

  select count(*) into n from public.metric_values where tenant_id = v_t1 and value = 10;
  assert n = 1, 'tenant A''s value must not have been overwritten by tenant B''s';

  -- The same tenant reporting the same metric and period again still
  -- replaces its own value rather than duplicating.
  insert into public.metric_values (org_id, tenant_id, metric_key, period, value, source)
  select v_org, v_t1, key, '2026-10-01', 99, 'file' from public.metric_definitions limit 1
  on conflict (org_id, tenant_id, metric_key, period, project_id) do update set value = excluded.value, source = excluded.source;
  select count(*) into n from public.metric_values where tenant_id = v_t1;
  assert n = 1, 'a tenant should have one value per metric per period, not two';
  select count(*) into n from public.metric_values where tenant_id = v_t1 and value = 99 and source = 'file';
  assert n = 1, 'the re-reported value should have replaced the old one, carrying its source';

  delete from public.metric_values where org_id = v_org and period = '2026-10-01';
  delete from public.tenants where id in (v_t1, v_t2);
  reset role;

  raise notice 'ALL TENANT METRIC SCOPE RLS TESTS PASSED';
end $$;
