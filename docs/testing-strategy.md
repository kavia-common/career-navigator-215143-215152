# Testing Strategy

## Goals

- Ensure deterministic logic (gap analysis, adjacency layout) is stable across environments.
- Validate API contracts for Edge Functions.
- Verify RLS policies prevent cross-user access.
- Exercise key UI flows: login, role selection, gap view, plan updates, evidence upload, export PDF.

## Deterministic Logic Tests

Unit tests focus on pure functions in frontend logic:

- Gap analysis function (frontend_cnp_app/src/lib/logic/gap.ts)
  - computeGapAnalysis returns R = 1 - D/Dmax
  - Traffic light assignment matches thresholds
  - Breakdown sorted by delta descending

- Role comparison (frontend_cnp_app/src/lib/logic/compare.ts)
  - overlapPercent calculation as sum(min)/sum(max)
  - Delta per competency

- Adjacency layout (frontend_cnp_app/src/lib/logic/adjacency.ts)
  - hash-based angles ensure stable positions
  - normalizeAdjacency clamps weights and removes self-links

Suggested approach:
- jest tests under frontend_cnp_app/src with CI=true npm test
- Use fixed inputs and snapshot compare for nodes and links ordering

## Edge Function Contract Tests

- seed_upsert
  - Insert a small payload and assert counts and no duplication on re-run.
  - Negative: missing competency_code resolution produces per-row error.

- rpc_gap_analysis
  - With a seeded profile and role targets, assert readiness, deficitMax, and top breakdown item.

- rpc_recompute_profile
  - After adding evidence and plan_items, assert counts and persisted=true if profile_kpis exists.

- fn_export_profile_pdf
  - Assert response path and signed_url; fetch signed URL and validate Content-Type: application/pdf (basic check).

Run via:
- Integration tests that call functions using a real user JWT in a test project.
- Ensure test users are isolated; use RLS to verify isolation.

## RLS and Security

- Attempt to read another user’s profile, competencies, plans, plan_items, and evidence; confirm access denied (empty results).
- Confirm anon can read roles, competencies, role_competencies, role_adjacency but cannot modify them.

## UI Flows

- Login: create or upsert profiles row via upsertCurrentUserProfile
- Role selection: listRoles endpoint provides codes and names
- Gap view: invoke rpcGapAnalysis and render breakdown and D3 nodes
- Plan edit: savePlan updates items and reflects in UI
- Evidence upload: uses storage and inserts evidence row
- Export PDF: calls exportProfilePdf and triggers a download of the returned signed URL

## Test Data Management

- Use a dedicated Supabase project or schema for tests
- Seed minimal datasets via seed_upsert
- Clean up objects in evidence and exports after tests if necessary

Sources:
- frontend_cnp_app/src/lib/logic/*.ts
- frontend_cnp_app/src/lib/api.ts
- supabase/functions/*/index.ts
- supabase/schema/*.sql
