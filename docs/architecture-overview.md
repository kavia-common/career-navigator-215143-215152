# Architecture Overview

## Overview

The Career Navigator MVP consists of a React + TypeScript client with D3-based visualizations, backed by Supabase for authentication, Postgres database, Storage, and Edge Functions. The system ingests seed data from structured attachments (XLSX/TXT/PDF) and provides deterministic gap analysis, adjacency graphs, and development planning.

## Components

### Frontend (React + TypeScript + D3)
- Location: frontend_cnp_app/
- Key libraries: react, react-router-dom, d3, @supabase/supabase-js, xlsx
- Supabase client: frontend_cnp_app/src/lib/supabaseClient.ts
- API wrappers: frontend_cnp_app/src/lib/api.ts
- Deterministic logic:
  - Gap analysis helpers: frontend_cnp_app/src/lib/logic/gap.ts
  - Role adjacency utilities: frontend_cnp_app/src/lib/logic/adjacency.ts
  - Role comparison utilities: frontend_cnp_app/src/lib/logic/compare.ts
- D3 visualization component(s): frontend_cnp_app/src/components/GraphD3.tsx
- UI routing: frontend_cnp_app/src/routes/*.tsx

### Supabase Backend
- Postgres schema:
  - Tables and types: supabase/schema/01_tables.sql
  - Row Level Security: supabase/schema/02_rls.sql
  - Policies: supabase/schema/03_policies.sql
  - Storage buckets and policies: supabase/schema/04_storage.sql
- Edge Functions:
  - Seed upsert (idempotent): supabase/functions/seed_upsert/index.ts
  - Gap analysis (RLS-safe): supabase/functions/rpc_gap_analysis/index.ts
  - Recompute profile KPIs: supabase/functions/rpc_recompute_profile/index.ts
  - Export profile PDF to storage: supabase/functions/fn_export_profile_pdf/index.ts
- Auth: Supabase Auth (JWT). Profiles table links to auth.users by id and is protected by RLS.

### Attachments and Data Sources
- Source files are stored at attachments/ and provide role definitions, competency mappings, adjacency data, and narrative content (role cards, briefs).
- The seeding path uses a normalized JSON mapping to database tables and invokes the Edge Function seed_upsert.

## Data Flow

- Seed:
  - Admin transforms attachments (XLSX/TXT) into normalized JSON and calls supabase/functions/seed_upsert/index.ts.
  - The function upserts: roles, competencies, role_competencies, role_adjacency, and optional content_refs.
- User sessions:
  - Users authenticate via Supabase; a profiles row is created/maintained for each user.
  - Gap analysis requests invoke supabase/functions/rpc_gap_analysis/index.ts with the caller JWT to enforce RLS.
  - KPI recompute invokes supabase/functions/rpc_recompute_profile/index.ts, optionally calling the gap function and persisting results to profile_kpis (if present).
  - Export PDF invokes supabase/functions/fn_export_profile_pdf/index.ts, storing a PDF in the exports bucket and returning a signed URL.
- Frontend:
  - Uses frontend_cnp_app/src/lib/api.ts to call the above functions and to read/write to tables respecting RLS.
  - D3 renders deterministic layouts based on hashed identifiers for stable positions.

## Mermaid Diagram

```mermaid
flowchart LR
  A["React Client (frontend_cnp_app)"] -->|Auth (JWT)| B["Supabase Auth"]
  A -->|invoke seed_upsert| C["Edge Function seed_upsert (supabase/functions/seed_upsert/index.ts)"]
  A -->|invoke rpc_gap_analysis| D["Edge Function rpc_gap_analysis (supabase/functions/rpc_gap_analysis/index.ts)"]
  A -->|invoke rpc_recompute_profile| E["Edge Function rpc_recompute_profile (supabase/functions/rpc_recompute_profile/index.ts)"]
  A -->|invoke fn_export_profile_pdf| F["Edge Function fn_export_profile_pdf (supabase/functions/fn_export_profile_pdf/index.ts)"]
  C --> G["Postgres (roles, competencies, role_competencies, role_adjacency)"]
  D --> G
  E --> G
  F --> G
  F --> H["Supabase Storage (exports)"]
  A --> I["Supabase Storage (evidence)"]
```

Sources:
- frontend_cnp_app/src/lib/supabaseClient.ts
- frontend_cnp_app/src/lib/api.ts
- frontend_cnp_app/src/lib/logic/gap.ts
- frontend_cnp_app/src/lib/logic/adjacency.ts
- supabase/schema/01_tables.sql
- supabase/schema/02_rls.sql
- supabase/schema/03_policies.sql
- supabase/schema/04_storage.sql
- supabase/functions/*/index.ts
