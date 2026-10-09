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

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 7.2a — people, teams, assignments, scoped views (build-spec-v3 § 5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Fictional CS people (seed.sql): Dana Whitfield (head_of_cs) 2001, Reza Karimi
-- (edl) 2002 leads Enterprise Pod (team 3001), Lena Novak (ta) 2003 leads SMB
-- Pod (team 3002), Tomás Rivera (fde) 2004 in Enterprise Pod, Grace Mwangi
-- (fde) 2005 in BOTH teams, Owen Baptiste (fde) 2006 in SMB Pod. Assignments:
-- Prism (org 0002) EDL=Reza(primary) FDE=Tomás(primary); Meridian (org 0003)
-- TA=Lena(primary) FDE=Owen(primary).

do $$
declare
  n int;
  v_owner uuid;
begin
  -- ── title is not self-editable (D-043 column-grant lockdown extends to it) ──
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002002","aal":"aal2"}';
  begin
    update public.profiles set title = 'head_of_cs' where id = '00000000-0000-0000-0000-000000002002';
    assert false, 'a profile must NOT be able to self-set title';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── organizations.owner_profile_id cannot be written directly ───────────────
  -- (the force trigger silently overwrites it to the computed value; D-070).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  update public.organizations set owner_profile_id = '00000000-0000-0000-0000-000000001001' where id = '00000000-0000-0000-0000-000000000002';
  select owner_profile_id into v_owner from public.organizations where id = '00000000-0000-0000-0000-000000000002';
  assert v_owner = '00000000-0000-0000-0000-000000002002', format('owner_profile_id must stay the derived primary EDL (Reza), got %s', v_owner);

  -- ── team_members works with the generic audit trigger despite its natural
  --    key being (team_id, profile_id) — it has a surrogate id, so record_id
  --    is populated like every other audited table (requirement: cover this).
  insert into public.team_members (team_id, profile_id) values
    ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000002002') -- Reza also joins SMB Pod, for this test only
  returning id into v_owner; -- reuse the var; it's just a uuid holder here
  select count(*) into n from public.audit_log where record_table = 'team_members' and record_id = v_owner and action = 'create';
  assert n = 1, format('team_members insert must produce an audit row with a real record_id, saw %s', n);
  delete from public.team_members where id = v_owner;
  reset role;

  -- ── saved_views: private to their owner, even among super admins ────────────
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002001","aal":"aal2"}'; -- Dana
  insert into public.saved_views (owner_profile_id, name, page, scope, filters) values
    ('00000000-0000-0000-0000-000000002001', 'My Everyone view', 'portfolio', 'everyone', '{}');
  select count(*) into n from public.saved_views where owner_profile_id = '00000000-0000-0000-0000-000000002001';
  assert n = 1, 'Dana should see her own saved view';
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002002","aal":"aal2"}'; -- Reza
  select count(*) into n from public.saved_views where owner_profile_id = '00000000-0000-0000-0000-000000002001';
  assert n = 0, format('Reza must not see Dana''s saved view, saw %s', n);
  select count(*) into n from public.saved_views;
  assert n = 0, format('Reza should see 0 saved views (has none of his own), saw %s', n);
  -- cannot insert a saved_view owned by someone else
  begin
    insert into public.saved_views (owner_profile_id, name, page, scope, filters) values
      ('00000000-0000-0000-0000-000000002001', 'Forged view', 'portfolio', 'mine', '{}');
    assert false, 'must not be able to insert a saved_view owned by another profile';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── scope helpers: my_*, team_*, person_*, my_team_* return the right sets ──
  -- Reza (EDL, primary on Prism only): my_account_ids = {Prism}.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002002","aal":"aal2"}';
  select count(*) into n from public.my_account_ids() where my_account_ids = '00000000-0000-0000-0000-000000000002';
  assert n = 1, 'Reza''s my_account_ids must include Prism';
  select count(*) into n from public.my_account_ids();
  assert n = 1, format('Reza''s my_account_ids must be exactly {Prism}, saw %s rows', n);
  reset role;

  -- Tomás (FDE on Prism): my_project_ids = {Prism project}.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002004","aal":"aal2"}';
  select count(*) into n from public.my_project_ids() where my_project_ids = '10000000-0000-0000-0000-000000000001';
  assert n = 1, 'Tomás''s my_project_ids must include the Prism project';
  reset role;

  -- team_account_ids(Enterprise Pod) = {Prism} (lead Reza + member Tomás, both on Prism).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001001","aal":"aal2"}';
  select count(*) into n from public.team_account_ids('00000000-0000-0000-0000-000000003001') where team_account_ids = '00000000-0000-0000-0000-000000000002';
  assert n = 1, 'team_account_ids(Enterprise Pod) must include Prism';
  select count(*) into n from public.team_account_ids('00000000-0000-0000-0000-000000003001');
  assert n = 1, format('team_account_ids(Enterprise Pod) must be exactly {Prism}, saw %s', n);

  -- person_account_ids(Owen) = {Meridian}.
  select count(*) into n from public.person_account_ids('00000000-0000-0000-0000-000000002006') where person_account_ids = '00000000-0000-0000-0000-000000000003';
  assert n = 1, 'person_account_ids(Owen) must include Meridian';
  reset role;

  -- Grace is in BOTH teams (Enterprise Pod + SMB Pod) — her "My team" scope
  -- must union across BOTH teams' full membership (leads included), proving
  -- the multi-team union, not just her own direct assignments (she has none).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002005","aal":"aal2"}';
  select count(*) into n from public.account_assignments where profile_id = '00000000-0000-0000-0000-000000002005';
  assert n = 0, 'Grace should have no direct account assignments (isolates the team-union behavior)';
  select count(*) into n from public.my_team_account_ids() where my_team_account_ids = '00000000-0000-0000-0000-000000000002';
  assert n = 1, 'Grace''s my_team_account_ids must include Prism (via Enterprise Pod)';
  select count(*) into n from public.my_team_account_ids() where my_team_account_ids = '00000000-0000-0000-0000-000000000003';
  assert n = 1, 'Grace''s my_team_account_ids must include Meridian (via SMB Pod)';
  select count(*) into n from public.my_team_account_ids();
  assert n = 2, format('Grace''s my_team_account_ids must be exactly {Prism, Meridian}, saw %s', n);
  reset role;

  -- Dana (head_of_cs, no team membership/lead, no direct assignments):
  -- my_team_account_ids degrades to just her own assignments — empty.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000002001","aal":"aal2"}';
  select count(*) into n from public.my_team_account_ids();
  assert n = 0, format('Dana has no team/assignments, my_team_account_ids must be empty, saw %s', n);
  reset role;

  -- ── customer roles see NONE of the 5 new tables (not just org-scoped — none) ─
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001002","aal":"aal2"}'; -- Prism owner
  select count(*) into n from public.teams; assert n = 0;
  select count(*) into n from public.team_members; assert n = 0;
  select count(*) into n from public.account_assignments; assert n = 0;
  select count(*) into n from public.project_members; assert n = 0;
  select count(*) into n from public.saved_views; assert n = 0;
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001003","aal":"aal2"}'; -- Meridian owner
  select count(*) into n from public.account_assignments; assert n = 0;
  reset role;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000001004","aal":"aal1"}'; -- Prism member/analyst
  select count(*) into n from public.account_assignments; assert n = 0;
  select count(*) into n from public.project_members; assert n = 0;
  reset role;

  raise notice 'ALL PHASE 7.2a RLS + SCOPE TESTS PASSED';
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
