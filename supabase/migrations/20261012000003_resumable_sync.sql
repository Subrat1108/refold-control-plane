-- 7.5-pre2 Session 6 follow-up — make a long sync resumable, and let a
-- human run the full nightly job on demand.
--
-- Two problems this fixes:
--
-- 1. A run that stopped EARLY (hit its time budget or its item budget)
--    still reported `success`, and success is what moves the watermark to
--    now() — so everything it never got to was silently skipped forever.
--    That is quiet data loss, and it bites hardest exactly where it is
--    least noticed: a cold first scan, a backfill, a busy week.
--    Now a truncated run reports `partial` and passes how far it actually
--    got (`p_covered_through`), so the watermark advances to THAT point
--    and the next run continues from there instead of either losing the
--    gap or re-reading the same window forever.
--
-- 2. The manual trigger only ran the discovery sweep, while the nightly
--    job also refreshes every known account. With no accounts that looked
--    equivalent; the moment real accounts exist the button would quietly
--    do half the job. `enqueue_all_units` is now the single definition of
--    "a full sync", used by both the nightly job and the new on-demand
--    action.

-- finish_sync_unit gains an explicit "I covered up to here" timestamp.
-- NOTE: `create or replace` with a CHANGED signature creates an OVERLOAD,
-- it does not replace — leaving two versions where a 4-argument call is
-- ambiguous and could silently bind to the stale one. Drop the old one
-- first. (Caught by rls_test, which still calls it with four arguments.)
drop function if exists public.finish_sync_unit(uuid, text, text, text);

-- Advance rules:
--   success + covered_through  -> advance to covered_through
--   success, no covered_through -> advance to now() (a complete run)
--   partial + covered_through  -> advance to covered_through (resumable)
--   partial, no covered_through -> hold (re-cover the window next time;
--                                  re-reading is safe, losing is not)
--   failed                     -> always hold
create or replace function public.finish_sync_unit(
  p_org_id uuid,
  p_record_type text,
  p_status text,
  p_error text default null,
  p_covered_through timestamptz default null
)
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
      last_synced_at = case
        when p_status = 'success' then coalesce(p_covered_through, now())
        when p_status = 'partial' then coalesce(p_covered_through, last_synced_at)
        else last_synced_at
      end
  where org_id = p_org_id and record_type = p_record_type;
end;
$$;

-- The single definition of "a full sync": every active account across every
-- record type, plus one discovery sweep for companies nobody has added.
-- Shared by the nightly job and the on-demand button so the two can never
-- drift into doing different things.
create or replace function public.enqueue_all_units(p_mode public.sync_run_mode default 'daily', p_max_units int default null)
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
      -- don't double-queue work that is already waiting
      and not exists (
        select 1 from public.sync_queue q
        where q.org_id = o.id and q.record_type = rt and q.status in ('queued', 'processing')
      )
    order by o.name, rt
  loop
    exit when v_remaining <= 0;
    insert into public.sync_queue (org_id, record_type, mode) values (v_rec.org_id, v_rec.record_type, p_mode);
    v_enqueued := v_enqueued + 1;
    v_remaining := v_remaining - 1;
  end loop;

  -- The sweep is the only thing that can surface an account nobody added,
  -- so it is queued on top of (not counted against) the per-account cap.
  v_enqueued := v_enqueued + public.enqueue_discovery(p_mode);

  return v_enqueued;
end;
$$;

-- The nightly job is now just "is it time? then run a full sync".
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
    return 0; -- outside today's scheduled window
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

revoke all on function public.enqueue_all_units(public.sync_run_mode, int) from public, anon, authenticated;
revoke all on function public.finish_sync_unit(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_all_units(public.sync_run_mode, int) to service_role;
grant execute on function public.finish_sync_unit(uuid, text, text, text, timestamptz) to service_role;
