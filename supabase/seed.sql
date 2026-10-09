-- Phase 6.1 — LOCAL demo fixtures (build-spec-v2 § 12)
-- Runs on `supabase db reset` for local dev ONLY (never shipped to prod). Gives
-- later blocks a couple of orgs + users to render. Passwords are demo-only.
--
-- Note: we insert auth.users + a matching auth.identities row directly (a
-- standard local-seed shortcut) so the demo logins work and the profiles FK is
-- satisfied. This runs only on a FRESH db init or `supabase db reset` — a plain
-- `supabase start` on an existing volume does NOT re-run it, so after pulling
-- seed changes you must `supabase db reset` for the new logins to exist.

create extension if not exists pgcrypto with schema extensions;

-- ── demo organizations ───────────────────────────────────────────────────────
-- external_ref doubles as the metrics-provider key. Until 6.5 wires live
-- metrics, it holds the MOCK org id so the 5.x pages render for these users
-- against the mock data provider (D-027/D-033).
insert into public.organizations (id, name, deployment_type, plan, status, external_ref) values
  ('00000000-0000-0000-0000-000000000002', 'Prism Analytics',       'cloud',       'growth',                 'active', 'org_cloud_001'),
  ('00000000-0000-0000-0000-000000000003', 'Meridian Laboratories', 'on_premise',  'self_hosted_enterprise', 'active', 'org_onprem_001')
on conflict (id) do nothing;

-- ── demo auth users ──────────────────────────────────────────────────────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001001', 'authenticated', 'authenticated',
   'super@refold.internal',   extensions.crypt('demo-super-2026',   extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001002', 'authenticated', 'authenticated',
   'owner@prismanalytics.io', extensions.crypt('demo-owner-2026',   extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001003', 'authenticated', 'authenticated',
   'owner@meridian-labs.jp',  extensions.crypt('demo-owner-2026',   extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001004', 'authenticated', 'authenticated',
   'analyst@prismanalytics.io', extensions.crypt('demo-analyst-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
on conflict (id) do nothing;

-- ── matching identities ──────────────────────────────────────────────────────
-- GoTrue-created users always have an auth.identities row; we add one per demo
-- user so the seed matches real structure and stays correct across GoTrue
-- versions (some flows/versions expect it). provider_id = user id for email.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001001',
   '{"sub":"00000000-0000-0000-0000-000000001001","email":"super@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000001002',
   '{"sub":"00000000-0000-0000-0000-000000001002","email":"owner@prismanalytics.io","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000001003',
   '{"sub":"00000000-0000-0000-0000-000000001003","email":"owner@meridian-labs.jp","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000001004',
   '{"sub":"00000000-0000-0000-0000-000000001004","email":"analyst@prismanalytics.io","email_verified":true,"phone_verified":false}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- ── demo org-defined sub-role (Prism only) — exercises the D-032 org_id scoping ─
insert into public.sub_roles (id, account_type, org_id, name, permissions, is_system) values
  ('00000000-0000-0000-0000-000000000210', 'cloud_customer',
   '00000000-0000-0000-0000-000000000002', 'Prism Finance', '{"read": true, "export": true}', false)
on conflict (id) do nothing;

-- ── demo profiles ────────────────────────────────────────────────────────────
-- super-admin (internal org)
insert into public.profiles (id, email, full_name, org_id, account_type, role, sub_role_id, status, created_by) values
  ('00000000-0000-0000-0000-000000001001', 'super@refold.internal', 'Priya Sharma',
   '00000000-0000-0000-0000-000000000001', 'super_admin', 'owner',
   '00000000-0000-0000-0000-000000000101', 'active', null),
-- Prism cloud owner
  ('00000000-0000-0000-0000-000000001002', 'owner@prismanalytics.io', 'Marcus Chen',
   '00000000-0000-0000-0000-000000000002', 'cloud_customer', 'owner',
   '00000000-0000-0000-0000-000000000201', 'active', '00000000-0000-0000-0000-000000001001'),
-- Meridian on-prem owner
  ('00000000-0000-0000-0000-000000001003', 'owner@meridian-labs.jp', 'Yuki Tanaka',
   '00000000-0000-0000-0000-000000000003', 'onprem_customer', 'owner',
   '00000000-0000-0000-0000-000000000301', 'active', '00000000-0000-0000-0000-000000001001'),
-- Prism member (analyst)
  ('00000000-0000-0000-0000-000000001004', 'analyst@prismanalytics.io', 'Amara Osei',
   '00000000-0000-0000-0000-000000000002', 'cloud_customer', 'member',
   '00000000-0000-0000-0000-000000000202', 'active', '00000000-0000-0000-0000-000000001002')
on conflict (id) do nothing;

-- ── CS team people (local only, FICTIONAL, public repo) ────────────────────
-- Equal admins (no titles, no teams — superseded 7.2a's hierarchy model).
-- Same auth.users + identities + profiles pattern as the demo users above.
-- All super_admin/role=member (only Priya Sharma is 'owner'). Do NOT add
-- these to the cloud demo-data script — real team setup happens in the UI.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000002001', 'authenticated', 'authenticated',
   'headofcs@refold.internal', extensions.crypt('demo-headofcs-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000002002', 'authenticated', 'authenticated',
   'edl@refold.internal', extensions.crypt('demo-edl-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000002003', 'authenticated', 'authenticated',
   'ta@refold.internal', extensions.crypt('demo-ta-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000002004', 'authenticated', 'authenticated',
   'fde1@refold.internal', extensions.crypt('demo-fde1-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000002005', 'authenticated', 'authenticated',
   'fde2@refold.internal', extensions.crypt('demo-fde2-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000002006', 'authenticated', 'authenticated',
   'fde3@refold.internal', extensions.crypt('demo-fde3-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002001',
   '{"sub":"00000000-0000-0000-0000-000000002001","email":"headofcs@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002002',
   '{"sub":"00000000-0000-0000-0000-000000002002","email":"edl@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002003',
   '{"sub":"00000000-0000-0000-0000-000000002003","email":"ta@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000002004', '00000000-0000-0000-0000-000000002004',
   '{"sub":"00000000-0000-0000-0000-000000002004","email":"fde1@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000002005', '00000000-0000-0000-0000-000000002005',
   '{"sub":"00000000-0000-0000-0000-000000002005","email":"fde2@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now()),
  ('00000000-0000-0000-0000-000000002006', '00000000-0000-0000-0000-000000002006',
   '{"sub":"00000000-0000-0000-0000-000000002006","email":"fde3@refold.internal","email_verified":true,"phone_verified":false}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, email, full_name, org_id, account_type, role, status, created_by) values
  ('00000000-0000-0000-0000-000000002001', 'headofcs@refold.internal', 'Dana Whitfield', '00000000-0000-0000-0000-000000000001', 'super_admin', 'member', 'active', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000002002', 'edl@refold.internal',      'Reza Karimi',     '00000000-0000-0000-0000-000000000001', 'super_admin', 'member', 'active', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000002003', 'ta@refold.internal',       'Lena Novak',      '00000000-0000-0000-0000-000000000001', 'super_admin', 'member', 'active', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000002004', 'fde1@refold.internal',     'Tomás Rivera',    '00000000-0000-0000-0000-000000000001', 'super_admin', 'member', 'active', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000002005', 'fde2@refold.internal',     'Grace Mwangi',    '00000000-0000-0000-0000-000000000001', 'super_admin', 'member', 'active', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000002006', 'fde3@refold.internal',     'Owen Baptiste',   '00000000-0000-0000-0000-000000000001', 'super_admin', 'member', 'active', '00000000-0000-0000-0000-000000001001')
on conflict (id) do nothing;

-- reports_to is optional and permission-free (UX convenience only) — one
-- example line: Tomás reports to Reza.
update public.profiles set reports_to = '00000000-0000-0000-0000-000000002002' where id = '00000000-0000-0000-0000-000000002004';

-- ── Account roles (record-keeping only — no permissions, no "primary") ──────
-- Prism Analytics: Reza=edl, Tomás=fde AND Grace=fde (two FDEs on one
-- account, exercising the overlap case). Meridian Laboratories: Lena=ta,
-- Owen=fde. Owen also previously worked Prism as fde and left — an ended
-- role, exercising the history/ended_at case.
insert into public.account_roles (org_id, profile_id, role, started_at, ended_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002002', 'edl', now() - interval '60 days', null),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002004', 'fde', now() - interval '60 days', null),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002005', 'fde', now() - interval '30 days', null),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002003', 'ta',  now() - interval '60 days', null),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002006', 'fde', now() - interval '60 days', null),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002006', 'fde', now() - interval '120 days', now() - interval '65 days');

-- Project members referencing the fixture projects live in seed_team_links.sql
-- (runs third — those project rows don't exist until phase7_demo_data.sql has
-- run, which happens after this file; see config.toml's sql_paths order).

-- Phase 7.1 CS Hub fictional demo data lives in its own file
-- (supabase/demo/phase7_demo_data.sql) — idempotent, creates no auth users, and
-- can also be run standalone against the cloud project's SQL Editor. Loaded on
-- local `db reset` via `[db.seed].sql_paths` in config.toml (runs after this
-- file, so the demo accounts/profiles it builds on already exist).
