-- Phase 6.1 — RLS helper functions (build-spec-v2 § 5)
-- SECURITY DEFINER + fixed search_path so they read profiles without triggering
-- the profiles RLS policies (which call these helpers) — avoids recursion.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_type = 'super_admin'
  );
$$;

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- True only when the request was made at assurance level 2 (MFA satisfied).
create or replace function public.is_aal2()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.current_org_id() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.is_aal2() from public;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_aal2() to authenticated;
