# Supabase Integration - Evidence Vault

This project uses Supabase for Auth, Postgres and Storage.

Environment variables (must be set in the container's .env by the orchestrator):
- REACT_APP_SUPABASE_URL
- REACT_APP_SUPABASE_KEY
- REACT_APP_FRONTEND_URL (optional, for redirects elsewhere)

Storage:
- Bucket: evidence (private)
- Path convention: evidence/{auth.uid()}/<uuid>.<ext>
- RLS policies in supabase/schema/04_storage.sql allow users to insert/select/delete only their own folder prefix.

Database:
- Table: public.evidence (see supabase/schema/01_tables.sql)
- RLS: Owner-only policies in supabase/schema/03_policies.sql ensure users can operate only on their own rows.

Frontend APIs:
- uploadEvidenceFile(profileId: UUID, file: File): uploads to 'evidence' bucket under user folder
- createEvidence({...}): inserts a row into evidence table with optional competency link and storage path
- listEvidence(): lists current user's evidence with signed URLs attached
- deleteEvidence(id): deletes evidence row and best-effort removes storage object

Notes:
- Signed URLs are generated client-side using Supabase Storage's createSignedUrl and expire after 1 hour by default.
- Ensure you deploy the SQL files in supabase/schema/* to your Supabase project.
