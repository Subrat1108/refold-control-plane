-- Phase 7.1 — extend + harden audit_log (build-spec-v3 § 3.2, § 5).
-- Append-only: ALTER + one drop/recreate of an existing policy (same pattern
-- D-032/D-045 already used), no other prior migration touched.

alter table public.audit_log
  add column on_behalf_of text,             -- set when actor_id is null (service-role / system writes)
  add column record_table text,
  add column record_id    uuid,
  add column before        jsonb,
  add column after         jsonb,
  add column proposal_id   uuid references public.proposals(id) on delete set null;

-- Backfill record_table for existing rows from the (singular) target_type the
-- provisioning Edge Function has always written ('organization' / 'profile') —
-- normalized to the plural table-name form record_table uses going forward
-- (matching TG_TABLE_NAME in the generic trigger). Without this, every
-- historical audit row would have record_table NULL and silently vanish from
-- the tightened owner-visible policy below.
update public.audit_log set record_table = 'organizations' where target_type = 'organization';
update public.audit_log set record_table = 'profiles'      where target_type = 'profile';

-- "Enforced by database triggers so nothing bypasses it" (§3.2): going forward,
-- the ONLY writer of audit_log is the generic SECURITY DEFINER trigger
-- (20261007000008), which bypasses RLS/grants entirely via its owner's
-- privileges. Revoke direct write access so nothing else can insert, forge, or
-- tamper with rows at the privilege layer. The old audit_log_insert RLS policy
-- (actor_id = auth.uid()) is now unreachable dead code — left in place, harmless.
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.audit_log from service_role;

-- Tighten audit_log_select: a customer owner must not see audit rows about
-- Phase-7 CS record tables (projects, risks, …) merely because org_id matches —
-- they have ZERO RLS access to those tables themselves, so seeing them via the
-- audit trail would be a leak. Owners keep visibility only into the pre-Phase-7
-- tables that D-046 already gave them audit access to.
drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    public.is_super_admin()
    or (
      org_id = public.current_org_id()
      and record_table = any (array['organizations', 'profiles', 'invitations', 'sub_roles', 'saved_report_configs'])
    )
  );
