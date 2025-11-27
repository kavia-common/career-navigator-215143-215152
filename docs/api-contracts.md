# API Contracts – Supabase Edge Functions

## Overview

These Edge Functions are deployed under Supabase Functions and are invoked from the frontend via @supabase/supabase-js using functions.invoke(name, { body }). All functions expect Authorization: Bearer <JWT> unless otherwise noted and rely on RLS-safe PostgREST calls.

Function source files:
- seed_upsert: supabase/functions/seed_upsert/index.ts
- rpc_gap_analysis: supabase/functions/rpc_gap_analysis/index.ts
- rpc_recompute_profile: supabase/functions/rpc_recompute_profile/index.ts
- fn_export_profile_pdf: supabase/functions/fn_export_profile_pdf/index.ts

## seed_upsert

- Path: /functions/v1/seed_upsert
- Auth: Service role or admin only. The function rejects calls without a Bearer token.
- Purpose: Idempotently upsert seed data into reference tables.

Request body (JSON):
{
  "roles": [
    { "code": "CA", "name": "Chief Architect", "description": "…", "family": "Executive Tech Leadership", "level": "…" }
  ],
  "competencies": [
    { "id": "uuid-optional", "code": "CMP-001", "name": "Architecture Leadership", "description": "…", "category": "Leadership" }
  ],
  "role_competencies": [
    { "role_code": "CA", "competency_id": "uuid-optional", "competency_code": "CMP-001", "target": 80 }
  ],
  "adjacencies": [
    { "source": "CA", "target": "CTO", "weight": 0.8 }
  ],
  "content_refs": [
    { "ref_type": "role_card", "ref_key": "CA", "title": "Chief Architect Role Card", "body": "…" }
  ]
}

Response (200 JSON):
{
  "ok": true,
  "counts": {
    "roles": 10,
    "competencies": 150,
    "role_competencies": 300,
    "role_adjacency": 42,
    "content_refs": 12
  },
  "errors": [
    { "table": "role_competencies", "index": 3, "error": "competency_id not provided and competency_code could not be resolved" }
  ]
}

## rpc_gap_analysis

- Path: /functions/v1/rpc_gap_analysis
- Auth: Required (Bearer user JWT). RLS enforced through forwarded token.
- Purpose: Compute readiness, deficit, overlap for a profile toward a target role.

Request body (JSON):
{
  "profile_id": "optional-uuid (must equal caller id if provided)",
  "target_role_code": "optional text (falls back to profiles.role_target_code)"
}

Response (200 JSON):
{
  "profile_id": "uuid",
  "target_role_code": "CTO",
  "readiness": 0.73,
  "deficit": 120,
  "deficitMax": 450,
  "overlap": 0.27,
  "breakdown": [
    {
      "competency_id": "uuid",
      "competency_code": "CMP-001",
      "competency_name": "Architecture Leadership",
      "role_target": 80,
      "profile_level": 60,
      "delta": 20,
      "traffic": "Amber"
    }
  ],
  "vectors": {
    "targets": { "uuid": 80 },
    "levels": { "uuid": 60 },
    "deltas": { "uuid": 20 }
  },
  "d3": {
    "nodes": [{ "id": "uuid", "label": "Architecture Leadership", "x": 12.3, "y": -44.0 }],
    "links": []
  }
}

## rpc_recompute_profile

- Path: /functions/v1/rpc_recompute_profile
- Auth: Required (Bearer user JWT).
- Purpose: Recompute and optionally persist profile KPIs (readiness, counts) for the caller’s profile.

Request body (JSON):
{
  "profile_id": "optional-uuid (must equal caller id if provided)",
  "target_role_code": "optional text"
}

Response (200 JSON):
{
  "profile_id": "uuid",
  "target_role_code": "CTO",
  "readiness": 0.73,
  "deficit": 120,
  "deficitMax": 450,
  "overlap": 0.27,
  "counts": {
    "competencies": 40,
    "evidence": 6,
    "plan_items": 12,
    "completed_items": 3
  },
  "updated_at": "2025-11-27T08:20:00.000Z",
  "persisted": true
}

## fn_export_profile_pdf

- Path: /functions/v1/fn_export_profile_pdf
- Auth: Required (Bearer user JWT).
- Purpose: Generate a profile report PDF, store it to the exports bucket, and return a signed URL.

Request body (JSON):
{
  "profile_id": "optional-uuid (must equal caller id if provided)",
  "user_id": "alias of profile_id",
  "target_role_code": "optional text"
}

Response (200 JSON):
{
  "path": "uuid/profile_1732698000000.pdf",
  "signed_url": "https://<project>.supabase.co/storage/v1/object/sign/exports/...",
  "created_at": "2025-11-27T08:20:00.000Z"
}

Sources:
- supabase/functions/seed_upsert/index.ts
- supabase/functions/rpc_gap_analysis/index.ts
- supabase/functions/rpc_recompute_profile/index.ts
- supabase/functions/fn_export_profile_pdf/index.ts
