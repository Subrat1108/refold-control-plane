-- Phase 6 / Phase-0 amendment (D-032) — approved in the 6.1 go-ahead but missed.
-- Adds nullable org_id to sub_roles and audit_log so 6.4 can support owner-scoped
-- sub-roles and owner-visible audit trails. Append-only: existing migrations are
-- left untouched; here we alter + drop/recreate only the affected policies.
--
-- Semantics: sub_roles.org_id NULL = system/global sub-role; non-null = defined
-- by that org. System-seed sub-roles keep org_id NULL (already the case).

alter table public.sub_roles add column org_id uuid references public.organizations(id) on delete cascade;
alter table public.audit_log add column org_id uuid references public.organizations(id) on delete set null;

create index sub_roles_org_id_idx on public.sub_roles (org_id);
create index audit_log_org_id_idx on public.audit_log (org_id);

-- ── sub_roles SELECT: system rows visible to all; org rows scoped to that org ──
drop policy sub_roles_select on public.sub_roles;
create policy sub_roles_select on public.sub_roles
  for select to authenticated
  using (org_id is null or org_id = public.current_org_id() or public.is_super_admin());

-- sub_roles writes stay super_admin + AAL2 for now (owner-defined org sub-roles
-- land in 6.4); the existing insert/update/delete policies are unchanged.

-- ── audit_log SELECT: super_admin sees all; owners see their own org's trail ──
drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_super_admin() or org_id = public.current_org_id());

-- audit_log INSERT stays append-only (actor_id = auth.uid()); unchanged.
