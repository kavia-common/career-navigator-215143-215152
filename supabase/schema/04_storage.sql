-- Career Navigator — Supabase Storage Setup
-- Buckets and Storage Policies for evidence artifacts uploaded via the frontend.
-- Bucket: evidence (private). Objects are addressed by path pattern: {profile_id}/{timestamp-rand}.{ext}
-- Frontend functions:
--  - uploadEvidenceFile(profile_id, file) writes to 'evidence' bucket
--  - getSignedEvidenceUrl(path) generates time-bound signed URLs

-- Create bucket if not exists (Supabase SQL helper function)
-- Note: In Supabase, create via dashboard or using:
-- select storage.create_bucket('evidence', public => false); -- private bucket
do $$
begin
  perform 1 from storage.buckets where name = 'evidence';
  if not found then
    perform storage.create_bucket('evidence', false, 'evidence artifacts bucket', false);
  end if;
end$$;

-- Storage policies
-- Allow authenticated users to upload only to their own folder prefix: `${auth.uid()}/...`
drop policy if exists "evidence objects upload own" on storage.objects;
create policy "evidence objects upload own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and (position((auth.uid())::text || '/' in (coalesce(storage.objects.name, ''))) = 1)
  );

-- Allow owners to update/replace their own objects (if needed)
drop policy if exists "evidence objects update own" on storage.objects;
create policy "evidence objects update own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'evidence'
    and (position((auth.uid())::text || '/' in (coalesce(storage.objects.name, ''))) = 1)
  )
  with check (
    bucket_id = 'evidence'
    and (position((auth.uid())::text || '/' in (coalesce(storage.objects.name, ''))) = 1)
  );

-- Allow owners to delete their own objects
drop policy if exists "evidence objects delete own" on storage.objects;
create policy "evidence objects delete own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'evidence'
    and (position((auth.uid())::text || '/' in (coalesce(storage.objects.name, ''))) = 1)
  );

-- Read access is private by default (no direct select). Frontend should use createSignedUrl to grant time-limited access.
-- If you want to allow owners to list objects in their folder via storage API:
drop policy if exists "evidence objects list own" on storage.objects;
create policy "evidence objects list own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'evidence'
    and (position((auth.uid())::text || '/' in (coalesce(storage.objects.name, ''))) = 1)
  );

-- Notes:
-- - Signed URLs (generated server-side by Supabase) bypass row-level read; they are time-limited and safe for end-user consumption.
-- - Evidence table stores storage_path to correlate DB row to storage object.
