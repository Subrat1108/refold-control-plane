-- Phase 6.1 — enums (build-spec-v2 § 4)

create type public.deployment_type as enum ('cloud', 'on_premise', 'internal');
create type public.account_type    as enum ('super_admin', 'cloud_customer', 'onprem_customer');
create type public.member_role     as enum ('owner', 'member');
create type public.user_status     as enum ('invited', 'active', 'disabled');
create type public.org_status      as enum ('active', 'suspended', 'churned');
create type public.report_period   as enum ('monthly', 'quarterly', 'yearly');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
