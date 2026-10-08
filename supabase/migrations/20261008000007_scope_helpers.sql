-- Phase 7.2a — scope helper functions (build-spec-v3 § 5; D-073).
--
-- These are FOCUS helpers, not access control: every super admin can already
-- see every account/project via the existing blanket is_super_admin() RLS on
-- organizations/projects (unchanged by this migration). The frontend calls
-- these via .rpc() to get an id list to filter a list screen by — "Mine" /
-- "My team" / "a specific person or team" narrow what's SHOWN, never what
-- can be READ (product-overview.md § 12: "the switcher sets focus, it
-- doesn't restrict access").
--
-- "My team" (my_team_account_ids / my_team_project_ids) is deliberately
-- distinct from team_account_ids(team_id) (an explicit OTHER team, for the
-- scope='team_id' case): per D-073, "my team" for the current user is the
-- union of every team they lead or belong to, that team's full membership
-- (members + lead), PLUS the viewer's own direct assignments.

create or replace function public.my_account_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct org_id from public.account_assignments where profile_id = auth.uid();
$$;

create or replace function public.my_project_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct project_id from public.project_members where profile_id = auth.uid();
$$;

create or replace function public.team_account_ids(p_team_id uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct aa.org_id
  from public.account_assignments aa
  where aa.profile_id in (
    select profile_id from public.team_members where team_id = p_team_id
    union
    select lead_profile_id from public.teams where id = p_team_id and lead_profile_id is not null
  );
$$;

create or replace function public.team_project_ids(p_team_id uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct pm.project_id
  from public.project_members pm
  where pm.profile_id in (
    select profile_id from public.team_members where team_id = p_team_id
    union
    select lead_profile_id from public.teams where id = p_team_id and lead_profile_id is not null
  );
$$;

create or replace function public.person_account_ids(p_profile_id uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct org_id from public.account_assignments where profile_id = p_profile_id;
$$;

create or replace function public.person_project_ids(p_profile_id uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct project_id from public.project_members where profile_id = p_profile_id;
$$;

create or replace function public.my_team_account_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  with my_teams as (
    select team_id from public.team_members where profile_id = auth.uid()
    union
    select id as team_id from public.teams where lead_profile_id = auth.uid()
  ),
  team_people as (
    select profile_id from public.team_members where team_id in (select team_id from my_teams)
    union
    select lead_profile_id as profile_id from public.teams where id in (select team_id from my_teams) and lead_profile_id is not null
    union
    select auth.uid() as profile_id
  )
  select distinct org_id from public.account_assignments where profile_id in (select profile_id from team_people);
$$;

create or replace function public.my_team_project_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  with my_teams as (
    select team_id from public.team_members where profile_id = auth.uid()
    union
    select id as team_id from public.teams where lead_profile_id = auth.uid()
  ),
  team_people as (
    select profile_id from public.team_members where team_id in (select team_id from my_teams)
    union
    select lead_profile_id as profile_id from public.teams where id in (select team_id from my_teams) and lead_profile_id is not null
    union
    select auth.uid() as profile_id
  )
  select distinct project_id from public.project_members where profile_id in (select profile_id from team_people);
$$;

revoke all on function public.my_account_ids() from public;
revoke all on function public.my_project_ids() from public;
revoke all on function public.team_account_ids(uuid) from public;
revoke all on function public.team_project_ids(uuid) from public;
revoke all on function public.person_account_ids(uuid) from public;
revoke all on function public.person_project_ids(uuid) from public;
revoke all on function public.my_team_account_ids() from public;
revoke all on function public.my_team_project_ids() from public;

grant execute on function public.my_account_ids() to authenticated, service_role;
grant execute on function public.my_project_ids() to authenticated, service_role;
grant execute on function public.team_account_ids(uuid) to authenticated, service_role;
grant execute on function public.team_project_ids(uuid) to authenticated, service_role;
grant execute on function public.person_account_ids(uuid) to authenticated, service_role;
grant execute on function public.person_project_ids(uuid) to authenticated, service_role;
grant execute on function public.my_team_account_ids() to authenticated, service_role;
grant execute on function public.my_team_project_ids() to authenticated, service_role;
