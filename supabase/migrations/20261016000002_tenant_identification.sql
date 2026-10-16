-- The hierarchy, settled with the owner (2026-10-16).
--
-- Refold is an integration platform. An ACCOUNT is an organisation that uses
-- it — the CS team's unit of ownership, assigned to an FDE / EDL / TA. A
-- TENANT is one signup on that account, which in Refold terms is one
-- org/workspace. That is the whole hierarchy: two levels, everywhere.
--
-- What differs per deployment shape is only whether tenants exist at all,
-- and how a tenant is located:
--
--   cloud             — shared infra. The account's own customers are
--                       Refold "linked accounts" which the Hub deliberately
--                       does NOT track individually; only account-level
--                       metrics matter. So: no tenants.
--   dedicated_cluster — a Refold-managed instance for one account. Customers
--                       usually make one signup per their own customer, one
--                       linked account each. Each signup is a tenant.
--   on_premise        — the account installs Refold on its own infra via
--                       helm/terraform; Refold has no access. An account may
--                       run several K8s clusters, each with several
--                       namespaces, each namespace being one installation,
--                       each installation having one or more signups. Each
--                       signup is a tenant.
--
-- Crucially, cluster and namespace are NOT tiers to navigate: the owner's
-- call is that a tenant simply RECORDS where it lives. Keeping them as
-- columns rather than tables holds every query and RLS policy at two levels
-- while the UI still groups on-prem tenants into cluster → namespace
-- accordions. That is presentation over flat data, which is much cheaper to
-- own than two more tables with their own policies, FKs and ambiguity risk.
alter table public.tenants
  add column cluster_name      text,
  add column namespace_name    text,
  add column refold_org_id     text,
  add column linked_account_id text;

comment on column public.tenants.cluster_name is
  'On-premise only: which of the account''s own K8s clusters this signup lives in. Identification, not hierarchy.';
comment on column public.tenants.namespace_name is
  'On-premise only: the namespace, i.e. which Refold installation inside that cluster. Identification, not hierarchy.';
comment on column public.tenants.refold_org_id is
  'The Refold org/workspace this signup created. A tenant IS that org; this is its identifier on the platform.';
comment on column public.tenants.linked_account_id is
  'The Refold linked account for this signup. Dedicated-cluster signups have exactly one.';

comment on table public.tenants is
  'One signup on an account = one Refold org/workspace. Exists for dedicated-cluster and on-premise accounts; cloud accounts are tracked at account level only.';

-- Finding every tenant in a given installation is the one lookup the
-- grouped on-prem view needs, and it is the only reason these columns are
-- queried rather than merely displayed.
create index tenants_location_idx on public.tenants (org_id, cluster_name, namespace_name)
  where cluster_name is not null;
