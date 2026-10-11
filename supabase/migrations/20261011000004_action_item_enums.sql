-- 7.5-pre2 Session 4 — new enum values for the `action_item` record type
-- (build-spec-v3 extension; see docs/decisions.md and the devlog entry).
-- Split into its own migration: Postgres forbids using a brand-new enum
-- value in the same transaction that added it (the Session 2 lesson —
-- D-104), and the next migration's apply_proposal() branch casts to both
-- of these.
--
-- action_item_status gains 'in_progress'/'blocked' ADDITIVELY — the
-- existing 'open'/'done' are NOT renamed or touched; PeoplePage.tsx and
-- useStandups.ts already depend on those literal lowercase strings in
-- shipped standups code. New values follow the same lowercase convention.

alter type public.action_item_status add value 'in_progress';
alter type public.action_item_status add value 'blocked';

-- action_item_priority — lowercase, matching every other enum in this
-- schema (ticket_priority, etc.). The real-world data this models uses
-- "P0"/"High"/"Medium"/"Low" casing; the skill normalizes that before
-- sending, exactly like it already does for ticket.priority today.
create type public.action_item_priority as enum ('p0', 'high', 'medium', 'low');
