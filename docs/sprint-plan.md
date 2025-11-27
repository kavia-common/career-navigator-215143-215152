# 4-Week Sprint Plan (MVP)

## Objectives

Deliver an end-to-end Career Navigator MVP with Supabase backend and React + TypeScript + D3 frontend, seeded from provided attachments, and supporting gap analysis, adjacency visualization, development planning, evidence management, and PDF export.

## Week 1 – Foundation and Schema

- Finalize schema and RLS policies (apply supabase/schema/01_tables.sql, 02_rls.sql, 03_policies.sql, 04_storage.sql)
- Implement and deploy Edge Functions skeletons:
  - seed_upsert
  - rpc_gap_analysis
- Parse attachments to normalized JSON drafts (see docs/data-mapping.md)
- Frontend scaffolding, Supabase client wiring (frontend_cnp_app/src/lib/supabaseClient.ts), basic auth UI

Deliverables:
- Database in project with RLS enabled
- seed_upsert deployment and initial data load
- Role list page with codes and names

## Week 2 – Gap Analysis and Adjacency

- Complete rpc_gap_analysis logic and deterministic D3 layout for competencies
- Implement role adjacency visualization using hashed layout (frontend components and logic)
- Frontend gap view and basic compare utilities

Deliverables:
- Gap analysis working with readiness/deficit/overlap and breakdown
- Adjacency graph renders with stable node positions
- Tests for deterministic logic

## Week 3 – Planning and Evidence

- Implement plans and plan_items CRUD with RLS
- Evidence upload to storage (evidence bucket) and listing
- rpc_recompute_profile with KPI persistence (profile_kpis optional table)
- UX polish: styles, accessibility, error handling

Deliverables:
- Plan editor with item management
- Evidence upload and listing
- KPI recompute visible in dashboard

## Week 4 – Export, Hardening, and Docs

- fn_export_profile_pdf to exports bucket with signed URL
- E2E hardening: error states, loading states, retries
- Documentation suite (this /docs directory)
- Final theming and visual polish

Deliverables:
- Export PDF feature
- Full documentation set
- Release candidate build

Risks and Mitigations:
- Data inconsistencies across attachments: normalize mapping and codes; use idempotent seeding.
- RLS misconfiguration: explicit tests and least-privilege checks.
- Function timeouts: keep payloads lean and use pagination when necessary.

Sources:
- supabase/schema/*.sql
- supabase/functions/*/index.ts
- frontend_cnp_app/src/lib/*.ts and src/lib/logic/*.ts
