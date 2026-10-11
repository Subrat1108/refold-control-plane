-- 7.5-pre2 Session 1 — accounts & tenants are the only truth (build-spec-v3
-- extension; see docs/decisions.md D-1xx and the devlog session entry for
-- the full design rationale). A tenant is an end-customer/program/sub-
-- account under one of our accounts (e.g. a platform customer's bank
-- programs) — it is NEVER an account itself, and the sync agent can never
-- create one on its own (that's Session 2's account_resolution flow).
--
-- account_sources replaces free-text organizations.aliases as the
-- structured, exact-match lookup the ingest function queries to resolve an
-- account OR a tenant from a Slack channel id / email domain / Zendesk org
-- id / Fireflies hint / name variant. aliases is backfilled into it below
-- and kept (not dropped) for now; new code stops writing to it.

create type public.account_source_type as enum (
  'slack_channel', 'email_domain', 'zendesk_org_id', 'fireflies_hint', 'name_variant'
);

-- Additive enum value — a genuinely new lifecycle stage (went quiet after
-- being active), not representable by any existing value. "unverified"
-- (the other new tag the real workflow uses) deliberately gets NO new
-- value here: organizations.verified_at is null already means exactly
-- that (7.2b's "mark verified"), so a second mechanism would be redundant.
alter type public.lifecycle_stage add value 'dormant';

create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  notes      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.account_sources (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete cascade, -- null = account-level source
  source_type public.account_source_type not null,
  value       text not null,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (source_type, value) -- an identifier names exactly one account/tenant
);

create index tenants_org_id_idx         on public.tenants (org_id);
create index account_sources_org_id_idx on public.account_sources (org_id);
create index account_sources_tenant_id_idx on public.account_sources (tenant_id);

alter table public.tenants         enable row level security;
alter table public.account_sources enable row level security;

create policy tenants_select on public.tenants for select to authenticated using (public.is_super_admin());
create policy tenants_insert on public.tenants for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy tenants_update on public.tenants for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy tenants_delete on public.tenants for delete to authenticated using (public.is_super_admin() and public.is_aal2());

create policy account_sources_select on public.account_sources for select to authenticated using (public.is_super_admin());
create policy account_sources_insert on public.account_sources for insert to authenticated with check (public.is_super_admin() and public.is_aal2());
create policy account_sources_update on public.account_sources for update to authenticated using (public.is_super_admin() and public.is_aal2()) with check (public.is_super_admin() and public.is_aal2());
create policy account_sources_delete on public.account_sources for delete to authenticated using (public.is_super_admin() and public.is_aal2());

grant select, insert, update, delete on public.tenants, public.account_sources to authenticated, service_role;

create trigger tenants_audit         after insert or update or delete on public.tenants         for each row execute function public.write_audit_log();
create trigger account_sources_audit after insert or update or delete on public.account_sources for each row execute function public.write_audit_log();

-- Records can be attributed to account + optional tenant (build-spec-v3
-- extension). Nullable on every CS record table it's relevant to, including
-- the two (engagements, asks) not yet reachable via apply_proposal() — they
-- stay manual-only; their tenant_id is settable from the same Account 360
-- UI that writes everything else about them.
alter table public.milestones      add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.accomplishments add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.risks           add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.escalations     add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.tickets         add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.metric_values   add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.engagements     add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.asks            add column tenant_id uuid references public.tenants(id) on delete set null;
alter table public.projects        add column tenant_id uuid references public.tenants(id) on delete set null;

create index milestones_tenant_id_idx      on public.milestones      (tenant_id);
create index accomplishments_tenant_id_idx on public.accomplishments (tenant_id);
create index risks_tenant_id_idx           on public.risks           (tenant_id);
create index escalations_tenant_id_idx     on public.escalations     (tenant_id);
create index tickets_tenant_id_idx         on public.tickets         (tenant_id);
create index metric_values_tenant_id_idx   on public.metric_values   (tenant_id);
create index engagements_tenant_id_idx     on public.engagements     (tenant_id);
create index asks_tenant_id_idx            on public.asks            (tenant_id);
create index projects_tenant_id_idx        on public.projects        (tenant_id);

-- One-time backfill: every existing alias becomes an account-level
-- name_variant source. organizations.aliases is left in place (cheap,
-- reversible) but no new code reads or writes it after this migration.
insert into public.account_sources (org_id, source_type, value)
select o.id, 'name_variant', a
from public.organizations o, unnest(o.aliases) as a
where a is not null and a <> ''
on conflict (source_type, value) do nothing;

-- apply_proposal(): same six branches as 7.3, now also writing tenant_id
-- from the proposal payload when the caller resolved one. Everything else
-- byte-for-byte identical to the 7.3/7.4 version (create-or-replace, not a
-- rewrite) -- re-declared in full because PL/pgSQL has no partial-function
-- patch mechanism.
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
