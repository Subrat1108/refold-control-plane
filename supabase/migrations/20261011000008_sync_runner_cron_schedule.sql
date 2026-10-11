-- 7.5-pre2 Session 5 — the one pg_cron job. Ticks every 5 minutes, not at
-- the configured daily time directly — enqueue_daily_sync() itself decides
-- whether it's inside today's scheduled window (sync_settings.
-- daily_run_at_utc), so the admin screen can change that time with a plain
-- UPDATE and never touch a migration or re-register this schedule.
--
-- cron.schedule() is not idempotent by name across repeated `db reset`s —
-- unschedule first (no-ops if it doesn't exist yet) so this migration can
-- be re-applied (e.g. a fresh local reset) without erroring on a duplicate
-- job name.
select cron.unschedule('cs-sync-tick') where exists (select 1 from cron.job where jobname = 'cs-sync-tick');

select cron.schedule(
  'cs-sync-tick',
  '*/5 * * * *',
  $$ select public.enqueue_daily_sync(); select public.dispatch_sync_queue(); $$
);
