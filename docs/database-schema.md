# Database Schema and RLS

## Overview

The Career Navigator MVP stores catalog (roles, competencies, adjacency), user profiles, competency levels, plans, plan items, and evidence. All tables have Row Level Security enabled. Reference data is readable by all; user-owned data is only accessible by the owner.

Schema files:
- Tables and types: supabase/schema/01_tables.sql
- RLS enablement: supabase/schema/02_rls.sql
- Policies: supabase/schema/03_policies.sql
- Storage buckets and policies: supabase/schema/04_storage.sql

## Tables

### roles
- Path: supabase/schema/01_tables.sql
- Primary key: code (text)
- Fields: code, name, description, family, level, created_at
- Purpose: Role catalog derived from role card attachments.

### competencies
- PK: id (uuid, default gen_random_uuid())
- Unique: code (text, optional)
- Fields: id, code, name, description, category, created_at
- Purpose: Competency catalog from Competency_mapping.xlsx and role cards.

### role_competencies
- Composite PK: (role_code, competency_id)
- FKs: role_code → roles.code; competency_id → competencies.id
- Fields: role_code, competency_id, target
- Purpose: Required target proficiency per competency for a role.

### role_adjacency
- Composite PK: (source, target)
- FKs: source → roles.code; target → roles.code
- Fields: source, target, weight (0..1)
- Purpose: Transition/overlap weight between roles from adjacency spreadsheets.

### profiles
- PK: id (uuid) — equals auth.users.id
- Fields: id, email, full_name, role_current_code, role_target_code, created_at
- FKs: role_current_code → roles.code; role_target_code → roles.code
- Purpose: User profile mirroring auth.users with current and target role tracking.

### profile_competencies
- PK: (profile_id, competency_id)
- FKs: profile_id → profiles.id; competency_id → competencies.id
- Fields: profile_id, competency_id, level, updated_at
- Purpose: Self/manager assessed proficiency levels.

### plans
- PK: id (uuid)
- FK: profile_id → profiles.id
- Fields: id, profile_id, title, created_at, updated_at
- Purpose: Development plans authored by users.

### plan_items
- PK: id (uuid)
- FK: plan_id → plans.id; competency_id → competencies.id (nullable)
- Fields: id, plan_id, kind (plan_item_kind), competency_id, skill_id (reserved), title, description, impact, completion, due_date, created_at
- Purpose: Concrete actions within a plan.

### evidence
- PK: id (uuid)
- FK: profile_id → profiles.id; competency_id → competencies.id (nullable)
- Fields: id, profile_id, title, description, competency_id, skill_id (reserved), kind (evidence_type), storage_path, created_at
- Purpose: Artifacts supporting readiness claims; file paths align with Storage bucket objects.

## Relationships

- roles 1..* role_competencies *..1 competencies
- roles *..* roles via role_adjacency (directed edges)
- profiles 1..* profile_competencies *..1 competencies
- profiles 1..* plans 1..* plan_items
- profiles 1..* evidence
- profiles .. roles via role_current_code and role_target_code

## RLS Policies

- Reference tables (roles, competencies, role_competencies, role_adjacency):
  - Read: allowed to anon and authenticated
  - Write: blocked for public; seeding done via service role
- User-owned tables:
  - profiles: select/insert/update where id = auth.uid()
  - profile_competencies: select/upsert/update/delete where profile_id = auth.uid()
  - plans: select/insert/update/delete where profile_id = auth.uid()
  - plan_items: select/insert/update/delete if EXISTS a plan owned by auth.uid() (join enforced in policy)
  - evidence: select/insert/update/delete where profile_id = auth.uid()

See supabase/schema/02_rls.sql and supabase/schema/03_policies.sql for exact SQL.

## Storage

- Buckets:
  - evidence (private): user uploads scoped to prefix `${auth.uid()}/...`
  - exports (private): generated PDFs stored under `${auth.uid()}/...`
- Policies: supabase/schema/04_storage.sql

## Indexes

Indexes are defined for performance on join/filter columns (role_code, competency_id, profile_id, etc.). See 01_tables.sql for details.

Sources:
- supabase/schema/01_tables.sql
- supabase/schema/02_rls.sql
- supabase/schema/03_policies.sql
- supabase/schema/04_storage.sql
