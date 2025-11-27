-- Career Navigator — Supabase Schema: Row Level Security (RLS)
-- Strategy:
-- - Reference tables (roles, competencies, role_competencies, role_adjacency) are read-only to anonymous/auth users (via policies in 03_policies.sql).
--   We enable RLS but only allow read for all; writes restricted to service role.
-- - User tables (profiles, profile_competencies, plans, plan_items, evidence) implement strict owner-based access: users can only read/write their own rows.

-- Ensure RLS is enabled on all tables
alter table public.roles enable row level security;
alter table public.competencies enable row level security;
alter table public.role_competencies enable row level security;
alter table public.role_adjacency enable row level security;

alter table public.profiles enable row level security;
alter table public.profile_competencies enable row level security;
alter table public.plans enable row level security;
alter table public.plan_items enable row level security;
alter table public.evidence enable row level security;

-- Optionally force RLS (prevents bypass by table owners)
alter table public.roles force row level security;
alter table public.competencies force row level security;
alter table public.role_competencies force row level security;
alter table public.role_adjacency force row level security;

alter table public.profiles force row level security;
alter table public.profile_competencies force row level security;
alter table public.plans force row level security;
alter table public.plan_items force row level security;
alter table public.evidence force row level security;
