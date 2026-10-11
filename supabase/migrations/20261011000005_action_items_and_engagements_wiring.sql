-- 7.5-pre2 Session 4 — action_item + engagement record types, end to end.
--
-- action_items (from standups, 7.5-pre2-Session-1-era) gets the plumbing a
-- synced CS fact needs that a standup-internal task never did: project_id/
-- tenant_id attribution, a priority, a free-text owner fallback, the
-- standard provenance set every other record table has, its dedupe index,
-- and the DELETE policy every other record table has (standups' own
-- design never needed one). engagements (7.1) already has everything it
-- needs — this migration only extends apply_proposal() to reach it.

alter table public.action_items
  add column project_id  uuid references public.projects(id) on delete set null,
  add column tenant_id   uuid references public.tenants(id) on delete set null,
  add column priority    public.action_item_priority not null default 'medium',
  add column owner_text  text, -- free-text fallback when no profile matches by name
  add column source      public.record_source not null default 'manual',
  add column source_ref  text,
  add column updated_by  uuid references public.profiles(id) on delete set null,
  add column verified_at timestamptz,
  add column proposal_id uuid references public.proposals(id) on delete set null;

create index action_items_project_id_idx on public.action_items (project_id);
create index action_items_tenant_id_idx  on public.action_items (tenant_id);
create unique index action_items_org_source_ref_key on public.action_items (org_id, source_ref) where source_ref is not null;

create policy action_items_delete on public.action_items for delete to authenticated using (public.is_super_admin() and public.is_aal2());
grant delete on public.action_items to authenticated, service_role;

-- apply_proposal(): same as every prior branch, re-declared in full
-- (create-or-replace, not a rewrite) with two new target tables.
create or replace function public.apply_proposal(
  p_proposal_id uuid,
  p_decided_by uuid,
  p_payload_override jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals;
  v_payload  jsonb;
  v_new_id   uuid;
begin
  if not (public.is_super_admin() and public.is_aal2()) then
    raise exception 'insufficient_privilege: super_admin + AAL2 required';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id;
  if v_proposal is null then
    raise exception 'proposal % not found', p_proposal_id;
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'proposal % is not pending (status=%)', p_proposal_id, v_proposal.status;
  end if;

  v_payload := coalesce(p_payload_override, v_proposal.payload);

  if v_proposal.operation = 'delete' then
    if v_proposal.target_table = 'milestones' then delete from public.milestones where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'accomplishments' then delete from public.accomplishments where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'risks' then delete from public.risks where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'escalations' then delete from public.escalations where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'tickets' then delete from public.tickets where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'metric_values' then delete from public.metric_values where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'action_items' then delete from public.action_items where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'engagements' then delete from public.engagements where id = v_proposal.target_id;
    else raise exception 'target_table % is not allowed for apply_proposal (delete)', v_proposal.target_table;
    end if;

  elsif v_proposal.operation = 'create' then
    if v_proposal.target_table = 'milestones' then
      insert into public.milestones (project_id, org_id, tenant_id, period, description, status, source, source_ref, created_by, updated_by, proposal_id)
      values ((v_payload->>'project_id')::uuid, v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, (v_payload->>'period')::date, v_payload->>'description',
               coalesce(v_payload->>'status', 'not_started')::public.milestone_status, v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'accomplishments' then
      insert into public.accomplishments (project_id, org_id, tenant_id, period, text, source, source_ref, created_by, updated_by, proposal_id)
      values ((v_payload->>'project_id')::uuid, v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, (v_payload->>'period')::date, v_payload->>'text',
               v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'risks' then
      insert into public.risks (project_id, org_id, tenant_id, risk, impact, mitigation, severity, status, owner, source, source_ref, created_by, updated_by, proposal_id)
      values (nullif(v_payload->>'project_id', '')::uuid, v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, v_payload->>'risk', v_payload->>'impact', v_payload->>'mitigation',
               coalesce(v_payload->>'severity', 'medium')::public.risk_severity, coalesce(v_payload->>'status', 'open')::public.risk_status, v_payload->>'owner',
               v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'escalations' then
      insert into public.escalations (org_id, tenant_id, project_id, title, severity, raised_by, status, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, nullif(v_payload->>'project_id', '')::uuid, v_payload->>'title', coalesce(v_payload->>'severity', 'medium')::public.risk_severity,
               v_payload->>'raised_by', coalesce(v_payload->>'status', 'open')::public.escalation_status, v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'tickets' then
      insert into public.tickets (org_id, tenant_id, external_key, title, priority, status, url, system, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, v_payload->>'external_key', v_payload->>'title', coalesce(v_payload->>'priority', 'p3')::public.ticket_priority,
               coalesce(v_payload->>'status', 'open')::public.ticket_status, v_payload->>'url', v_payload->>'system', v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'metric_values' then
      insert into public.metric_values (org_id, tenant_id, project_id, metric_key, period, value, baseline_value, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, nullif(v_payload->>'project_id', '')::uuid, v_payload->>'metric_key', (v_payload->>'period')::date,
               (v_payload->>'value')::numeric, nullif(v_payload->>'baseline_value', '')::numeric, v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'action_items' then
      insert into public.action_items (org_id, tenant_id, project_id, description, owner_profile_id, owner_text, priority, due_date, status, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, nullif(v_payload->>'project_id', '')::uuid, v_payload->>'description',
               nullif(v_payload->>'owner_profile_id', '')::uuid, v_payload->>'owner_text',
               coalesce(v_payload->>'priority', 'medium')::public.action_item_priority,
               nullif(v_payload->>'due_date', '')::date,
               coalesce(v_payload->>'status', 'open')::public.action_item_status,
               v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'engagements' then
      insert into public.engagements (org_id, tenant_id, type, engagement_date, attendees, summary, follow_ups, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, nullif(v_payload->>'tenant_id', '')::uuid, (v_payload->>'type')::public.engagement_type, (v_payload->>'engagement_date')::date,
               array(select jsonb_array_elements_text(coalesce(v_payload->'attendees', '[]'::jsonb))),
               v_payload->>'summary', v_payload->>'follow_ups',
               v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    else
      raise exception 'target_table % is not allowed for apply_proposal (create)', v_proposal.target_table;
    end if;
    update public.proposals set target_id = v_new_id where id = v_proposal.id;

  elsif v_proposal.operation = 'update' then
    if v_proposal.target_table = 'milestones' then
      update public.milestones set
        description = coalesce(v_payload->>'description', description),
        period      = coalesce((v_payload->>'period')::date, period),
        status      = coalesce((v_payload->>'status')::public.milestone_status, status),
        tenant_id   = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by  = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'accomplishments' then
      update public.accomplishments set
        text       = coalesce(v_payload->>'text', text),
        period     = coalesce((v_payload->>'period')::date, period),
        tenant_id  = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'risks' then
      update public.risks set
        risk       = coalesce(v_payload->>'risk', risk),
        impact     = coalesce(v_payload->>'impact', impact),
        mitigation = coalesce(v_payload->>'mitigation', mitigation),
        severity   = coalesce((v_payload->>'severity')::public.risk_severity, severity),
        status     = coalesce((v_payload->>'status')::public.risk_status, status),
        owner      = coalesce(v_payload->>'owner', owner),
        tenant_id  = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'escalations' then
      update public.escalations set
        title      = coalesce(v_payload->>'title', title),
        severity   = coalesce((v_payload->>'severity')::public.risk_severity, severity),
        status     = coalesce((v_payload->>'status')::public.escalation_status, status),
        resolution = coalesce(v_payload->>'resolution', resolution),
        tenant_id  = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'tickets' then
      update public.tickets set
        title      = coalesce(v_payload->>'title', title),
        priority   = coalesce((v_payload->>'priority')::public.ticket_priority, priority),
        status     = coalesce((v_payload->>'status')::public.ticket_status, status),
        url        = coalesce(v_payload->>'url', url),
        tenant_id  = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by = p_decided_by,
        updated_at = now()
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'metric_values' then
      update public.metric_values set
        value          = coalesce((v_payload->>'value')::numeric, value),
        baseline_value = coalesce((v_payload->>'baseline_value')::numeric, baseline_value),
        tenant_id      = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by     = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'organizations' then
      update public.organizations set
        health        = coalesce((v_payload->>'health')::public.org_health, health),
        health_reason = coalesce(v_payload->>'health_reason', health_reason),
        updated_by    = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'action_items' then
      update public.action_items set
        description      = coalesce(v_payload->>'description', description),
        -- owner_profile_id/owner_text are mutually exclusive and always sent
        -- together by ingest when `owner` was provided — set both plainly
        -- (not coalesce) so resolving to a profile clears the free-text
        -- fallback, and vice versa; leave both alone if `owner` wasn't sent.
        owner_profile_id = case when v_payload ? 'owner_profile_id' or v_payload ? 'owner_text' then nullif(v_payload->>'owner_profile_id', '')::uuid else owner_profile_id end,
        owner_text       = case when v_payload ? 'owner_profile_id' or v_payload ? 'owner_text' then v_payload->>'owner_text' else owner_text end,
        priority         = coalesce((v_payload->>'priority')::public.action_item_priority, priority),
        due_date         = coalesce((v_payload->>'due_date')::date, due_date),
        status           = coalesce((v_payload->>'status')::public.action_item_status, status),
        tenant_id        = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by       = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'engagements' then
      update public.engagements set
        summary         = coalesce(v_payload->>'summary', summary),
        follow_ups      = coalesce(v_payload->>'follow_ups', follow_ups),
        engagement_date = coalesce((v_payload->>'engagement_date')::date, engagement_date),
        attendees       = case when v_payload ? 'attendees' then array(select jsonb_array_elements_text(coalesce(v_payload->'attendees', '[]'::jsonb))) else attendees end,
        tenant_id       = coalesce(nullif(v_payload->>'tenant_id', '')::uuid, tenant_id),
        updated_by      = p_decided_by
      where id = v_proposal.target_id;
    else
      raise exception 'target_table % is not allowed for apply_proposal (update)', v_proposal.target_table;
    end if;
  else
    raise exception 'unknown proposal operation %', v_proposal.operation;
  end if;

  update public.proposals set status = 'approved', decided_by = p_decided_by, decided_at = now() where id = v_proposal.id;

  insert into public.audit_log (actor_id, action, record_table, record_id, org_id, proposal_id, metadata)
  values (p_decided_by, 'approve', v_proposal.target_table, coalesce(v_proposal.target_id, v_new_id), v_proposal.org_id, v_proposal.id,
          jsonb_build_object('operation', v_proposal.operation));
end;
$$;
