-- Equal-admins model (Head of CS direction, 2026-10-09) — supersedes 7.2a's
-- hierarchy: no internal org chart, no titles, no teams, no role-based
-- behavior. Every admin is equal; involvement in an account is a per-account
-- ROLE TAG (fde/ta/edl) for record-keeping only, with history. reports_to is
-- an optional, permission-free UX convenience.
--
-- Guarded drops below assert 0 rows first (same pattern as 7.2a's
-- projects.fdes drop) rather than building conversion logic — a read-only
-- cloud check (supabase db dump --data-only) confirmed teams/team_members/
-- account_assignments are all empty on cloud and every profiles.title /
-- organizations.owner_profile_id is NULL, so there is nothing to convert.

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.account_assignments;
  if v_count > 0 then
    raise exception 'Refusing to drop account_assignments: % row(s) exist. Convert to account_roles manually before re-running.', v_count;
  end if;

  select count(*) into v_count from public.team_members;
  if v_count > 0 then
    raise exception 'Refusing to drop team_members: % row(s) exist.', v_count;
  end if;

  select count(*) into v_count from public.teams;
  if v_count > 0 then
    raise exception 'Refusing to drop teams: % row(s) exist.', v_count;
  end if;
end $$;

-- ── drop the owner_profile_id derivation machinery, then the tables/columns ──

drop trigger if exists account_assignments_sync_owner on public.account_assignments;
drop trigger if exists organizations_force_owner on public.organizations;
drop function if exists public.sync_org_owner_from_assignment();
drop function if exists public.force_org_owner_profile_id();
drop function if exists public.compute_org_owner(uuid);

drop table if exists public.account_assignments;
drop table if exists public.team_members;
drop table if exists public.teams;

alter table public.organizations drop column if exists owner_profile_id;

alter table public.profiles drop constraint if exists profiles_title_super_admin_only;
alter table public.profiles drop column if exists title;
-- profile_title enum left in place deliberately — Postgres can't cleanly
-- drop one enum VALUE, and dropping the type only matters if something still
-- references it (nothing does after the column drop above).

-- ── account_roles: the per-account role tag, with history ───────────────────

create table public.account_roles (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  role       public.assignment_role not null, -- fde | ta | edl, unchanged enum
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- At most one ACTIVE role per (profile, org) — "changing role" is an UPDATE
-- ending the current row (ended_at = now()) plus an INSERT of the new one,
-- never an in-place role swap, so history is never lost.
create unique index account_roles_one_active_per_profile_org
  on public.account_roles (profile_id, org_id) where ended_at is null;

create index account_roles_org_id_idx     on public.account_roles (org_id);
create index account_roles_profile_id_idx on public.account_roles (profile_id);

alter table public.account_roles enable row level security;

create policy account_roles_select on public.account_roles for select to authenticated using (public.is_super_admin());
create policy account_roles_insert on public.account_roles for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy account_roles_update on public.account_roles for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
-- Deliberately NO delete policy: history is never hard-deleted. "Removing" a
-- role is the UPDATE above (set ended_at), enforced here, not by convention.

grant select, insert, update on public.account_roles to authenticated, service_role;

create trigger account_roles_audit after insert or update or delete on public.account_roles for each row execute function public.write_audit_log();

-- ── profiles.reports_to: optional, UX only, never permissions ──────────────

alter table public.profiles
  add column reports_to uuid references public.profiles(id) on delete set null,
  add constraint profiles_reports_to_not_self check (reports_to is distinct from id);

-- A CHECK constraint can't walk the graph, so cycle prevention (beyond the
-- direct self-reference above) is a trigger: walk up the chain from the new
-- reports_to and raise if NEW.id is encountered. Bounded to 50 hops as a
-- defensive limit against a runaway chain, not an expected depth.
create or replace function public.prevent_reports_to_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid := NEW.reports_to;
  v_hops int := 0;
begin
  if v_current is null then
    return NEW;
  end if;
  while v_current is not null and v_hops < 50 loop
    if v_current = NEW.id then
      raise exception 'reports_to would create a cycle through profile %', v_current;
    end if;
    select reports_to into v_current from public.profiles where id = v_current;
    v_hops := v_hops + 1;
  end loop;
  return NEW;
end;
$$;

create trigger profiles_prevent_reports_to_cycle
  before insert or update of reports_to on public.profiles
  for each row execute function public.prevent_reports_to_cycle();

-- ── scope helpers, rewritten against account_roles/reports_to ──────────────
-- Focus only, never access control (unchanged from D-073) — every super
-- admin can already see everything via the blanket is_super_admin() RLS;
-- these just narrow what a list screen SHOWS.

create or replace function public.my_account_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct org_id from public.account_roles where profile_id = auth.uid() and ended_at is null;
$$;

create or replace function public.person_account_ids(p_profile_id uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct org_id from public.account_roles where profile_id = p_profile_id and ended_at is null;
$$;

-- "My team" = my own active accounts UNION my direct reports' active
-- accounts (reports_to = me) — direct reports only, not transitive.
create or replace function public.my_team_account_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct org_id from public.account_roles
  where ended_at is null
    and profile_id in (
      select auth.uid()
      union
      select id from public.profiles where reports_to = auth.uid()
    );
$$;

-- No teams left to target — team_account_ids(team_id)/team_project_ids(team_id)
-- /my_team_project_ids() are dropped outright (confirmed zero frontend call
-- sites). my_project_ids()/person_project_ids() are untouched — project_members
-- -based, orthogonal to this change.
drop function if exists public.team_account_ids(uuid);
drop function if exists public.team_project_ids(uuid);
drop function if exists public.my_team_project_ids();

revoke all on function public.my_account_ids() from public;
revoke all on function public.person_account_ids(uuid) from public;
revoke all on function public.my_team_account_ids() from public;

grant execute on function public.my_account_ids() to authenticated, service_role;
grant execute on function public.person_account_ids(uuid) to authenticated, service_role;
grant execute on function public.my_team_account_ids() to authenticated, service_role;
