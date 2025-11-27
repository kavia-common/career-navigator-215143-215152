# Career Navigator MVP – Documentation Index

Welcome to the Career Navigator MVP documentation. This suite describes the architecture, API contracts, database schema, data mapping from attachments, setup and deployment steps, testing strategy, and a four-week sprint plan.

Use this index to navigate:

- Architecture Overview: ./architecture-overview.md
- API Contracts (Supabase Edge Functions): ./api-contracts.md
- Database Schema and RLS Policies: ./database-schema.md
- Data Mapping Guide (attachments → tables/fields): ./data-mapping.md
- Setup Guide (env vars, SQL migrations, function deploy): ./setup-guide.md
- Deployment Guide (frontend and Supabase): ./deployment-guide.md
- Testing Strategy (logic determinism and UI flows): ./testing-strategy.md
- 4-week Sprint Plan: ./sprint-plan.md

Repository paths referenced throughout:
- Frontend app: frontend_cnp_app/
- Supabase schema: supabase/schema/01_tables.sql, 02_rls.sql, 03_policies.sql, 04_storage.sql
- Supabase Edge Functions:
  - supabase/functions/seed_upsert/index.ts
  - supabase/functions/rpc_gap_analysis/index.ts
  - supabase/functions/rpc_recompute_profile/index.ts
  - supabase/functions/fn_export_profile_pdf/index.ts

Attachments used for seeding and reference (relative to repository base):
- attachments/20251127_081035_Career_Navigator_MVP_-_Product_Document.pdf
- attachments/20251127_081104_01_Chief_Technology_Officer_AI_and_Technology(docx).txt
- attachments/20251127_081105_CA_Role_Adjacency.xlsx
- attachments/20251127_081107_CA_Role_Adjacency29.xlsx
- attachments/20251127_081108_Competency_mapping.xlsx
- attachments/20251127_081109_Development_Plan_CA_to_CTO(docx).txt
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
- attachments/20251127_081124_Role_Navigator_Worksheet.xlsx
- attachments/20251127_081125_Sponsor_Brief_CA_to_CTO(docx).txt
- attachments/20251127_081127_Talent_Movement_Brief_CA_to_CTO(docx).txt
- attachments/20251127_081127_The Chief Architect Role(docx).txt

Sources: 
- Supabase Schema SQL (supabase/schema/*.sql)
- Edge Functions TS sources (supabase/functions/*/index.ts)
- Frontend client sources (frontend_cnp_app/src/lib/*.ts, frontend_cnp_app/src/lib/logic/*.ts)
- Attachments (attachments/*.pdf, *.txt, *.xlsx)
