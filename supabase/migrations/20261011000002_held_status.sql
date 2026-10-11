-- 7.5-pre2 Session 2 — split from 20261011000003 into its own migration.
-- Postgres forbids using a brand-new enum value in the same transaction
-- that added it (comparing/indexing it needs the catalog change committed
-- first) — the partial index on status = 'held' in the next migration
-- would otherwise fail with "unsafe use of new value" (SQLSTATE 55P04).

alter type public.proposal_status add value 'held';
