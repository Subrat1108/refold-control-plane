-- Phase 7.1 — generic audit trigger (build-spec-v3 § 3.2, § 5).
-- One function, attached to organizations + every new CS/plumbing table. Reads
-- OLD/NEW generically via to_jsonb so no per-table branches are needed, with a
-- SINGLE special case: org_id falls back to the row's own id ONLY for the
-- organizations table (it IS the org; it has no org_id column). Every other
-- table's org_id is read as-is — NULL where the table genuinely has none
-- (portfolio_notes, sync_runs) rather than guessing, since audit_log.org_id is
-- an FK to organizations and a wrong guess would violate it and roll back the
-- triggering statement entirely.
--
-- SECURITY DEFINER (same pattern as is_super_admin()/current_org_id()/etc.) so
-- it bypasses audit_log's RLS/grants regardless of which role's statement fired
-- it — this is what makes it fire correctly for both `authenticated` (super
-- admin UI edits) and `service_role` (future ingest/sync writes), satisfying
-- "nothing bypasses it" (§3.2).

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor        uuid := auth.uid();
  v_on_behalf_of text;
  v_action       text;
  v_row          jsonb;
  v_record_id    uuid;
  v_org_id       uuid;
  v_proposal_id  uuid;
  v_before       jsonb;
  v_after        jsonb;
begin
  -- auth.uid() is null outside a user JWT context (service_role, migrations,
  -- seed.sql, pg_cron) — record who/what acted instead (D-029-style convention).
  if v_actor is null then
    v_on_behalf_of := current_user;
  end if;

  if (tg_op = 'INSERT') then
    v_action := 'create';
    v_row    := to_jsonb(NEW);
    v_before := null;
    v_after  := v_row;
  elsif (tg_op = 'UPDATE') then
    v_action := 'update';
    v_row    := to_jsonb(NEW);
    v_before := to_jsonb(OLD);
    v_after  := v_row;
  else -- DELETE
    v_action := 'delete';
    v_row    := to_jsonb(OLD);
    v_before := v_row;
    v_after  := null;
  end if;

  v_record_id   := nullif(v_row->>'id', '')::uuid;           -- null for sync_state (composite PK, no surrogate id)
  v_proposal_id := nullif(v_row->>'proposal_id', '')::uuid;  -- null for tables with no proposal_id column

  if (tg_table_name = 'organizations') then
    v_org_id := v_record_id;                                  -- this row IS the org
  else
    v_org_id := nullif(v_row->>'org_id', '')::uuid;           -- null for portfolio_notes/sync_runs, which have no org_id
  end if;

  insert into public.audit_log
    (actor_id, on_behalf_of, action, target_type, target_id, record_table, record_id, before, after, org_id, proposal_id, metadata)
  values
    (v_actor, v_on_behalf_of, v_action, tg_table_name, v_record_id, tg_table_name, v_record_id, v_before, v_after, v_org_id, v_proposal_id, '{}'::jsonb);

  if (tg_op = 'DELETE') then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

-- No execute grants needed/possible for a trigger function in the normal sense —
-- it's invoked by the trigger mechanism, running as the function's owner
-- (bypassing RLS/grants on audit_log) regardless of the firing statement's role.
revoke all on function public.write_audit_log() from public;

-- Attached to organizations + every new CS record / plumbing table. NOT
-- attached to profiles/sub_roles/invitations/saved_report_configs (already
-- manually audited by the provisioning Edge Function — adding the trigger too
-- would double-log every provisioning action) and NOT to segments/
-- metric_definitions (pure lookups, same treatment as system sub-roles).
--
-- Known accepted side effect: organizations now gets logged BOTH by the Edge
-- Function's manual insert (action='provision_org') AND this trigger
-- (action='create') for every provision_org call — redundant, not deduped this
-- session.

create trigger organizations_audit    after insert or update or delete on public.organizations    for each row execute function public.write_audit_log();

create trigger proposals_audit        after insert or update or delete on public.proposals        for each row execute function public.write_audit_log();
create trigger sync_runs_audit        after insert or update or delete on public.sync_runs         for each row execute function public.write_audit_log();
create trigger sync_state_audit       after insert or update or delete on public.sync_state        for each row execute function public.write_audit_log();

create trigger projects_audit         after insert or update or delete on public.projects          for each row execute function public.write_audit_log();
create trigger milestones_audit       after insert or update or delete on public.milestones        for each row execute function public.write_audit_log();
create trigger accomplishments_audit  after insert or update or delete on public.accomplishments   for each row execute function public.write_audit_log();
create trigger risks_audit            after insert or update or delete on public.risks             for each row execute function public.write_audit_log();
create trigger asks_audit             after insert or update or delete on public.asks              for each row execute function public.write_audit_log();

create trigger escalations_audit      after insert or update or delete on public.escalations       for each row execute function public.write_audit_log();
create trigger tickets_audit          after insert or update or delete on public.tickets           for each row execute function public.write_audit_log();
create trigger engagements_audit      after insert or update or delete on public.engagements       for each row execute function public.write_audit_log();
create trigger metric_values_audit    after insert or update or delete on public.metric_values     for each row execute function public.write_audit_log();
create trigger portfolio_notes_audit  after insert or update or delete on public.portfolio_notes   for each row execute function public.write_audit_log();
