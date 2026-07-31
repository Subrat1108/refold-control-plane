-- Phase 6.4b / Phase 0 (security) — lock down profiles self-edit (D-043).
--
-- The 6.1 tables migration granted `update` on ALL columns of profiles to
-- `authenticated`, and the profiles_update RLS policy permits a self-edit branch
-- (`id = auth.uid()`). Together that let a user change ANY column on their own
-- row — role, account_type, sub_role_id, org_id, status — a privilege-escalation
-- path (a member could self-promote to owner/super_admin or jump orgs).
--
-- Fix at the Postgres PRIVILEGE layer (independent of any RLS-logic bug): revoke
-- column-wide UPDATE from `authenticated` and re-grant UPDATE only on the safe
-- column `full_name`. Any authenticated UPDATE touching a privileged column now
-- fails with 42501 (insufficient_privilege), regardless of the RLS row check.
--
-- Privileged transitions are UNAFFECTED because they run through the provisioning
-- Edge Function under the `service_role` key (bypasses column grants; D-039 gave
-- service_role full column privileges). So this is the enforcement of "privileged
-- profile changes go through the Edge Function only". Append-only migration.

revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;
