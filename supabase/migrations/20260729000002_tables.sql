-- Phase 6.1 — tables (build-spec-v2 § 4)
-- Order respects FK dependencies: organizations -> sub_roles -> profiles
-- -> invitations -> audit_log -> saved_report_configs.

create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  deployment_type public.deployment_type not null,
  plan            text,
  status          public.org_status not null default 'active',
  external_ref    text,                     -- Refold/Facets id for API calls; null for internal
  created_at      timestamptz not null default now()
);

create table public.sub_roles (
  id           uuid primary key default gen_random_uuid(),
  account_type public.account_type not null,  -- which portal/account this sub-role applies to
  name         text not null,
  permissions  jsonb not null default '{}'::jsonb,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (account_type, name)
);

-- 1:1 with auth.users. account_type is stored (not derived) so RLS stays fast.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  org_id       uuid not null references public.organizations(id) on delete restrict,
  account_type public.account_type not null,
  role         public.member_role not null default 'member',
  sub_role_id  uuid references public.sub_roles(id) on delete set null,
  status       public.user_status not null default 'invited',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  account_type public.account_type not null,
  role         public.member_role not null default 'member',
  sub_role_id  uuid references public.sub_roles(id) on delete set null,
  invited_by   uuid references public.profiles(id) on delete set null,
  status       public.invitation_status not null default 'pending',
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days')
);

create index invitations_org_id_idx on public.invitations (org_id);

-- Append-only audit trail (no update/delete policies in RLS).
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.saved_report_configs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  period     public.report_period not null default 'monthly',
  filters    jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index saved_report_configs_org_id_idx on public.saved_report_configs (org_id);

-- Table-level DML grants for the authenticated role. RLS (next migration) is the
-- actual row gate; these grants just let policies be evaluated. anon gets nothing.
grant select, insert, update, delete on
  public.organizations,
  public.sub_roles,
  public.profiles,
  public.invitations,
  public.audit_log,
  public.saved_report_configs
to authenticated;
