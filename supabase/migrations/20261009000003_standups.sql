-- Standups (equal-admins model Part 3, D-085 + this session's D-0xx) —
-- product-overview.md § 5.7. Anyone can host; participants are pre-filled
-- from reports_to + a remembered set (saved_views, see below), not a fixed
-- team roster. Same RLS/grant/audit shape as account_roles (operational
-- records worth auditing, unlike saved_views' personal-pref exclusion).

create type public.action_item_status as enum ('open', 'done');

create table public.standups (
  id               uuid primary key default gen_random_uuid(),
  host_profile_id  uuid not null references public.profiles(id) on delete cascade,
  standup_date     date not null,
  created_at       timestamptz not null default now()
);

create index standups_host_profile_id_idx on public.standups (host_profile_id);
create index standups_standup_date_idx    on public.standups (standup_date);

create table public.standup_entries (
  id          uuid primary key default gen_random_uuid(),
  standup_id  uuid not null references public.standups(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  yesterday   text,
  today       text,
  blockers    text,
  created_at  timestamptz not null default now(),
  unique (standup_id, profile_id)
);

create index standup_entries_standup_id_idx on public.standup_entries (standup_id);
create index standup_entries_profile_id_idx on public.standup_entries (profile_id);

create table public.action_items (
  id                uuid primary key default gen_random_uuid(),
  standup_entry_id  uuid references public.standup_entries(id) on delete set null,
  org_id            uuid references public.organizations(id) on delete set null,
  owner_profile_id  uuid references public.profiles(id) on delete set null,
  description       text not null,
  due_date          date,
  status            public.action_item_status not null default 'open',
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index action_items_owner_profile_id_idx on public.action_items (owner_profile_id);
create index action_items_org_id_idx           on public.action_items (org_id);
create index action_items_status_idx           on public.action_items (status);

alter table public.standups        enable row level security;
alter table public.standup_entries enable row level security;
alter table public.action_items    enable row level security;

create policy standups_select on public.standups for select to authenticated using (public.is_super_admin());
create policy standups_insert on public.standups for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy standups_update on public.standups for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());

-- Every super admin can READ every entry (scope is focus, not access
-- control — same principle as account_roles/proposals). WRITE is narrower:
-- a participant may edit their own entry; the host of that standup may
-- edit any entry in it. This is the one RLS policy in the schema that
-- checks something beyond is_super_admin()/is_aal2().
create policy standup_entries_select on public.standup_entries for select to authenticated using (public.is_super_admin());
create policy standup_entries_insert on public.standup_entries for insert to authenticated with check (
  public.is_super_admin() and public.is_aal2()
  and (
    profile_id = auth.uid()
    or exists (select 1 from public.standups s where s.id = standup_id and s.host_profile_id = auth.uid())
  )
);
create policy standup_entries_update on public.standup_entries for update to authenticated using (
  public.is_super_admin() and public.is_aal2()
  and (
    profile_id = auth.uid()
    or exists (select 1 from public.standups s where s.id = standup_id and s.host_profile_id = auth.uid())
  )
) with check (
  public.is_super_admin() and public.is_aal2()
  and (
    profile_id = auth.uid()
    or exists (select 1 from public.standups s where s.id = standup_id and s.host_profile_id = auth.uid())
  )
);

-- action_items are shared team artifacts (like asks/escalations) — any
-- super admin at AAL2 can create/reassign/close one, not just its owner.
create policy action_items_select on public.action_items for select to authenticated using (public.is_super_admin());
create policy action_items_insert on public.action_items for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy action_items_update on public.action_items for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());

grant select, insert, update on public.standups, public.standup_entries, public.action_items to authenticated, service_role;

create trigger standups_audit        after insert or update or delete on public.standups        for each row execute function public.write_audit_log();
create trigger standup_entries_audit after insert or update or delete on public.standup_entries for each row execute function public.write_audit_log();
create trigger action_items_audit    after insert or update or delete on public.action_items    for each row execute function public.write_audit_log();
