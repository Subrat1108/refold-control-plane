-- 7.5-pre2 Session 5 — lock/watermark/queue functions for the sync runner.
-- All six are machine-only (called by the cs-sync-runner Edge Function's
-- service-role client, or by pg_cron itself) — EXECUTE is revoked from
-- public/anon/authenticated on every one, unlike apply_proposal() which
-- humans call via the UI. Revoking from `public` alone is NOT enough on
-- this project: a default-privilege rule grants EXECUTE directly to
-- `anon`/`authenticated` on every new function (confirmed by direct
-- inspection — information_schema.routine_privileges), a separate grant
-- from the `public` pseudo-role one, so `revoke ... from public` alone
-- leaves those two untouched. Every REVOKE below names all three.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Atomic lock acquire: the one thing that makes "Refresh and the daily job
-- can't double-process the same unit" true. sync_state's own
-- (org_id, record_type) PK + locked_until (7.1) already has everything this
-- needs — no new lock table.
create or replace function public.try_lock_sync_unit(p_org_id uuid, p_record_type text, p_lock_minutes int default 15)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
begin
  insert into public.sync_state (org_id, record_type, locked_until)
  values (p_org_id, p_record_type, now() + (p_lock_minutes || ' minutes')::interval)
  on conflict (org_id, record_type) do update
    set locked_until = now() + (p_lock_minutes || ' minutes')::interval
    where sync_state.locked_until is null or sync_state.locked_until < now()
  returning true into v_locked;

  return coalesce(v_locked, false);
end;
$$;

-- Releases the lock and advances the watermark — but ONLY on success
-- (requirement 6: "advance last_synced_at ONLY on success; record errors").
create or replace function public.finish_sync_unit(p_org_id uuid, p_record_type text, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sync_state
  set locked_until   = null,
      last_status    = p_status,
      last_error     = p_error,
      last_synced_at = case when p_status = 'success' then now() else last_synced_at end
  where org_id = p_org_id and record_type = p_record_type;
end;
$$;

-- Standard Postgres queue-claim pattern (SKIP LOCKED): one row, atomically,
-- for exactly one caller even under concurrent dispatch.
create or replace function public.claim_sync_queue_item()
returns public.sync_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sync_queue;
begin
  update public.sync_queue
  set status = 'processing', claimed_at = now()
  where id = (
    select id from public.sync_queue
    where status = 'queued'
    order by enqueued_at
    limit 1
    for update skip locked
  )
  returning * into v_row;

  return v_row; -- all fields null if nothing was queued
end;
$$;

-- Called every 5 minutes by the pg_cron tick (see the next migration).
-- Fires at most once per day, inside the admin-configured 5-minute window —
-- comparing against sync_settings.daily_run_at_utc directly (a `time`, not
-- a cron expression) keeps the schedule admin-editable via one UPDATE,
-- with no migration or cron.schedule() re-registration ever needed.
create or replace function public.enqueue_daily_sync()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.sync_settings;
  v_already_run boolean;
  v_enqueued int := 0;
  v_remaining int;
  -- 'metric' is deliberately excluded — reference/tool-map.md confirms no
  -- deterministic source exists at all yet (no Refold workflow published),
  -- not a connector gap. Enqueuing it daily would guarantee a no-op run.
  v_record_types text[] := array['milestone', 'accomplishment', 'risk', 'escalation', 'ticket', 'action_item', 'engagement', 'health'];
  v_rec record;
begin
  select * into v_settings from public.sync_settings limit 1;
  if v_settings.kill_switch then
    return 0;
  end if;

  if now()::time < v_settings.daily_run_at_utc or now()::time >= v_settings.daily_run_at_utc + interval '5 minutes' then
    return 0; -- outside today's scheduled window
  end if;

  select exists (
    select 1 from public.sync_queue
    where mode = 'daily' and enqueued_at >= date_trunc('day', now())
  ) into v_already_run;
  if v_already_run then
    return 0;
  end if;

  v_remaining := v_settings.max_units_per_day;

  for v_rec in
    select o.id as org_id, rt as record_type
    from public.organizations o
    cross join unnest(v_record_types) as rt
    left join public.sync_state ss on ss.org_id = o.id and ss.record_type = rt
    where o.status = 'active'
      and o.id <> '00000000-0000-0000-0000-000000000001' -- the internal Refold org is not a CS account
      and (ss.locked_until is null or ss.locked_until < now())
    order by o.name, rt
  loop
    exit when v_remaining <= 0;
    insert into public.sync_queue (org_id, record_type, mode) values (v_rec.org_id, v_rec.record_type, 'daily');
    v_enqueued := v_enqueued + 1;
    v_remaining := v_remaining - 1;
  end loop;

  return v_enqueued;
end;
$$;

-- Admin-triggered (via a new provisioning action) — a chosen set of
-- accounts, or every account when p_org_ids is null/empty. No max_units_per_day
-- cap here (an explicit backfill request is deliberate, not automatic); the
-- per-unit lock at processing time is still the real safety net against
-- double-processing something already running.
create or replace function public.enqueue_backfill(p_org_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enqueued int := 0;
  v_record_types text[] := array['milestone', 'accomplishment', 'risk', 'escalation', 'ticket', 'action_item', 'engagement', 'health'];
  v_rec record;
begin
  for v_rec in
    select o.id as org_id, rt as record_type
    from public.organizations o
    cross join unnest(v_record_types) as rt
    where o.id <> '00000000-0000-0000-0000-000000000001'
      and (p_org_ids is null or array_length(p_org_ids, 1) is null or o.id = any(p_org_ids))
    order by o.name, rt
  loop
    insert into public.sync_queue (org_id, record_type, mode) values (v_rec.org_id, v_rec.record_type, 'backfill');
    v_enqueued := v_enqueued + 1;
  end loop;

  return v_enqueued;
end;
$$;

-- Called every 5 minutes by the same pg_cron tick. Claims up to
-- max_units_per_run queued rows and fires one async net.http_post per row
-- at the cs-sync-runner function — fire-and-forget; the Edge Function
-- itself updates sync_queue/sync_runs on completion, not this function.
-- The project URL is hardcoded deliberately — this is a single-environment
-- project (D-066), there is no second Supabase project to parameterize for.
create or replace function public.dispatch_sync_queue()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.sync_settings;
  v_secret text;
  v_item public.sync_queue;
  v_dispatched int := 0;
  v_i int;
begin
  select * into v_settings from public.sync_settings limit 1;
  if v_settings.kill_switch then
    return 0;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cs_sync_runner_auth' limit 1;
  if v_secret is null then
    return 0; -- Vault secret not provisioned yet — nothing to authenticate the dispatch with
  end if;

  for v_i in 1..v_settings.max_units_per_run loop
    v_item := public.claim_sync_queue_item();
    exit when v_item.id is null;

    perform net.http_post(
      url     := 'https://xwtxrdxktbogswxuuetp.supabase.co/functions/v1/cs-sync-runner',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      body    := jsonb_build_object('queue_id', v_item.id)
    );
    v_dispatched := v_dispatched + 1;
  end loop;

  return v_dispatched;
end;
$$;

-- Lets the runner's sync-context builder read `allowed_values` straight
-- from the real Postgres enums instead of a hand-copied list in TypeScript
-- (reference/tool-map.md's own enum lists are documentation, not the
-- source of truth) — so a future enum change can't silently drift out of
-- what the model is told is valid.
create or replace function public.get_enum_values(p_type_name text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_agg(enumlabel::text order by enumsortorder)
  from pg_enum
  where enumtypid = (p_type_name::regtype)::oid;
$$;

revoke all on function public.get_enum_values(text) from public, anon, authenticated;
grant execute on function public.get_enum_values(text) to service_role;

revoke all on function public.try_lock_sync_unit(uuid, text, int) from public, anon, authenticated;
revoke all on function public.finish_sync_unit(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_sync_queue_item() from public, anon, authenticated;
revoke all on function public.enqueue_daily_sync() from public, anon, authenticated;
revoke all on function public.enqueue_backfill(uuid[]) from public, anon, authenticated;
revoke all on function public.dispatch_sync_queue() from public, anon, authenticated;

grant execute on function public.try_lock_sync_unit(uuid, text, int) to service_role;
grant execute on function public.finish_sync_unit(uuid, text, text, text) to service_role;
grant execute on function public.claim_sync_queue_item() to service_role;
grant execute on function public.enqueue_daily_sync() to service_role;
grant execute on function public.enqueue_backfill(uuid[]) to service_role;
grant execute on function public.dispatch_sync_queue() to service_role;
