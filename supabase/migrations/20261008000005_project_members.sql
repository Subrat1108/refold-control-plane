-- Phase 7.2a — project_members replaces projects.fdes / edl_profile_id
-- (build-spec-v3 § 5; D-071). No name-matching migration: a guarded drop
-- instead — fails loudly if either column has any non-null data, rather than
-- silently discarding or guessing at it. (Migrations run before seed files in
-- `db reset`, and neither the local nor the cloud projects table has real
-- pre-existing data predating this migration, so in practice this check
-- passes with zero rows affected — verified read-only on cloud before this
-- migration was pushed, see devlog Session 28.)

create table public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       public.assignment_role not null,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id, role)
);

create index project_members_project_id_idx on public.project_members (project_id);
create index project_members_profile_id_idx on public.project_members (profile_id);

alter table public.project_members enable row level security;

create policy project_members_select on public.project_members for select to authenticated using (public.is_super_admin());
create policy project_members_insert on public.project_members for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy project_members_update on public.project_members for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy project_members_delete on public.project_members for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on public.project_members to authenticated, service_role;

create trigger project_members_audit after insert or update or delete on public.project_members for each row execute function public.write_audit_log();

-- ── guarded drop ─────────────────────────────────────────────────────────────
do $$
declare
  v_fdes_count int;
  v_edl_count  int;
begin
  select count(*) into v_fdes_count from public.projects where fdes is not null and array_length(fdes, 1) > 0;
  select count(*) into v_edl_count  from public.projects where edl_profile_id is not null;

  if v_fdes_count > 0 or v_edl_count > 0 then
    raise exception
      'Refusing to drop projects.fdes/edl_profile_id: % row(s) have non-null fdes, % row(s) have non-null edl_profile_id. Migrate this data into project_members manually before re-running.',
      v_fdes_count, v_edl_count;
  end if;
end $$;

alter table public.projects drop column fdes, drop column edl_profile_id;
