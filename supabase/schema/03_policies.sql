-- Career Navigator — Supabase Schema: RLS Policies
-- This file contains permissive READ policies for reference data and strict owner policies for user-owned data.
-- Supabase Auth integration:
-- - auth.uid() resolves to the current authenticated user's UUID.
-- - Service role (using service key) bypasses RLS or can be explicitly permitted via USING/ WITH CHECK conditions if needed.

-- ========== REFERENCE CATALOG POLICIES ==========
-- Read-only for everyone (including anon) for roles, competencies, role_competencies, role_adjacency
drop policy if exists "roles read for all" on public.roles;
create policy "roles read for all"
  on public.roles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "competencies read for all" on public.competencies;
create policy "competencies read for all"
  on public.competencies
  for select
  to anon, authenticated
  using (true);

drop policy if exists "role_competencies read for all" on public.role_competencies;
create policy "role_competencies read for all"
  on public.role_competencies
  for select
  to anon, authenticated
  using (true);

drop policy if exists "role_adjacency read for all" on public.role_adjacency;
create policy "role_adjacency read for all"
  on public.role_adjacency
  for select
  to anon, authenticated
  using (true);

-- Block public inserts/updates/deletes on reference tables.
-- Seeding should be performed by service role (which can bypass RLS).
-- If you want to allow writes only to service role explicitly, uncomment and adjust:
-- create policy "roles write service role only" on public.roles for all to authenticated using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role') with check (true);

-- ========== USER-OWNED DATA POLICIES ==========
-- PROFILES
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- PROFILE_COMPETENCIES
drop policy if exists "profile_competencies select own" on public.profile_competencies;
create policy "profile_competencies select own"
  on public.profile_competencies
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "profile_competencies upsert own" on public.profile_competencies;
create policy "profile_competencies upsert own"
  on public.profile_competencies
  for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "profile_competencies update own" on public.profile_competencies;
create policy "profile_competencies update own"
  on public.profile_competencies
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "profile_competencies delete own" on public.profile_competencies;
create policy "profile_competencies delete own"
  on public.profile_competencies
  for delete
  to authenticated
  using (profile_id = auth.uid());

-- PLANS
drop policy if exists "plans select own" on public.plans;
create policy "plans select own"
  on public.plans
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "plans insert own" on public.plans;
create policy "plans insert own"
  on public.plans
  for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "plans update own" on public.plans;
create policy "plans update own"
  on public.plans
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "plans delete own" on public.plans;
create policy "plans delete own"
  on public.plans
  for delete
  to authenticated
  using (profile_id = auth.uid());

-- PLAN_ITEMS (join via plan → profile_id)
drop policy if exists "plan_items select by plan owner" on public.plan_items;
create policy "plan_items select by plan owner"
  on public.plan_items
  for select
  to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_id and p.profile_id = auth.uid()
  ));

drop policy if exists "plan_items insert by plan owner" on public.plan_items;
create policy "plan_items insert by plan owner"
  on public.plan_items
  for insert
  to authenticated
  with check (exists (
    select 1 from public.plans p
    where p.id = plan_id and p.profile_id = auth.uid()
  ));

drop policy if exists "plan_items update by plan owner" on public.plan_items;
create policy "plan_items update by plan owner"
  on public.plan_items
  for update
  to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_id and p.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plans p
    where p.id = plan_id and p.profile_id = auth.uid()
  ));

drop policy if exists "plan_items delete by plan owner" on public.plan_items;
create policy "plan_items delete by plan owner"
  on public.plan_items
  for delete
  to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_id and p.profile_id = auth.uid()
  ));

-- EVIDENCE
drop policy if exists "evidence select own" on public.evidence;
create policy "evidence select own"
  on public.evidence
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "evidence insert own" on public.evidence;
create policy "evidence insert own"
  on public.evidence
  for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "evidence update own" on public.evidence;
create policy "evidence update own"
  on public.evidence
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "evidence delete own" on public.evidence;
create policy "evidence delete own"
  on public.evidence
  for delete
  to authenticated
  using (profile_id = auth.uid());
