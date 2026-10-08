-- Phase 7.2a — teams + team_members (build-spec-v3 § 5).
--
-- team_members has a surrogate `id` (not just a composite PK on team_id,
-- profile_id): the 7.1 generic audit trigger (write_audit_log) reads NEW/OLD
-- via `to_jsonb(...)->>'id'` to populate audit_log.record_id — a table with
-- no `id` column at all just yields a null record_id (as sync_state already
-- does, harmlessly), but giving team_members a real surrogate id lets its
-- audit rows point at a specific membership row like every other table does.
-- The natural key is still enforced via a separate unique constraint.

create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  lead_profile_id uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.team_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, profile_id)
);

create index team_members_team_id_idx    on public.team_members (team_id);
create index team_members_profile_id_idx on public.team_members (profile_id);

alter table public.teams        enable row level security;
alter table public.team_members enable row level security;

create policy teams_select on public.teams for select to authenticated using (public.is_super_admin());
create policy teams_insert on public.teams for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy teams_update on public.teams for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy teams_delete on public.teams for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy team_members_select on public.team_members for select to authenticated using (public.is_super_admin());
create policy team_members_insert on public.team_members for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy team_members_update on public.team_members for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy team_members_delete on public.team_members for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on public.teams, public.team_members to authenticated, service_role;

create trigger teams_audit        after insert or update or delete on public.teams        for each row execute function public.write_audit_log();
create trigger team_members_audit after insert or update or delete on public.team_members for each row execute function public.write_audit_log();
