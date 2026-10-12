-- 7.5-pre2 Session 6 — the discovery sweep.
--
-- Session 5's runner syncs one KNOWN account at a time, so a conversation
-- with a company nobody added to the Hub is invisible: nothing goes looking
-- for it, so nothing finds it. This adds a sweep that isn't tied to any
-- account — it lists what the connectors can see, skips anything already
-- attributable to a known account, and reports the rest with a best-guess
-- identifier. Those land on `ingest`'s existing unresolvable-account path
-- (held record + one account_resolution per identifier, Session 2), so the
-- "Account match needed" queue — including its *Create new account*
-- resolution — handles them with no change to ingest at all.
--
-- The sweep is modelled as just another sync unit, `record_type =
-- 'discovery'`, carried on sync_state with the internal Refold org id as
-- its slot. That is deliberate, not a hack: sync_state's primary key
-- includes org_id so it cannot be null, the internal org row already
-- exists, and it is already excluded from every per-account sync — so the
-- slot is free and the sweep inherits the existing lock, watermark
-- (advance-only-on-success) and run recording with no schema change.

alter table public.sync_settings
  -- Who counts as "us". An item is interesting to the sweep when someone
  -- OUTSIDE these domains is involved.
  add column internal_email_domains text[] not null default '{refold.ai}',
  -- Slack channels whose NAME marks them as being about a customer even
  -- when no outside company is in the channel (this workspace uses
  -- `internal-<customer>`, e.g. `internal-cloudinventory`). Matched
  -- case-insensitively as a substring.
  add column discovery_channel_patterns text[] not null default '{internal-}';

-- Queue a sweep for the background path. The UI's "Scan for unknown
-- accounts" button does NOT use this — it runs synchronously through the
-- scoped entry point, so it needs neither the queue nor the Vault secret.
-- This exists for the daily job and for queueing a sweep without the UI.
create or replace function public.enqueue_discovery(p_mode public.sync_run_mode default 'daily')
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

  insert into public.sync_queue (org_id, record_type, mode)
  values ('00000000-0000-0000-0000-000000000001', 'discovery', p_mode);
  return 1;
end;
$$;

-- enqueue_daily_sync() re-declared in full (create-or-replace, not a
-- rewrite) with one addition: the daily batch now also queues one discovery
-- sweep, so accounts nobody added still surface once a day. Everything else
-- is byte-for-byte the Session 5 body.
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

  -- One sweep per day, on top of (and not counted against) the per-account
  -- cap — it is a single unit and it is the only thing that can surface an
  -- account nobody has added yet.
  v_enqueued := v_enqueued + public.enqueue_discovery('daily');

  return v_enqueued;
end;
$$;

revoke all on function public.enqueue_discovery(public.sync_run_mode) from public, anon, authenticated;
grant execute on function public.enqueue_discovery(public.sync_run_mode) to service_role;
