-- Phase 7.2a — account_assignments + the owner_profile_id derivation
-- (build-spec-v3 § 5; D-070). organizations.owner_profile_id is KEPT, but
-- becomes a derived column: primary EDL assignment → else primary TA → else
-- NULL. Nothing else may write it — enforced in a trigger, not by convention
-- (see force_org_owner_profile_id below), so even a future "Add account" flow
-- or an ad hoc SQL edit can't desync it.

create table public.account_assignments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       public.assignment_role not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, profile_id, role)
);

-- At most one PRIMARY person per (account, role) — this is what makes "the
-- primary EDL" (etc.) well-defined for the owner_profile_id derivation below.
create unique index account_assignments_primary_per_role
  on public.account_assignments (org_id, role) where is_primary;

create index account_assignments_org_id_idx     on public.account_assignments (org_id);
create index account_assignments_profile_id_idx on public.account_assignments (profile_id);

alter table public.account_assignments enable row level security;

create policy account_assignments_select on public.account_assignments for select to authenticated using (public.is_super_admin());
create policy account_assignments_insert on public.account_assignments for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy account_assignments_update on public.account_assignments for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy account_assignments_delete on public.account_assignments for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on public.account_assignments to authenticated, service_role;

create trigger account_assignments_audit after insert or update or delete on public.account_assignments for each row execute function public.write_audit_log();

-- ── owner_profile_id derivation ─────────────────────────────────────────────

-- Primary EDL, else primary TA, else NULL — the one place this logic lives.
create or replace function public.compute_org_owner(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select profile_id from public.account_assignments where org_id = p_org_id and role = 'edl' and is_primary = true limit 1),
    (select profile_id from public.account_assignments where org_id = p_org_id and role = 'ta'  and is_primary = true limit 1)
  );
$$;

revoke all on function public.compute_org_owner(uuid) from public;
grant execute on function public.compute_org_owner(uuid) to authenticated, service_role;

-- BEFORE trigger on organizations: forces owner_profile_id to the computed
-- value on every insert/update, regardless of what was supplied — this is the
-- enforcement (not convention) that nothing else may write this column.
create or replace function public.force_org_owner_profile_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  NEW.owner_profile_id := public.compute_org_owner(NEW.id);
  return NEW;
end;
$$;

create trigger organizations_force_owner
  before insert or update on public.organizations
  for each row execute function public.force_org_owner_profile_id();

-- AFTER trigger on account_assignments: propagates a recompute to the
-- affected org whenever assignments change (inserting/updating/deleting a
-- primary EDL/TA row doesn't itself touch organizations, so without this the
-- force-trigger above would never re-fire). The resulting UPDATE also fires
-- organizations' own 7.1 audit trigger, which is correct — ownership changes
-- should be audited too.
create or replace function public.sync_org_owner_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := coalesce(NEW.org_id, OLD.org_id);
begin
  update public.organizations set owner_profile_id = public.compute_org_owner(v_org_id) where id = v_org_id;
  return null; -- AFTER trigger; return value ignored
end;
$$;

create trigger account_assignments_sync_owner
  after insert or update or delete on public.account_assignments
  for each row execute function public.sync_org_owner_from_assignment();

-- ── one-time backfill ────────────────────────────────────────────────────────
-- Any org that already has an owner_profile_id (set directly in 7.1 — e.g. the
-- Prism Analytics demo fixture) gets a matching primary EDL assignment created,
-- so the derivation produces the SAME value it already had. The force-trigger
-- above then takes over going forward.
insert into public.account_assignments (org_id, profile_id, role, is_primary)
select id, owner_profile_id, 'edl', true
from public.organizations
where owner_profile_id is not null
on conflict (org_id, profile_id, role) do nothing;

-- Re-run the force-trigger's logic over every org now that the backfill above
-- exists, so owner_profile_id is provably derived (not just coincidentally
-- already correct) before we move on.
update public.organizations set owner_profile_id = public.compute_org_owner(id);
