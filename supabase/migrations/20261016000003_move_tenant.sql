-- Stage 2b — a tenant can be moved to a different account.
--
-- Until now a tenant's parent was fixed at creation. That is untenable in
-- practice: the account it belongs to is often a judgement made while
-- clearing an approvals backlog, and judgements get revised (Kantata split
-- into Engg and PS after its tenants already existed).
--
-- Moving one is NOT a single-column update. Twelve tables carry tenant_id
-- alongside org_id, so changing only the tenant's parent would leave every
-- record of that tenant pointing at an account it no longer belongs to —
-- silently, with no error, and visible only as a record appearing under the
-- wrong customer. Doing it in one SECURITY DEFINER function keeps the two
-- halves atomic; doing it from the client could not.
create or replace function public.move_tenant(p_tenant_id uuid, p_new_org_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_org uuid;
  v_name    text;
  v_moved   int := 0;
  v_rows    int;
begin
  if not public.is_super_admin() or not public.is_aal2() then
    raise exception 'super_admin with AAL2 is required to move a tenant';
  end if;

  select org_id, name into v_old_org, v_name from public.tenants where id = p_tenant_id;
  if v_old_org is null then
    raise exception 'tenant % not found', p_tenant_id;
  end if;
  if not exists (select 1 from public.organizations where id = p_new_org_id) then
    raise exception 'target account % not found', p_new_org_id;
  end if;
  if v_old_org = p_new_org_id then
    return 0; -- already there
  end if;

  -- tenants is unique (org_id, name); say so plainly rather than letting the
  -- constraint surface as a raw 23505 the UI cannot explain.
  if exists (select 1 from public.tenants where org_id = p_new_org_id and name = v_name) then
    raise exception 'that account already has a tenant called "%" — rename one of them first', v_name;
  end if;

  update public.tenants set org_id = p_new_org_id where id = p_tenant_id;

  -- Re-point every record of this tenant. One explicit statement per table,
  -- matching apply_proposal()'s fixed allow-list style: a dynamic loop over
  -- information_schema would silently pick up any future table, which is
  -- exactly the kind of implicit behaviour this codebase avoids.
  update public.milestones      set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.accomplishments set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.risks           set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.escalations     set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.tickets         set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.engagements     set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.action_items    set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.metric_values   set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.asks            set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.projects        set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  -- The identifiers that resolve TO this tenant move with it, or the next
  -- sync would attribute its traffic back to the old account.
  update public.account_sources set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;
  update public.sync_learnings  set org_id = p_new_org_id where tenant_id = p_tenant_id; get diagnostics v_rows = row_count; v_moved := v_moved + v_rows;

  return v_moved;
end;
$$;

-- D-121: default privileges grant EXECUTE directly to anon/authenticated
-- here, so revoking from `public` alone would leave both holding it. The
-- function gates on is_super_admin()+is_aal2() internally and is called by
-- a signed-in admin, so authenticated keeps EXECUTE deliberately.
revoke all on function public.move_tenant(uuid, uuid) from public, anon;
grant execute on function public.move_tenant(uuid, uuid) to authenticated, service_role;
