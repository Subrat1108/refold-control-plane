-- Phase 7.1 — extend organizations for the CS Hub account model (build-spec-v3 § 5).
-- Append-only: ALTER only, no existing column/policy touched. RLS on
-- organizations is unchanged (still is_super_admin()/is_aal2() for writes,
-- is_super_admin() OR own-org for select) — these are additive nullable/defaulted
-- columns, so the existing WITH CHECK clauses remain valid as-is.

alter table public.organizations
  add column segment_id       uuid references public.segments(id) on delete set null,
  add column deployment_model public.deployment_model,
  add column health           public.org_health not null default 'active',
  -- Default shapes NEW rows (new accounts start as prospects); existing rows are
  -- explicitly backfilled to 'live' below, overriding the auto-filled default.
  add column lifecycle_stage  public.lifecycle_stage not null default 'prospect',
  add column owner_profile_id uuid references public.profiles(id) on delete set null,
  add column data_access_mode public.data_access_mode,
  add column aliases          text[] not null default '{}';

-- Backfill existing rows (every org that exists before Phase 7 is already live).
update public.organizations set lifecycle_stage = 'live';

update public.organizations set deployment_model = 'cloud'           where deployment_type = 'cloud';
update public.organizations set deployment_model = 'onprem_managed'  where deployment_type = 'on_premise';
-- deployment_type = 'internal' (the Refold org) is left deployment_model NULL —
-- it isn't a customer deployment and none of the three enum values fit it.
