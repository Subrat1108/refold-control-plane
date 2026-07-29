-- Phase 6.1 — Row-Level Security (build-spec-v2 § 5)
-- Tenant isolation lives here (D-028): a customer can only ever read their own
-- org's rows, regardless of client behaviour. AAL2 gates super-admin writes and
-- all provisioning (D-029).

alter table public.organizations       enable row level security;
alter table public.sub_roles           enable row level security;
alter table public.profiles            enable row level security;
alter table public.invitations         enable row level security;
alter table public.audit_log           enable row level security;
alter table public.saved_report_configs enable row level security;

-- ── organizations ───────────────────────────────────────────────────────────
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_super_admin() or id = public.current_org_id());

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (public.is_super_admin() and public.is_aal2());

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_super_admin() and public.is_aal2())
  with check (public.is_super_admin() and public.is_aal2());

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.is_super_admin() and public.is_aal2());

-- ── sub_roles ────────────────────────────────────────────────────────────────
-- Readable by any authenticated user (needed to render/assign roles). Defining
-- or editing sub-role rows is super-admin-only for now (owners only *assign*
-- existing sub-roles via profiles.sub_role_id) — see 6.4 open question.
create policy sub_roles_select on public.sub_roles
  for select to authenticated
  using (true);

create policy sub_roles_write_insert on public.sub_roles
  for insert to authenticated
  with check (public.is_super_admin() and public.is_aal2());

create policy sub_roles_write_update on public.sub_roles
  for update to authenticated
  using (public.is_super_admin() and public.is_aal2())
  with check (public.is_super_admin() and public.is_aal2());

create policy sub_roles_write_delete on public.sub_roles
  for delete to authenticated
  using (public.is_super_admin() and public.is_aal2() and is_system = false);

-- ── profiles ─────────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_super_admin() or org_id = public.current_org_id());

-- Provisioning: super-admin anywhere, owners within their own org. AAL2-gated.
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    public.is_aal2() and (
      public.is_super_admin()
      or (public.is_owner() and org_id = public.current_org_id())
    )
  );

-- Super-admin / owner provisioning updates are AAL2-gated; a user may always
-- update their own profile (self-edit, no MFA required).
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or (public.is_aal2() and (public.is_super_admin() or (public.is_owner() and org_id = public.current_org_id())))
  )
  with check (
    id = auth.uid()
    or (public.is_aal2() and (public.is_super_admin() or (public.is_owner() and org_id = public.current_org_id())))
  );

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_aal2() and (public.is_super_admin() or (public.is_owner() and org_id = public.current_org_id())));

-- ── invitations ──────────────────────────────────────────────────────────────
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_super_admin() or org_id = public.current_org_id());

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    public.is_aal2() and (
      public.is_super_admin()
      or (public.is_owner() and org_id = public.current_org_id())
    )
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using (
    public.is_aal2() and (
      public.is_super_admin()
      or (public.is_owner() and org_id = public.current_org_id())
    )
  )
  with check (
    public.is_aal2() and (
      public.is_super_admin()
      or (public.is_owner() and org_id = public.current_org_id())
    )
  );

-- ── audit_log ────────────────────────────────────────────────────────────────
-- Super-admin reads the full trail (no org_id column to scope by — see 6.4
-- question). Append-only: only self-attributed inserts, no update/delete.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_super_admin());

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (actor_id = auth.uid());

-- ── saved_report_configs ─────────────────────────────────────────────────────
create policy saved_reports_select on public.saved_report_configs
  for select to authenticated
  using (public.is_super_admin() or org_id = public.current_org_id());

create policy saved_reports_insert on public.saved_report_configs
  for insert to authenticated
  with check (public.is_super_admin() or org_id = public.current_org_id());

create policy saved_reports_update on public.saved_report_configs
  for update to authenticated
  using (public.is_super_admin() or created_by = auth.uid())
  with check (public.is_super_admin() or created_by = auth.uid());

create policy saved_reports_delete on public.saved_report_configs
  for delete to authenticated
  using (public.is_super_admin() or created_by = auth.uid());
