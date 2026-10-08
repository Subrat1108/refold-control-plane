-- Phase 7.2a — profiles.title (build-spec-v3 § 5). Editable by super admins
-- ONLY via the provisioning Edge Function's set_title action (D-069) — D-043's
-- column-grant lockdown already restricts `authenticated` direct UPDATEs on
-- profiles to full_name alone, so title is simply never in that grant list;
-- no RLS/grant change is needed here to protect it, only to add the column.

alter table public.profiles
  add column title public.profile_title,
  add constraint profiles_title_super_admin_only
    check (title is null or account_type = 'super_admin');
