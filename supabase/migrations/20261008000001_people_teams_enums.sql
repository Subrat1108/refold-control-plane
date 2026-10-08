-- Phase 7.2a — people/teams/views enums (build-spec-v3 § 5 "People, teams and
-- views"; product-overview.md § 2, § 12).

create type public.profile_title as enum ('head_of_cs', 'edl', 'ta', 'fde');

-- Shared by account_assignments AND project_members — both assign a person to
-- a thing (account or project) in one of these three capacities.
create type public.assignment_role as enum ('edl', 'ta', 'fde');

-- 'person' = a specific OTHER person (scope_target = that profile's id).
-- 'team_id' = a specific OTHER team (scope_target = that team's id, distinct
-- from 'team' which always means the CURRENT user's own team(s), no target).
create type public.saved_view_scope as enum ('mine', 'team', 'everyone', 'person', 'team_id');
