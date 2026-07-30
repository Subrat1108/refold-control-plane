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
