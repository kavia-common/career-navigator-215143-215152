# Setup Guide

## Prerequisites

- Supabase project (URL and keys)
- Node.js 18+
- Supabase CLI (optional but recommended) for local development and deploys
- Access to the attachments/ directory for data seeding

## Environment Variables

Container env (frontend_cnp_app/.env):
- REACT_APP_SUPABASE_URL
- REACT_APP_SUPABASE_KEY
- REACT_APP_API_BASE
- REACT_APP_BACKEND_URL
- REACT_APP_FRONTEND_URL
- REACT_APP_WS_URL
- REACT_APP_NODE_ENV
- REACT_APP_NEXT_TELEMETRY_DISABLED
- REACT_APP_ENABLE_SOURCE_MAPS
- REACT_APP_PORT
- REACT_APP_TRUST_PROXY
- REACT_APP_LOG_LEVEL
- REACT_APP_HEALTHCHECK_PATH
- REACT_APP_FEATURE_FLAGS
- REACT_APP_EXPERIMENTS_ENABLED

Frontend Supabase client reads:
- frontend_cnp_app/src/lib/supabaseClient.ts expects REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY

## Database Schema Migration

Run the SQL scripts in order (via Supabase SQL editor or CLI):

1) Tables and types
- File: supabase/schema/01_tables.sql

2) RLS enablement
- File: supabase/schema/02_rls.sql

3) Policies
- File: supabase/schema/03_policies.sql

4) Storage buckets and policies
- File: supabase/schema/04_storage.sql

Notes:
- Ensure pgcrypto and uuid-ossp extensions can be created or are already available.
- Buckets "evidence" and "exports" are created if missing.

## Deploy Edge Functions

Source files:
- supabase/functions/seed_upsert/index.ts
- supabase/functions/rpc_gap_analysis/index.ts
- supabase/functions/rpc_recompute_profile/index.ts
- supabase/functions/fn_export_profile_pdf/index.ts

Using Supabase CLI (examples):
- supabase functions deploy seed_upsert
- supabase functions deploy rpc_gap_analysis
- supabase functions deploy rpc_recompute_profile
- supabase functions deploy fn_export_profile_pdf

Ensure Function URL base: https://<project>.supabase.co/functions/v1/<name>

## Seeding Data

- Transform attachments/ files to a JSON payload as described in docs/data-mapping.md.
- Invoke seed_upsert with a service role key:
  - Using supabase-js in a secured admin context or
  - Using cURL:

curl -X POST "https://<project>.supabase.co/functions/v1/seed_upsert" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d @payload.json

- The response includes counts and per-row errors for unresolved references.

## Verifying RLS

- As an authenticated user, you should only see your own rows in:
  - profiles, profile_competencies, plans, plan_items, evidence
- Reference tables are readable by all (roles, competencies, role_competencies, role_adjacency).

Sources:
- frontend_cnp_app/src/lib/supabaseClient.ts
- supabase/schema/*.sql
- supabase/functions/*/index.ts
