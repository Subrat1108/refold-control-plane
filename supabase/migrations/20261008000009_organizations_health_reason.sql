-- Phase 7.2b — Account 360's Overview tab needs "change health (with reason)"
-- and "mark verified", but organizations (extended in 7.1) never got the
-- provenance-style columns every other CS record table has. Additive only.

alter table public.organizations
  add column health_reason text,
  add column verified_at   timestamptz,
  add column updated_by    uuid references public.profiles(id) on delete set null;
