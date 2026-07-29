-- Phase 6.1 — system seed (build-spec-v2 § 4/§ 7)
-- Canonical rows that must exist in EVERY environment (incl. production), hence
-- a migration rather than the local-only seed.sql. Fixed UUIDs so later blocks
-- and tests can reference them deterministically. Idempotent via ON CONFLICT.

-- Internal Refold org that super-admins belong to.
insert into public.organizations (id, name, deployment_type, plan, status, external_ref)
values ('00000000-0000-0000-0000-000000000001', 'Refold', 'internal', 'internal', 'active', null)
on conflict (id) do nothing;

-- System sub-roles. Customer sub-roles are seeded per customer account_type
-- (cloud_customer + onprem_customer) since sub_roles.account_type is a single
-- enum value — see 6.4 open question about a shared "customer" grouping.
insert into public.sub_roles (id, account_type, name, permissions, is_system) values
  -- admin portal
  ('00000000-0000-0000-0000-000000000101', 'super_admin', 'Support',   '{"read": true, "manage_support": true}', true),
  ('00000000-0000-0000-0000-000000000102', 'super_admin', 'Billing',   '{"read": true, "manage_billing": true}', true),
  ('00000000-0000-0000-0000-000000000103', 'super_admin', 'Read-only', '{"read": true}', true),
  -- cloud customer portal
  ('00000000-0000-0000-0000-000000000201', 'cloud_customer', 'Admin',   '{"read": true, "manage_users": true, "manage_org": true}', true),
  ('00000000-0000-0000-0000-000000000202', 'cloud_customer', 'Analyst', '{"read": true, "export": true}', true),
  ('00000000-0000-0000-0000-000000000203', 'cloud_customer', 'Viewer',  '{"read": true}', true),
  -- on-prem customer portal
  ('00000000-0000-0000-0000-000000000301', 'onprem_customer', 'Admin',   '{"read": true, "manage_users": true, "manage_org": true}', true),
  ('00000000-0000-0000-0000-000000000302', 'onprem_customer', 'Analyst', '{"read": true, "export": true}', true),
  ('00000000-0000-0000-0000-000000000303', 'onprem_customer', 'Viewer',  '{"read": true}', true)
on conflict (id) do nothing;
