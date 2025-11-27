# Data Mapping Guide (Attachments → Database)

## Overview

This guide describes how to map the provided attachments into the normalized tables and fields defined in the Supabase schema. Seeding is performed through the Edge Function at supabase/functions/seed_upsert/index.ts, which supports idempotent upserts.

Attachments directory: attachments/

Key source files:
- Role and competency catalogs:
  - attachments/20251127_081108_Competency_mapping.xlsx
  - attachments/20251127_081105_CA_Role_Adjacency.xlsx
  - attachments/20251127_081107_CA_Role_Adjacency29.xlsx
  - Role cards, briefs, and narratives (multiple *.txt files)
- Profiles worksheet:
  - attachments/20251127_081124_Role_Navigator_Worksheet.xlsx
- Product document:
  - attachments/20251127_081035_Career_Navigator_MVP_-_Product_Document.pdf

## Target Tables

- roles (code, name, description, family, level)
- competencies (id, code, name, description, category)
- role_competencies (role_code, competency_id, target)
- role_adjacency (source, target, weight)
- profiles, profile_competencies, plans, plan_items, evidence (user-generated post-seed)

## Mapping Rules

### 1. Roles

- Source: Role Card TXT files and related briefs:
  - attachments/20251127_081110_Role_Card_AppDev_v3(docx).txt
  - attachments/20251127_081111_Role_Card_CAIO_v3(docx).txt
  - attachments/20251127_081112_Role_Card_CCTO_v3(docx).txt
  - attachments/20251127_081113_Role_Card_CDAO_v3(docx).txt
  - attachments/20251127_081114_Role_Card_CDO_v3(docx).txt
  - attachments/20251127_081114_Role_Card_CInO_v3(docx).txt
  - attachments/20251127_081116_Role_Card_CIO_v3(docx).txt
  - attachments/20251127_081117_Role_Card_CPTO_v3(docx).txt
  - attachments/20251127_081118_Role_Card_CTrO_v3(docx).txt
  - attachments/20251127_081119_Role_Card_DigProd_v3(docx).txt
  - attachments/20251127_081120_Role_Card_FCTO_v3(docx).txt
  - attachments/20251127_081121_Role_Card_Infra_v3(docx).txt
  - attachments/20251127_081122_Role_Card_Ops_v3(docx).txt
  - attachments/20251127_081122_Role_Card_PMO_v3(docx).txt
  - attachments/20251127_081127_The Chief Architect Role(docx).txt
- Parse:
  - role code: inferred from filename prefix (e.g., "CIO", "CTO", "CA", "CDAO", "CInO", "CPTO", "CTrO", "FCTO", "Infra", "Ops", "PMO", "DigProd").
  - name: main title inside the role card text or inferred from filename.
  - description: narrative sections concatenated (purpose, scope, decision rights).
  - family/level: optional, set by consistent mapping rules or left null if not present.
- Seed payload example (roles):
  [
    { "code": "CA", "name": "Chief Architect", "description": "<from txt>", "family": "Executive Tech Leadership", "level": null },
    { "code": "CTO", "name": "Chief Technology Officer", "description": "<from txt>" }
  ]

### 2. Competencies

- Source: attachments/20251127_081108_Competency_mapping.xlsx
- Parse:
  - code: short competency code if present
  - name: competency name
  - description: competency definition
  - category: optional category domain
- Seed payload example (competencies):
  [
    { "code": "CMP-001", "name": "Architecture Leadership", "description": "…", "category": "Leadership" },
    { "code": "CMP-002", "name": "Platform Engineering", "description": "…", "category": "Engineering" }
  ]

### 3. Role → Competency Targets

- Source: attachments/20251127_081108_Competency_mapping.xlsx
- Parse:
  - role_code: e.g., "CA", "CTO"
  - target: numeric scale normalized to 0..100 (if source provides 1..5, multiply by 20)
  - competency reference: resolve via competency code or name → competencies.code / name to id
- Seed payload example (role_competencies):
  [
    { "role_code": "CA", "competency_code": "CMP-001", "target": 80 },
    { "role_code": "CA", "competency_code": "CMP-002", "target": 60 }
  ]
- Idempotency: seed_upsert resolves competency_id from competency_code when id is not provided, then upserts on (role_code, competency_id).

### 4. Role Adjacency

- Sources:
  - attachments/20251127_081105_CA_Role_Adjacency.xlsx
  - attachments/20251127_081107_CA_Role_Adjacency29.xlsx
- Parse:
  - source, target: role codes
  - weight: normalize to 0..1. If original scale is 1..5, apply weight = value / 5.
- Seed payload example (adjacencies):
  [
    { "source": "CA", "target": "CTO", "weight": 1.0 },
    { "source": "CIO", "target": "CTO", "weight": 0.8 }
  ]

### 5. Optional content_refs

- Source: Any textual asset (PDF/TXT) to maintain references to source content.
- Table may not exist by default; seed_upsert gracefully skips if missing.
- Seed payload example (content_refs):
  [
    { "ref_type": "role_card", "ref_key": "CTO", "title": "CTO Role Card", "body": "<optional excerpt>" }
  ]

## Parsing Rules

- XLSX parsing on frontend: using xlsx library (frontend_cnp_app/package.json).
  - Read worksheets, normalize headers to lower_snake_case, trim values.
  - Map "target" values to 0..100 numeric scale; treat blanks as 0.
- TXT parsing: trim whitespace, preserve paragraph breaks for description fields.
- Code resolution:
  - Ensure competency_code uniqueness; when absent, create a stable code by slug(name) uppercased.
  - For role codes, use the filename token or a controlled mapping.
- Idempotent seeding:
  - Use seed_upsert; it applies ON CONFLICT and merge-duplicates preferences.
  - Safe to re-run; it updates rows without duplicating.
- Error handling:
  - Unresolvable competency_code results in a per-row error in response.errors.

## Seeding Procedure

1. Transform attachments into a normalized JSON payload with arrays: roles, competencies, role_competencies, adjacencies, content_refs?.
2. Invoke Edge Function:
   - From frontend/admin UI call: supabase.functions.invoke('seed_upsert', { body })
   - Or cURL with service role JWT: POST https://<project>.supabase.co/functions/v1/seed_upsert
3. Verify response counts and handle errors list.

## Example Payload

{
  "roles": [
    { "code": "CA", "name": "Chief Architect", "description": "…" },
    { "code": "CTO", "name": "Chief Technology Officer", "description": "…" }
  ],
  "competencies": [
    { "code": "CMP-001", "name": "Architecture Leadership" },
    { "code": "CMP-002", "name": "Platform Engineering" }
  ],
  "role_competencies": [
    { "role_code": "CA", "competency_code": "CMP-001", "target": 80 }
  ],
  "adjacencies": [
    { "source": "CA", "target": "CTO", "weight": 1.0 }
  ]
}

Sources:
- supabase/functions/seed_upsert/index.ts
- supabase/schema/01_tables.sql
- attachments/*.xlsx, *.txt, *.pdf
