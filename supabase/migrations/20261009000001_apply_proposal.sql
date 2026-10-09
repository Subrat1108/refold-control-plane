-- Phase 7.3 — apply_proposal()/reject_proposal() (build-spec-v3 § 3.1, § 3.2).
--
-- Approving a proposal must transactionally apply its operation to the real
-- target table AND audit the DECISION itself with action='approve'/'reject'
-- (the generic trigger can only log 'update' on the proposals row's own
-- status change, not the semantic approve/reject the Audit log screen needs
-- to show) -- so this is one SECURITY DEFINER function per action rather
-- than a plain client-side proposals update.
--
-- target_table is checked against a FIXED allow-list matching §3.1's pending
-- kinds exactly (metrics, milestones/accomplishments, risks, escalations,
-- tickets, health changes). One explicit branch per table -- not dynamic
-- format(%I, ...) SQL -- since each table's column set differs and this
-- avoids any identifier-injection surface entirely. asks/engagements/
-- portfolio_notes/projects are manual-only (7.2b) and stay unreachable here
-- until the roadmap says otherwise.

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
    else raise exception 'target_table % is not allowed for apply_proposal (delete)', v_proposal.target_table;
    end if;

  elsif v_proposal.operation = 'create' then
    if v_proposal.target_table = 'milestones' then
      insert into public.milestones (project_id, org_id, period, description, status, source, source_ref, created_by, updated_by, proposal_id)
      values ((v_payload->>'project_id')::uuid, v_proposal.org_id, (v_payload->>'period')::date, v_payload->>'description',
               coalesce(v_payload->>'status', 'not_started')::public.milestone_status, v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'accomplishments' then
      insert into public.accomplishments (project_id, org_id, period, text, source, source_ref, created_by, updated_by, proposal_id)
      values ((v_payload->>'project_id')::uuid, v_proposal.org_id, (v_payload->>'period')::date, v_payload->>'text',
               v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'risks' then
      insert into public.risks (project_id, org_id, risk, impact, mitigation, severity, status, owner, source, source_ref, created_by, updated_by, proposal_id)
      values (nullif(v_payload->>'project_id', '')::uuid, v_proposal.org_id, v_payload->>'risk', v_payload->>'impact', v_payload->>'mitigation',
               coalesce(v_payload->>'severity', 'medium')::public.risk_severity, coalesce(v_payload->>'status', 'open')::public.risk_status, v_payload->>'owner',
               v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'escalations' then
      insert into public.escalations (org_id, project_id, title, severity, raised_by, status, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, nullif(v_payload->>'project_id', '')::uuid, v_payload->>'title', coalesce(v_payload->>'severity', 'medium')::public.risk_severity,
               v_payload->>'raised_by', coalesce(v_payload->>'status', 'open')::public.escalation_status, v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'tickets' then
      insert into public.tickets (org_id, external_key, title, priority, status, url, system, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, v_payload->>'external_key', v_payload->>'title', coalesce(v_payload->>'priority', 'p3')::public.ticket_priority,
               coalesce(v_payload->>'status', 'open')::public.ticket_status, v_payload->>'url', v_payload->>'system', v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
      returning id into v_new_id;
    elsif v_proposal.target_table = 'metric_values' then
      insert into public.metric_values (org_id, project_id, metric_key, period, value, baseline_value, source, source_ref, created_by, updated_by, proposal_id)
      values (v_proposal.org_id, nullif(v_payload->>'project_id', '')::uuid, v_payload->>'metric_key', (v_payload->>'period')::date,
               (v_payload->>'value')::numeric, nullif(v_payload->>'baseline_value', '')::numeric, v_proposal.source, v_proposal.source_ref, p_decided_by, p_decided_by, v_proposal.id)
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
        updated_by  = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'accomplishments' then
      update public.accomplishments set
        text       = coalesce(v_payload->>'text', text),
        period     = coalesce((v_payload->>'period')::date, period),
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
        updated_by = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'escalations' then
      update public.escalations set
        title      = coalesce(v_payload->>'title', title),
        severity   = coalesce((v_payload->>'severity')::public.risk_severity, severity),
        status     = coalesce((v_payload->>'status')::public.escalation_status, status),
        resolution = coalesce(v_payload->>'resolution', resolution),
        updated_by = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'tickets' then
      update public.tickets set
        title      = coalesce(v_payload->>'title', title),
        priority   = coalesce((v_payload->>'priority')::public.ticket_priority, priority),
        status     = coalesce((v_payload->>'status')::public.ticket_status, status),
        url        = coalesce(v_payload->>'url', url),
        updated_by = p_decided_by,
        updated_at = now()
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'metric_values' then
      update public.metric_values set
        value          = coalesce((v_payload->>'value')::numeric, value),
        baseline_value = coalesce((v_payload->>'baseline_value')::numeric, baseline_value),
        updated_by     = p_decided_by
      where id = v_proposal.target_id;
    elsif v_proposal.target_table = 'organizations' then
      update public.organizations set
        health        = coalesce((v_payload->>'health')::public.org_health, health),
        health_reason = coalesce(v_payload->>'health_reason', health_reason),
        updated_by    = p_decided_by
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

create or replace function public.reject_proposal(
  p_proposal_id uuid,
  p_decided_by uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals;
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

  update public.proposals set status = 'rejected', decided_by = p_decided_by, decided_at = now(), reason = p_reason where id = p_proposal_id;

  insert into public.audit_log (actor_id, action, record_table, record_id, org_id, proposal_id, metadata)
  values (p_decided_by, 'reject', v_proposal.target_table, v_proposal.target_id, v_proposal.org_id, v_proposal.id,
          jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.apply_proposal(uuid, uuid, jsonb) from public;
revoke all on function public.reject_proposal(uuid, uuid, text) from public;
grant execute on function public.apply_proposal(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.reject_proposal(uuid, uuid, text) to authenticated, service_role;
