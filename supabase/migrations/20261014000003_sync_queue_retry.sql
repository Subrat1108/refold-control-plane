-- 7.5-pre2 — what happens to the queue when nobody is watching.
--
-- Two ways a unit could silently drop out of the queue for good, both found
-- while answering "if the screen gets locked, does the sync stop?":
--
--   1. A unit interrupted mid-flight holds its sync_state lock for 15
--      minutes. Re-running inside that window returned `locked`, and the
--      caller wrote the row as `error` -- which takes it out of `queued`
--      permanently. A recoverable pause became a lost unit, and the only
--      hint was an "already running" message.
--   2. claim_sync_queue_item() marks a row `processing`, and nothing ever
--      resets one. If the Edge Function is killed at its ~150s wall after
--      claiming, that row is stranded forever. Latent today (the browser
--      drain never sets `processing`) but live the moment the pg_cron
--      dispatcher is switched on, which is exactly when nobody is watching.

-- ── 1. a lock is a "come back later", not a failure ───────────────────────
alter table public.sync_queue
  add column retry_after timestamptz;

comment on column public.sync_queue.retry_after is
  'Set when a unit could not run yet (its sync_state lock was still held). The row stays queued and is simply passed over until this time, instead of being marked error and never retried.';

create index sync_queue_retry_idx on public.sync_queue (retry_after) where status = 'queued';

-- Both claim paths must skip a row that is waiting, or the drain loop picks
-- the same locked unit forever.
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
      and (retry_after is null or retry_after <= now())
    order by priority, enqueued_at, id
    limit 1
    for update skip locked
  )
  returning * into v_row;

  return v_row; -- all fields null if nothing was queued
end;
$$;

-- ── 2. reclaim units stranded mid-flight ──────────────────────────────────
-- A unit claimed but never finished is not evidence of a bad unit -- it is
-- evidence the worker died. Put it back, so the next tick retries it.
-- The default (20 minutes) sits above both the Edge Function wall (~150s)
-- and the 15-minute sync_state lock TTL, so this can never race a run that
-- is genuinely still going.
create or replace function public.requeue_stale_sync_units(p_minutes int default 20)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.sync_queue
  set status = 'queued', claimed_at = null, retry_after = null
  where status = 'processing'
    and claimed_at is not null
    and claimed_at < now() - (p_minutes || ' minutes')::interval;
  get diagnostics v_count = row_count;

  -- A sync_runs row left at 'running' by the same death is a lie on the
  -- Sync Status screen -- it will never finish. Close it honestly.
  update public.sync_runs
  set status = 'failed', finished_at = now()
  where status = 'running'
    and started_at < now() - (p_minutes || ' minutes')::interval;

  return v_count;
end;
$$;

revoke all on function public.requeue_stale_sync_units(int) from public, anon, authenticated;
grant execute on function public.requeue_stale_sync_units(int) to service_role;

-- ── 3. the dispatcher reclaims before it claims ───────────────────────────
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

  -- Before claiming anything new, put back whatever a dead worker left
  -- behind. Without this the queue quietly shrinks every time a run is
  -- killed, and the units that vanish are never reported anywhere.
  perform public.requeue_stale_sync_units();

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
