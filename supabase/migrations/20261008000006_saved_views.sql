-- Phase 7.2a — saved_views (build-spec-v3 § 5). Personal preferences, private
-- to their owner — a different RLS shape from every other Phase-7 table
-- (which is blanket is_super_admin()-select): SELECT/UPDATE/DELETE require
-- owner_profile_id = auth.uid() in addition to is_super_admin(), so a customer
-- role still sees nothing, but one super admin can never see another's views.
--
-- Deliberately NOT given the generic audit trigger (D-072) — this is UI
-- preference noise (which filters/sort/columns someone likes), not a CS
-- record; auditing it would just clutter the audit log with no value.

create table public.saved_views (
  id               uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  page             text not null, -- e.g. 'portfolio', 'accounts', 'projects', 'approvals', 'standups', 'team'
  scope            public.saved_view_scope not null,
  scope_target     uuid, -- profiles.id when scope='person'; teams.id when scope='team_id'; null otherwise (no FK: polymorphic, like proposals.target_id)
  filters          jsonb not null default '{}',
  sort             jsonb,
  columns          text[],
  is_default       boolean not null default false,
  pinned           boolean not null default false,
  created_at       timestamptz not null default now()
);

create index saved_views_owner_profile_id_idx on public.saved_views (owner_profile_id);

-- At most one default view per (owner, page).
create unique index saved_views_one_default_per_page
  on public.saved_views (owner_profile_id, page) where is_default;

alter table public.saved_views enable row level security;

create policy saved_views_select on public.saved_views
  for select to authenticated
  using (public.is_super_admin() and owner_profile_id = auth.uid());

create policy saved_views_insert on public.saved_views
  for insert to authenticated
  with check (public.is_super_admin() and public.is_aal2() and owner_profile_id = auth.uid());

create policy saved_views_update on public.saved_views
  for update to authenticated
  using (public.is_super_admin() and owner_profile_id = auth.uid())
  with check (public.is_super_admin() and public.is_aal2() and owner_profile_id = auth.uid());

create policy saved_views_delete on public.saved_views
  for delete to authenticated
  using (public.is_super_admin() and public.is_aal2() and owner_profile_id = auth.uid());

grant select, insert, update, delete on public.saved_views to authenticated, service_role;
