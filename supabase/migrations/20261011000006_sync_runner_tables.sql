-- 7.5-pre2 Session 5 — the sync runner's own tables.
--
-- sync_runs/sync_state already exist (7.1) but nothing has ever written to
-- sync_state (per-unit watermark + lock) or driven sync_runs from the
-- caller side — `ingest` only creates/updates a sync_runs row when it
-- receives a run. This session is the first real consumer of both; no
-- schema change needed to sync_state itself (its (org_id, record_type) PK +
-- last_synced_at/last_status/last_error/locked_until already match the
-- runner's locking/watermark needs exactly).

alter table public.sync_runs
  add column tokens_used integer,
  add column skipped_connectors jsonb;

-- Singleton config row (admin-editable kill switch, cron time, caps) — the
-- standard Postgres singleton-table trick: a boolean PK that can only ever
-- be `true`, so a second row is physically impossible, not just convention.
create table public.sync_settings (
  singleton            boolean primary key default true,
  kill_switch          boolean not null default false,
  daily_run_at_utc     time not null default '01:30:00', -- 07:00 IST; compared against the 5-minute pg_cron tick, not parsed as a cron expression
  max_units_per_run    int not null default 5,
  max_units_per_day    int not null default 50,
  max_tokens_per_unit  int not null default 150000,
  updated_by           uuid references public.profiles(id) on delete set null,
  updated_at           timestamptz not null default now(),
  constraint sync_settings_singleton check (singleton)
);

insert into public.sync_settings (singleton) values (true);

alter table public.sync_settings enable row level security;

create policy sync_settings_select on public.sync_settings
  for select to authenticated using (public.is_super_admin());
-- No insert/update/delete policy for `authenticated` at all — the one row
-- is written only via the provisioning Edge Function's update_sync_settings
-- action (service role), same shape as ingest_tokens (D-09x).

grant select on public.sync_settings to authenticated, service_role;
grant update on public.sync_settings to service_role; -- no insert/delete — exactly one row, seeded above, never re-created or removed

-- Daily/backfill fan-out queue (requirement 8) — a scoped Refresh never
-- touches this table; it runs synchronously in the Edge Function instead.
create table public.sync_queue (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  record_type text not null,
  mode        public.sync_run_mode not null,
  run_id      uuid references public.sync_runs(id) on delete set null,
  status      text not null default 'queued' check (status in ('queued', 'processing', 'done', 'error')),
  enqueued_at timestamptz not null default now(),
  claimed_at  timestamptz,
  finished_at timestamptz,
  error       text
);

create index sync_queue_status_idx on public.sync_queue (status, enqueued_at);
create index sync_queue_org_id_idx on public.sync_queue (org_id);

alter table public.sync_queue enable row level security;

create policy sync_queue_select on public.sync_queue
  for select to authenticated using (public.is_super_admin());
-- Same shape as sync_settings — written only by the SECURITY DEFINER
-- functions below (service_role), never directly by a client.

grant select on public.sync_queue to authenticated, service_role;
grant insert, update on public.sync_queue to service_role;
