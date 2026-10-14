-- 7.5-pre2 Session 7 — discovery first, and a budget that stops dead accounts.
--
-- Four production runs cost 2.67M tokens and produced zero records: every
-- one of them was hunting for two fictional fixture accounts with no
-- account_sources, while the discovery sweep that would have found the REAL
-- accounts sat at the back of the queue and never ran once (17 per-account
-- runs, 0 discovery runs). Deleting the fixtures was explicitly rejected and
-- rightly so — the next mis-typed account would do the same thing. This
-- migration makes an unproductive account cheap instead of impossible:
--   1. the sweep is enqueued FIRST, so it always runs;
--   2. an account that found nothing last night is scanned on a small probe
--      budget rather than the full one;
--   3. thirty consecutive empty nights becomes a visible, reviewable flag.

-- ── 1. the probe budget ───────────────────────────────────────────────────
-- Deliberately small. An account with nothing to find should cost the price
-- of confirming that, not the price of an exhaustive search.
alter table public.sync_settings
  add column probe_token_budget int not null default 25000;

comment on column public.sync_settings.probe_token_budget is
  'Token ceiling for a per-account unit whose account found nothing on its last nightly cycle. The full max_tokens_per_unit applies again the moment it produces a record.';

-- ── 2. per-account scan health ────────────────────────────────────────────
-- A separate table rather than columns on `organizations` on purpose:
-- organizations carries the generic audit trigger, so counters living there
-- would write an audit row on every unit of every nightly run and bury the
-- real history.
create table public.account_sync_health (
  org_id                   uuid primary key references public.organizations(id) on delete cascade,
  consecutive_empty_nights int not null default 0,
  last_empty_date          date,
  last_found_at            timestamptz,
  -- Set when the risk proposal has been filed, so it is filed once and not
  -- re-filed every night after the threshold is passed.
  flagged_at               timestamptz,
  updated_at               timestamptz not null default now()
);

create index account_sync_health_empty_idx
  on public.account_sync_health (consecutive_empty_nights desc)
  where consecutive_empty_nights > 0;

alter table public.account_sync_health enable row level security;

create policy account_sync_health_select on public.account_sync_health
  for select to authenticated using (public.is_super_admin());
-- Same shape as sync_settings/sync_queue: no insert/update/delete policy for
-- `authenticated` at all. Only record_account_scan_result() writes it.

grant select on public.account_sync_health to authenticated, service_role;
grant insert, update, delete on public.account_sync_health to service_role;

-- ── 3. record one unit's outcome ──────────────────────────────────────────
-- Called at the end of EVERY per-account unit. The owner's rule is "one
-- nightly cycle = one session", so eight record types scanned on the same
-- night must count once, not eight times — hence last_empty_date rather
-- than a blind increment.
create or replace function public.record_account_scan_result(
  p_org_id uuid,
  p_found  boolean
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_found then
    -- Unconditional reset, so a night where an early unit came back empty
    -- and a later one found something ends at zero regardless of the order
    -- the units happened to run in.
    insert into public.account_sync_health (org_id, consecutive_empty_nights, last_found_at, last_empty_date, flagged_at, updated_at)
    values (p_org_id, 0, now(), null, null, now())
    on conflict (org_id) do update
      set consecutive_empty_nights = 0,
          last_found_at            = now(),
          last_empty_date          = null,
          flagged_at               = null,
          updated_at               = now();
    return 0;
  end if;

  insert into public.account_sync_health (org_id, consecutive_empty_nights, last_empty_date, updated_at)
  values (p_org_id, 1, current_date, now())
  on conflict (org_id) do update
    set consecutive_empty_nights = case
          when public.account_sync_health.last_empty_date is distinct from current_date
            then public.account_sync_health.consecutive_empty_nights + 1
          else public.account_sync_health.consecutive_empty_nights
        end,
        last_empty_date = current_date,
        updated_at      = now()
  returning consecutive_empty_nights into v_count;

  return v_count;
end;
$$;

-- Stamp the flag once the risk proposal has actually been filed. Separate
-- from the counter so a failure to file does not silently mark it done.
create or replace function public.mark_account_sync_flagged(p_org_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.account_sync_health set flagged_at = now(), updated_at = now()
  where org_id = p_org_id and flagged_at is null;
$$;

-- D-121: this project's default privileges grant EXECUTE directly to anon
-- and authenticated, so revoking from `public` alone leaves both holding it.
revoke all on function public.record_account_scan_result(uuid, boolean) from public, anon, authenticated;
revoke all on function public.mark_account_sync_flagged(uuid)            from public, anon, authenticated;
grant execute on function public.record_account_scan_result(uuid, boolean) to service_role;
grant execute on function public.mark_account_sync_flagged(uuid)           to service_role;

-- ── 4. queue one account's units on demand ────────────────────────────────
-- Used right after an account_resolution is resolved to a real org: the
-- sweep's own held records arrive with the resolution, and this gets the
-- full per-account pass to follow without waiting for the next night.
create or replace function public.enqueue_account(
  p_org_id      uuid,
  p_mode        public.sync_run_mode default 'daily',
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
  v_record_types text[] := array['milestone', 'accomplishment', 'risk', 'escalation', 'ticket', 'action_item', 'engagement', 'health'];
  v_rt text;
begin
  select * into v_settings from public.sync_settings limit 1;
  if v_settings.kill_switch then
    return 0;
  end if;

  if not exists (select 1 from public.organizations where id = p_org_id and status = 'active') then
    return 0;
  end if;

  foreach v_rt in array v_record_types loop
    if not exists (
      select 1 from public.sync_queue q
      where q.org_id = p_org_id and q.record_type = v_rt and q.status in ('queued', 'processing')
    ) then
      -- 50: ahead of routine nightly work. A human just confirmed this
      -- account is real; that is the most valuable thing in the queue.
      insert into public.sync_queue (org_id, record_type, mode, window_days, priority)
      values (p_org_id, v_rt, p_mode, p_window_days, 50);
      v_enqueued := v_enqueued + 1;
    end if;
  end loop;

  return v_enqueued;
end;
$$;

revoke all on function public.enqueue_account(uuid, public.sync_run_mode, int) from public, anon, authenticated;
grant execute on function public.enqueue_account(uuid, public.sync_run_mode, int) to service_role;

-- ── 5. a queue order that actually orders ─────────────────────────────────
-- Reordering the INSERTs alone would have been cosmetic. `enqueued_at`
-- defaults to now(), which is transaction-stable, so one enqueue_all_units
-- call stamps all 17 rows with the SAME timestamp -- and claim_sync_queue_item
-- ordered by `enqueued_at` with no tiebreak. The claim order was therefore
-- whatever the heap happened to return. That, not just the append position,
-- is why the sweep never ran. An explicit priority makes the intent real.
alter table public.sync_queue
  add column priority int not null default 100;

comment on column public.sync_queue.priority is
  'Claim order, lowest first: 0 = discovery sweep, 50 = an account just confirmed by a human, 100 = routine nightly work, 150+ = accounts that have been finding nothing.';

create index sync_queue_claim_idx on public.sync_queue (priority, enqueued_at, id) where status = 'queued';

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
    -- id as the final tiebreak so the order is total and reproducible,
    -- never heap order.
    order by priority, enqueued_at, id
    limit 1
    for update skip locked
  )
  returning * into v_row;

  return v_row; -- all fields null if nothing was queued
end;
$$;

-- The sweep claims priority 0 wherever it is enqueued from.
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

  insert into public.sync_queue (org_id, record_type, mode, window_days, priority)
  values ('00000000-0000-0000-0000-000000000001', 'discovery', p_mode, p_window_days, 0);
  return 1;
end;
$$;

-- ── 6. the sweep goes FIRST ───────────────────────────────────────────────
-- Unchanged signature, so `create or replace` genuinely replaces rather than
-- creating an overload (D-130). The only change is order: discovery is
-- enqueued before the per-account loop and draws from the same remaining
-- budget, so it can no longer be starved by the accounts it exists to find.
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
  v_discovery int;
begin
  select * into v_settings from public.sync_settings limit 1;
  if v_settings.kill_switch then
    return 0;
  end if;

  v_remaining := coalesce(p_max_units, v_settings.max_units_per_day);

  -- FIRST, not last. Finding the accounts that exist is what makes the
  -- per-account work below worth doing; queued behind 16 units at 60-90s
  -- each it simply never ran.
  v_discovery := public.enqueue_discovery(p_mode, p_window_days);
  v_enqueued := v_enqueued + v_discovery;
  v_remaining := v_remaining - v_discovery;

  for v_rec in
    select o.id as org_id, rt as record_type,
           -- Barren accounts sink below the productive ones, so when the
           -- day's unit budget runs out it is the ones finding nothing that
           -- get dropped, never the live ones.
           100 + least(coalesce(ah.consecutive_empty_nights, 0), 50) as priority
    from public.organizations o
    cross join unnest(v_record_types) as rt
    left join public.sync_state ss on ss.org_id = o.id and ss.record_type = rt
    left join public.account_sync_health ah on ah.org_id = o.id
    where o.status = 'active'
      and o.id <> '00000000-0000-0000-0000-000000000001' -- the internal Refold org is not a CS account
      and (ss.locked_until is null or ss.locked_until < now())
      and not exists (
        select 1 from public.sync_queue q
        where q.org_id = o.id and q.record_type = rt and q.status in ('queued', 'processing')
      )
    -- Accounts that are actually producing go first, so if the day's unit
    -- budget runs out it is the barren ones that get dropped, not the live
    -- ones. Ties broken by name to keep the order stable and predictable.
    order by coalesce(ah.consecutive_empty_nights, 0) asc, o.name, rt
  loop
    exit when v_remaining <= 0;
    insert into public.sync_queue (org_id, record_type, mode, window_days, priority)
    values (v_rec.org_id, v_rec.record_type, p_mode, p_window_days, v_rec.priority);
    v_enqueued := v_enqueued + 1;
    v_remaining := v_remaining - 1;
  end loop;

  return v_enqueued;
end;
$$;
