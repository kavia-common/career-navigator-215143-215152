-- Career Navigator — Supabase Schema: Tables and Types
-- Purpose: Create core entities for roles, competencies, mappings, user profiles, plans, evidence, and adjacency network.
-- Notes:
-- - Columns include comments that map to the supplied datasets in attachments:
--   * Role cards (multiple TXT files) → roles table (code/name/description/family/level)
--   * Competency_mapping.xlsx → competencies and role_competencies tables
--   * CA_Role_Adjacency.xlsx (and ...29) → role_adjacency table
--   * Role_Navigator_Worksheet.xlsx → profiles, profile_competencies, plans, plan_items, evidence (evidence collected for readiness)
-- - UUIDs default to gen_random_uuid(); ensure pgcrypto or pguuid extension is enabled in your project.
-- - This script creates tables only. RLS, Policies, and Storage are defined in subsequent files.

-- Enable useful extensions if not already enabled (safe to run; idempotent)
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ========== TYPES ==========
-- Plan item kind (competency- or skill-aligned; MVP supports competency)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_item_kind') then
    create type plan_item_kind as enum ('competency', 'skill', 'general');
  end if;
end$$;

-- Evidence type (file, link, note)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'evidence_type') then
    create type evidence_type as enum ('file', 'link', 'note');
  end if;
end$$;

-- ========== REFERENCE TABLES ==========
-- Roles catalog
create table if not exists public.roles (
  code text primary key, -- e.g., 'CA', 'CTO', 'CIO' from Role Cards attachments
  name text not null,    -- Human-friendly title (e.g., "Chief Architect", "CTO (AI & Technology)")
  description text,      -- Narrative from role card docs (Purpose, Scope, Decision Rights, etc.)
  family text,           -- Optional grouping (e.g., "Executive Tech Leadership")
  level text,            -- Optional ladder/level descriptor
  created_at timestamptz not null default now()
);
comment on table public.roles is 'Role catalog derived from Role Card attachments.';

-- Competencies catalog
create table if not exists public.competencies (
  id uuid primary key default gen_random_uuid(),
  code text unique,       -- Optional short code if provided (from Competency_mapping.xlsx)
  name text not null,     -- Competency name (e.g., "Developer Experience & Golden Paths")
  description text,       -- Definition/description (from competency mapping or role docs)
  category text,          -- Optional category or domain bucket
  created_at timestamptz not null default now()
);
comment on table public.competencies is 'Competency catalog sourced from Competency_mapping.xlsx and Role Cards.';

-- Role ↔ Competency targets (required proficiency per role)
create table if not exists public.role_competencies (
  role_code text not null references public.roles(code) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  target numeric not null check (target >= 0), -- Scale per dataset (0..100 recommended for MVP)
  primary key (role_code, competency_id)
);
comment on table public.role_competencies is 'Targets per role from Competency_mapping.xlsx (maps role to required competency targets).';

-- Role adjacency graph (transition/overlap weight)
create table if not exists public.role_adjacency (
  source text not null references public.roles(code) on delete cascade,
  target text not null references public.roles(code) on delete cascade,
  weight numeric not null check (weight >= 0 and weight <= 1), -- normalized 0..1 ease/overlap
  primary key (source, target)
);
comment on table public.role_adjacency is 'Adjacency weights from CA_Role_Adjacency.xlsx representing transition ease/overlap.';

-- ========== USER-DERIVED ENTITIES ==========
-- Profiles mirror auth.users with additional fields
create table if not exists public.profiles (
  id uuid primary key, -- equals auth.users.id; populated via trigger or onboarding flow
  email text unique,   -- convenience cache of user email
  full_name text,
  role_current_code text references public.roles(code), -- current role (from worksheet)
  role_target_code text references public.roles(code),  -- goal role (from worksheet)
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'User profiles linked to auth.users; maps current and target roles (from Role Navigator Worksheet).';

-- Profile competency self/manager assessment levels
create table if not exists public.profile_competencies (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  level numeric not null check (level >= 0), -- 0..100 normalized
  updated_at timestamptz not null default now(),
  primary key (profile_id, competency_id)
);
comment on table public.profile_competencies is 'Readiness evidence per competency for a profile (from worksheet self/manager inputs).';

-- Development plans
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, -- e.g., "18-month Development Plan"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.plans is 'Plans authored by a user to close gaps; aligns with Development_Plan_* attachments.';

-- Plan items (actions aligned to competencies/skills)
create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  kind plan_item_kind not null default 'competency',
  competency_id uuid references public.competencies(id) on delete set null,
  skill_id uuid, -- reserved for future skill table (nullable)
  title text not null,
  description text,
  impact numeric check (impact >= 0 and impact <= 100), -- estimated contribution (0..100)
  completion numeric check (completion >= 0 and completion <= 100), -- percent complete (0..100)
  due_date date,
  created_at timestamptz not null default now()
);
comment on table public.plan_items is 'Concrete actions in a plan; optionally tied to a competency (from plan attachments).';

-- Evidence artifacts (file/link/note)
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  competency_id uuid references public.competencies(id) on delete set null,
  skill_id uuid, -- reserved for future skills
  kind evidence_type not null default 'file',
  storage_path text, -- Supabase Storage object path (bucket: evidence)
  created_at timestamptz not null default now()
);
comment on table public.evidence is 'Evidence of readiness (artifacts, links, notes) including file objects stored in evidence bucket.';

-- ========== INDEXES FOR PERFORMANCE ==========
create index if not exists idx_role_competencies_role on public.role_competencies(role_code);
create index if not exists idx_role_competencies_comp on public.role_competencies(competency_id);

create index if not exists idx_role_adjacency_source on public.role_adjacency(source);
create index if not exists idx_role_adjacency_target on public.role_adjacency(target);

create index if not exists idx_profiles_current_role on public.profiles(role_current_code);
create index if not exists idx_profiles_target_role on public.profiles(role_target_code);

create index if not exists idx_profile_comp_profile on public.profile_competencies(profile_id);
create index if not exists idx_profile_comp_comp on public.profile_competencies(competency_id);

create index if not exists idx_plans_profile on public.plans(profile_id);
create index if not exists idx_plan_items_plan on public.plan_items(plan_id);

create index if not exists idx_evidence_profile on public.evidence(profile_id);
create index if not exists idx_evidence_comp on public.evidence(competency_id);
