-- Phase 6.4a — grant table privileges to `service_role`.
-- The provisioning Edge Function uses a service-role client (bypasses RLS, D-025)
-- to create orgs/profiles/invitations and write audit rows. The 6.1 tables
-- migration granted DML only to `authenticated`, so those service-role writes hit
-- "permission denied for table …". Grant the same DML to service_role here.
-- Append-only: earlier migrations untouched.

grant select, insert, update, delete on
  public.organizations,
  public.sub_roles,
  public.profiles,
  public.invitations,
  public.audit_log,
  public.saved_report_configs
to service_role;
