-- Phase 6.4b — owner-defined org sub-roles (D-045).
--
-- Owners may create/edit their OWN org's sub-roles (org_id = current_org_id(),
-- is_system=false, account_type = their own customer type), AAL2-gated. System
-- sub-roles (org_id IS NULL) stay super-admin-only (D-032). These are additive,
-- OR-combined with the existing super-admin write policies. Owners write these
-- via the direct (RLS-gated) client, NOT the Edge Function.

-- Caller's own account_type, without tripping profiles RLS (mirrors is_owner()).
create or replace function public.current_account_type()
returns public.account_type
language sql
stable
security definer
set search_path = public
as $$
  select account_type from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_account_type() from public;
grant execute on function public.current_account_type() to authenticated;

-- ── owners may INSERT their own org's non-system sub-roles ─────────────────────
create policy sub_roles_owner_insert on public.sub_roles
  for insert to authenticated
  with check (
    public.is_owner()
    and public.is_aal2()
    and is_system = false
    and org_id = public.current_org_id()
    and account_type = public.current_account_type()
  );

-- ── owners may UPDATE their own org's non-system sub-roles ─────────────────────
-- Both USING and WITH CHECK are org+non-system scoped so an owner can neither
-- reach another org's row nor move a row to another org / mark it is_system.
create policy sub_roles_owner_update on public.sub_roles
  for update to authenticated
  using (
    public.is_owner()
    and public.is_aal2()
    and is_system = false
    and org_id = public.current_org_id()
  )
  with check (
    public.is_owner()
    and public.is_aal2()
    and is_system = false
    and org_id = public.current_org_id()
    and account_type = public.current_account_type()
  );

-- DELETE stays super-admin-only (owners edit, not delete, their sub-roles this
-- phase); the existing sub_roles_write_delete policy is unchanged.
