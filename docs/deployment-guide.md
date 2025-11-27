# Deployment Guide

## Supabase Resources

1) Create a Supabase project and obtain:
- Project URL (SUPABASE_URL)
- ANON key (SUPABASE_ANON_KEY)
- SERVICE role key (for server-side seeding only)

2) Apply database migrations:
- Run supabase/schema/01_tables.sql, 02_rls.sql, 03_policies.sql, 04_storage.sql in order.

3) Deploy Edge Functions:
- supabase functions deploy seed_upsert
- supabase functions deploy rpc_gap_analysis
- supabase functions deploy rpc_recompute_profile
- supabase functions deploy fn_export_profile_pdf

4) Verify storage buckets:
- evidence (private)
- exports (private)

## Frontend Deployment

Project: career-navigator-215143-215152/frontend_cnp_app

1) Configure environment variables for the runtime:
- REACT_APP_SUPABASE_URL=<your supabase url>
- REACT_APP_SUPABASE_KEY=<your anon key>
- Optional other REACT_APP_* envs per container_env list

2) Install and build:
- npm install
- npm run build

3) Serve:
- Any static hosting that serves the build/ directory (e.g., Vercel, Netlify, static S3 + CloudFront, or containerized nginx).
- Ensure the app can access Supabase URL and the browser can call /functions/v1 endpoints.

## Post-Deployment Checks

- Authentication: login flow creates/accesses profiles row (frontend_cnp_app/src/lib/api.ts functions getCurrentUserProfile and upsertCurrentUserProfile).
- Data visibility: reference tables readable; user-owned tables restricted by RLS.
- Functions:
  - rpc_gap_analysis: returns readiness and breakdown for logged-in user based on target role.
  - rpc_recompute_profile: recomputes KPIs; persists to profile_kpis if present.
  - fn_export_profile_pdf: returns a signed URL; can be fetched by the client for download.
  - seed_upsert: verify only callable via service/admin context.

## Rollback

- Because SQL files are idempotent for existence checks, re-running is safe. For destructive changes, apply explicit DROP statements with caution.
- Edge Functions: redeploy specific functions to roll forward fixes.

Sources:
- frontend_cnp_app/package.json
- frontend_cnp_app/src/lib/api.ts
- supabase/schema/*.sql
- supabase/functions/*/index.ts
