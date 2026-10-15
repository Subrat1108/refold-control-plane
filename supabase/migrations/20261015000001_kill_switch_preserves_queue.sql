-- 7.5-pre2 — two faults the 138-run review exposed, both the same mistake in
-- different places: treating "cannot run right now" as "this unit failed".
--
--   1. Flipping the kill switch ON while units were queued wrote 30 rows as
--      `error: kill switch is on`, which takes them out of `queued`
--      permanently. Pausing the system destroyed a third of the backlog.
--   2. requeue_stale_sync_units() was called INSIDE dispatch_sync_queue(),
--      after its kill-switch early return -- so with the switch on, nothing
--      ever reclaims a unit stranded by a dead worker. One such row from the
--      01:30 nightly has been stuck at `processing` ever since, and could
--      not have been recovered while the system was paused. Cleaning up
--      after a death is not "doing work"; it must not be gated.

-- ── 1. the reaper runs on every tick, switch or no switch ─────────────────
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
  -- FIRST, before any gate. A unit stranded by a worker that died should be
  -- put back whether or not the system is currently paused -- otherwise
  -- pausing freezes the wreckage in place and the unit is lost for good.
  perform public.requeue_stale_sync_units();

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

-- ── 2. put back the units the kill switch destroyed ───────────────────────
-- These were never bad units: they were queued work that happened to be in
-- the queue when someone paused the system. Restoring them is the correct
-- reading of what the operator meant by "pause".
update public.sync_queue
set status = 'queued', error = null, finished_at = null, claimed_at = null
where status = 'error'
  and error = 'kill switch is on';
