-- One sync button, one day range.
--
-- Two changes, both from the same piece of feedback: there is no reason for
-- a separate "scan for unknown accounts" trigger, because a full sync
-- already includes the sweep — and the day range you pick should apply to
-- the WHOLE run, not just the sweep half.
--
-- Previously only the sweep could take a window, because it ran
-- synchronously and the number went straight into the request. Everything
-- else went through the queue, and a queued row had nowhere to put it — so
-- per-account units always fell back to their default lookback. Carrying
-- `window_days` on the queue row fixes that: whatever you type applies to
-- every unit the run queues.

alter table public.sync_queue add column window_days int;

-- enqueue_discovery gains the window so the sweep queued as part of a full
-- sync honours the same range as everything else.
create or replace function public.enqueue_discovery(p_mode public.sync_run_mode default 'daily', p_window_days int default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.sync_settings;
  v_locked boolean;
begin
  select * into v_settings from public.sync_settings limit 1;
  if v_settings.kill_switch then
    return 0;
  end if;

  -- Don't pile up sweeps behind one that's already running or queued.
  select exists (
    select 1 from public.sync_state
    where org_id = '00000000-0000-0000-0000-000000000001'
      and record_type = 'discovery'
      and locked_until is not null and locked_until > now()
  ) into v_locked;
  if v_locked then
    return 0;
  end if;

  if exists (
    select 1 from public.sync_queue
    where record_type = 'discovery' and status in ('queued', 'processing')
  ) then
    return 0;
  end if;

  insert into public.sync_queue (org_id, record_type, mode, window_days)
  values ('00000000-0000-0000-0000-000000000001', 'discovery', p_mode, p_window_days);
  return 1;
end;
$$;

-- enqueue_all_units passes the window down to every unit it queues,
-- per-account ones included.
create or replace function public.enqueue_all_units(
  p_mode public.sync_run_mode default 'daily',
  p_max_units int default null,
  p_window_days int default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.sync_settings;
  v_enqueued int := 0;
  v_remaining int;
  -- 'metric' stays out: no deterministic source exists yet (no Refold
  -- workflow published), so enqueuing it guarantees a no-op run.
  v_record_types text[] := array['milestone', 'accomplishment', 'risk', 'escalation', 'ticket', 'action_item', 'engagement', 'health'];
  v_rec record;
begin
  select * into v_settings from public.sync_settings limit 1;
  if v_settings.kill_switch then
    return 0;
  end if;

  v_remaining := coalesce(p_max_units, v_settings.max_units_per_day);

  for v_rec in
    select o.id as org_id, rt as record_type
    from public.organizations o
    cross join unnest(v_record_types) as rt
    left join public.sync_state ss on ss.org_id = o.id and ss.record_type = rt
    where o.status = 'active'
      and o.id <> '00000000-0000-0000-0000-000000000001' -- the internal Refold org is not a CS account
      and (ss.locked_until is null or ss.locked_until < now())
      and not exists (
        select 1 from public.sync_queue q
        where q.org_id = o.id and q.record_type = rt and q.status in ('queued', 'processing')
      )
    order by o.name, rt
  loop
    exit when v_remaining <= 0;
    insert into public.sync_queue (org_id, record_type, mode, window_days)
    values (v_rec.org_id, v_rec.record_type, p_mode, p_window_days);
    v_enqueued := v_enqueued + 1;
    v_remaining := v_remaining - 1;
  end loop;

  v_enqueued := v_enqueued + public.enqueue_discovery(p_mode, p_window_days);

  return v_enqueued;
end;
$$;

-- The nightly job keeps using watermarks (no explicit window) — it runs
-- every night, so "since we last looked" is exactly right there.
create or replace function public.enqueue_daily_sync()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.sync_settings;
  v_already_run boolean;
begin
  select * into v_settings from public.sync_settings limit 1;
  if v_settings.kill_switch then
    return 0;
  end if;

  if now()::time < v_settings.daily_run_at_utc or now()::time >= v_settings.daily_run_at_utc + interval '5 minutes' then
    return 0;
  end if;

  select exists (
    select 1 from public.sync_queue
    where mode = 'daily' and enqueued_at >= date_trunc('day', now())
  ) into v_already_run;
  if v_already_run then
    return 0;
  end if;

  return public.enqueue_all_units('daily');
end;
$$;

-- Drop the stale 2-arg overloads so a shorter call can't bind to them
-- (a `create or replace` with a changed signature ADDS a version).
drop function if exists public.enqueue_all_units(public.sync_run_mode, int);
drop function if exists public.enqueue_discovery(public.sync_run_mode);

revoke all on function public.enqueue_all_units(public.sync_run_mode, int, int) from public, anon, authenticated;
revoke all on function public.enqueue_discovery(public.sync_run_mode, int) from public, anon, authenticated;
grant execute on function public.enqueue_all_units(public.sync_run_mode, int, int) to service_role;
grant execute on function public.enqueue_discovery(public.sync_run_mode, int) to service_role;
