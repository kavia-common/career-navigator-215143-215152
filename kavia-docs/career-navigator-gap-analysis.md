# Career Navigator MVP – User Journeys Gap Analysis and Remediation Plan

## Overview

This report analyzes the “Career Navigator MVP – Product Document” and 23 supporting attachments, then maps the specified user journeys and features to the current implementation across the frontend (React routes/components) and Supabase (schema, RLS policies, Edge Functions). It enumerates the end-to-end journeys, identifies implemented elements, flags gaps and misalignments, and provides a prioritized remediation checklist with concrete recommendations. Acceptance criteria for each journey after remediation are included.

Sources analyzed:
- Product Document: attachments/20251127_081035_Career_Navigator_MVP_-_Product_Document.pdf
- Supabase Schema and RLS: career-navigator-215143-215152/supabase/schema/01_tables.sql, 02_rls.sql, 03_policies.sql
- Supabase Edge Functions: 
  - career-navigator-215143-215152/supabase/functions/rpc_gap_analysis/index.ts
  - career-navigator-215143-215152/supabase/functions/rpc_recompute_profile/index.ts
  - career-navigator-215143-215152/supabase/functions/fn_export_profile_pdf/index.ts
- Frontend routes and components (selected):
  - career-navigator-215143-215152/frontend_cnp_app/src/App.tsx
  - .../src/routes/Dashboard.tsx, Profile.tsx, DevPlan.tsx, Compare.tsx, Graph.tsx, Evidence.tsx, Sponsors.tsx, Home.tsx, Login.tsx
- Repo docs index: career-navigator-215143-215152/docs/README.md

Environment variables defined for container:
- REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_KEY, REACT_APP_API_BASE, REACT_APP_BACKEND_URL, REACT_APP_FRONTEND_URL, REACT_APP_WS_URL, REACT_APP_NODE_ENV, REACT_APP_NEXT_TELEMETRY_DISABLED, REACT_APP_ENABLE_SOURCE_MAPS, REACT_APP_PORT, REACT_APP_TRUST_PROXY, REACT_APP_LOG_LEVEL, REACT_APP_HEALTHCHECK_PATH, REACT_APP_FEATURE_FLAGS, REACT_APP_EXPERIMENTS_ENABLED

## User Journeys extracted from the Product Document

### Journey 1: Role Selection Path (Exploratory)

Step-by-step per Product Document:
1. Entry: Explore Roles (no login required for MVP).
2. Select Current Role from taxonomy (dropdown/autocomplete).
3. View Role Card for selected role (mission, scope, key decisions, conversations).
4. View Adjacent Roles ranked by overlap %.
5. Explore Target Role: click to open its role card.
6. View Competency Gap: side-by-side (current vs target role) competency levels.
7. Review Gap Analysis: highlight deltas with proficiency levels (F, P, A, Au).
8. Export or Share: optional PDF/image snapshot.
9. Exit or Save Profile: optionally convert to profile-based journey with login.

Artifacts and data dependencies:
- Role taxonomy and cards (Role_Card_* attachments)
- Adjacency matrix and overlaps (CA_Role_Adjacency*.xlsx)
- Competency mapping per role (Competency_mapping.xlsx)
- Optional export

### Journey 2: Profile-Based Path (Structured Planning)

Phase 1: Authentication & Profile Creation
1. Login/Signup (Supabase Auth).
2. Complete Profile Basics: name, email, current role, 1–3 target roles, optional resume upload.
3. Save Profile.

Phase 2: Self-Assessment
1. Role Navigator Worksheet: interest, sponsorship, runway, risk fit, market pull, scope fit; weighted scoring and ranking.
2. Competency Self-Rating (optional) vs target role requirements.
3. Save Assessment.

Phase 3: Career Map & Gap Analysis
1. Interactive D3 map of current → top-ranked target roles.
2. Competency Gap Dashboard with matrix and visual indicators; highlight top gaps; show deltas.
3. Evidence & Artifacts: per-gap evidence entries (links, sponsor names, project refs, notes).

Phase 4: Development Plan Builder
1. Pre-filled 18-month roadmap with phases (0–3, 3–6, 6–12, 12–18).
2. For each phase: editable key decisions, PoR milestones, evidence targets.
3. 6-month Action Plan with monthly actions and status tracking.
4. Save Plan.

Phase 5: Sponsor & Evidence Tracking
1. Sponsor Management (operator/external signaler/mentor) with visibility cadence.
2. Evidence Vault: add artifacts, file upload (≤10MB), categorize, link to gaps/phases.
3. Save tracking.

Phase 6: Progress Monitoring
1. Dashboard: current/target role(s), readiness score, gap summary, plan status, evidence stats.
2. Milestone Tracking: status per phase and actions with timestamps.
3. Export & Share: profile summary and gap analysis PDFs.

## Current Implementation Mapping (pages/components/APIs)

This section maps each journey step to currently implemented pages/components and Supabase functions, noting coverage.

### Journey 1: Role Selection Path

1. Entry “Explore Roles” without login:
   - Current: App.tsx routes guard most pages via AuthGuard requireAuth=true. Public “/home” exists (Home.tsx) but main navigation sends "/" to Dashboard which is auth-required. No dedicated public Explore path.
   - Coverage: Partial (Home page exists but not an explore roles entry with full flow; exploratory functionality is behind auth).

2. Select Current Role from taxonomy:
   - Current: Compare.tsx loads roles from supabase.from('roles') and shows source/target selectors. Graph.tsx also has role selector but seeded in-memory nodes/edges; not from DB.
   - Coverage: Partial (available in Compare with auth; not public; Graph uses static seed, not DB).

3. View Role Card:
   - Current: No explicit role card component/page. Compare shows competencies; Graph shows nodes; Dashboard/Profile do not show role card details.
   - Coverage: Missing.

4. View Adjacent Roles ranked by overlap %:
   - Current: Graph.tsx shows edges with weights (static) and filter by weight; not ranked list. No adjacency table backed by DB adjacency weights.
   - Coverage: Partial (visual graph only, static; no ranked list; not from CA_Role_Adjacency table).

5. Explore Target Role and open its card:
   - Current: Not implemented as a role card modal/drawer.
   - Coverage: Missing.

6. View Competency Gap (current vs target role):
   - Current: Compare.tsx implements comparison: fetchRoleCompetencies, local/rpc_gap_analysis integration, matrix table with status color. Requires auth (App.tsx guards).
   - Coverage: Implemented but gated by auth and lacks F/P/A/Au proficiency labels (uses numeric levels).

7. Review Gap Analysis with proficiency levels:
   - Current: Numeric levels, status pills; no F/P/A/Au labels or explicit scale mapping.
   - Coverage: Partial.

8. Export or Share:
   - Current: fn_export_profile_pdf edge function exists; Dashboard.tsx uses exportProfilePdf(profileId). There is no public export for an anonymous explore session; export is profile-based.
   - Coverage: Partial for profile-based; Missing for public explore export.

9. Exit or Save Profile:
   - Current: Profile.tsx enables setting current and target role for authenticated users; no public-to-profile conversion entry from explore path is present.
   - Coverage: Partial.

Backend/data coverage for Journey 1:
- roles, role_competencies exist in schema.
- role_adjacency exists in schema, but frontend Graph.tsx uses hardcoded edges; not querying role_adjacency.
- rpc_gap_analysis supports gap calculations (needs authenticated user with profile row due to RLS). No anonymous analysis path.

### Journey 2: Profile-Based Path

Phase 1: Authentication & Profile Creation
- Login/Signup: Login.tsx (not read in this pass, but present). App.tsx manages Supabase session and guards.
- Profile basics: Profile.tsx allows full_name, role_current_code, role_target_code. Support for 1–3 target roles not present; single target role code only. Resume upload not implemented.
- Save Profile: Profile.tsx uses upsertCurrentUserProfile and rpcRecomputeProfile to refresh readiness.

Coverage: Implemented partially (single target role; no multi-target; no resume upload).

Phase 2: Self-Assessment
- Role Navigator Worksheet with weighted scoring: No dedicated Assessment route/component found in routes; Dashboard/Profile/DevPlan/Evidence/Sponsors/Compare/Graph are available; “assessment” page missing.
- Competency Self-Rating: profile_competencies table exists; no explicit self-rating UI component exposed in current routes; Compare focuses on role comparisons, not per-profile self-rating input.
- Save Assessment: No assessment table in current SQL; product doc describes assessments table (not present).

Coverage: Missing (UI and table).

Phase 3: Career Map & Gap Analysis
- D3 map: Graph.tsx renders D3 via GraphD3 with seed nodes/edges; allows selecting targetRole, invokes rpc_gap_analysis but only with target_role_id (not source) and not tied to user profile context for public; graph nodes are static seeds.
- Competency Gap Dashboard: Dashboard.tsx displays top gaps by calling rpcGapAnalysis and rpcRecomputeProfile; provides summary and table. Compare.tsx provides detailed matrix with status.
- Evidence & Artifacts: Evidence.tsx implements file upload to storage and list; links to competencies (optional) are present.

Coverage: Partial (Graph backed by static seeds; no hover/edge click details; Compare and Dashboard implement gap views; evidence vault present).

Phase 4: Development Plan Builder
- DevPlan.tsx implements plan creation and plan_items editing with phase/priority/status encoded in description (UI-only metadata). Generates items from top gaps via rpc_gap_analysis. Exports profile PDF via fn_export_profile_pdf. Phase labeling present; no explicit pre-filled template content as described in the doc (key decisions/PoR prompts are generalized). 6-month month-by-month structure is not modeled; plan_items are generic with due dates.
- Save to supabase.plan_items/plans: Implemented.
Coverage: Partial (no explicit 6-month month-by-month substructure; phases exist as UI metadata; no standardized template content items; no per-phase status rollups).

Phase 5: Sponsor & Evidence Tracking
- Sponsors.tsx present with CRUD (list/create/update/delete) via API helpers. Schema does not include sponsors table; instead sponsors appear to be maintained as a custom table in API helpers (not visible in this pass). If not in DB schema, RLS may be missing.
- Evidence.tsx present with storage upload and list; schema includes evidence table with profile ownership RLS; links to competencies supported; categories/cadences as enums per product doc are not modeled (evidence.category enum not present; evidence.kind enum exists but limited to file/link/note).

Coverage: Partial (Sponsors depends on missing table; Evidence present with partial fields; no category filtering UI tied to enum; size limit UI not enforced client-side).

Phase 6: Progress Monitoring
- Dashboard.tsx shows target role, readiness, overlap, KPI counts (competencies, evidence, plan items, completed). Displays top gaps and recent evidence; quick actions. Export PDF available.
Coverage: Implemented.

Export & Reporting
- fn_export_profile_pdf renders a simple PDF with Profile Summary, Gap Analysis, Development Plan items; writes to storage and returns signed URL. Dashboard onExportPdf triggers download as Blob (not using signed URL path). Works for authenticated users.

Coverage: Implemented.

## Gaps and Misalignments (Missing, Partial, Incorrect)

This section flags gaps by journey step with concrete observations.

1) Public Explore Journey gating
- Issue: Product requires a public “Explore Roles” path without login. Current App.tsx guards core pages with AuthGuard, except /home and /login. Compare (which provides gap view) is auth-required.
- Impact: Users cannot execute Journey 1 end-to-end without authentication.

2) Role Card UI
- Issue: No component/page to display role cards with mission, scope, key decisions, conversations.
- Impact: Journey 1 steps 3 and 5 missing. Reduces decision-making support.

3) Role Adjacency data integration
- Issue: Graph.tsx uses static seeded nodes/edges; does not query role_adjacency table. No ranked adjacency table view as in Product doc.
- Impact: Misaligned with Feature 2; no accurate overlaps; no list ranking.

4) Competency scale labels (F/P/A/Au)
- Issue: Compare and Dashboard use numeric levels (0..N) and traffic lights; do not map to Foundational/Practitioner/Advanced/Authority anchors.
- Impact: Misaligned with Feature 3’s communication (users expect proficiency anchor language).

5) Export for public explore
- Issue: Export limited to profile-based PDF; no anonymous explore export or gap snapshot PDF for role-to-role comparison.
- Impact: Journey 1 step 8 not implemented as public export.

6) Conversion from explore to profile
- Issue: No explicit “Save as profile” CTA that pre-fills profile based on user’s explore selection when they authenticate.
- Impact: Journey 1 step 9 partially missing.

7) Multi-target roles and assessments
- Issue: Profile schema supports a single role_target_code; no 1–3 target roles ranking. No assessments table and no “Assessment” page/worksheet UI. No weighted scoring logic in frontend.
- Impact: Journey 2 Phase 1 & 2 partially missing.

8) Competency self-rating UI
- Issue: Although profile_competencies exists, UI to enter self-ratings is not present; Compare is role-to-role, not profile self-rating.
- Impact: Journey 2 Phase 2 missing.

9) Development Plan template depth
- Issue: DevPlan encodes phase/priority/status in description but does not surface the pre-filled template items from Product doc (e.g., Phase 1 decisions/PoR). No 6-month monthly plan structure; no per-phase status rollups.
- Impact: Partial alignment; depth and structure reduced.

10) Sponsors data model
- Issue: Sponsors component relies on list/create/update/delete API, but sponsors table is not present in 01_tables.sql. This creates a backend gap: CRUD operations may fail or be stubbed; RLS policies are not defined for sponsors.
- Impact: Journey 2 Phase 5 inconsistent; potential runtime errors.

11) Evidence model differences
- Issue: Product doc specifies evidence categories (por, kpi, artifact, leadership, external_signal, other) and additional fields. Current schema has evidence.kind (file|link|note) but not category. UI no filter by category; no size guard; linking to plan phases not modeled.
- Impact: Partial/misaligned with tracking semantics.

12) Career Map interactions
- Issue: Product doc calls for hover effects showing overlap %, top-5 gap competencies on edge click; Graph.tsx is a general D3 graph container with seed data; lacks these interactions and DB-driven metrics.
- Impact: Partial alignment; needs interaction and data integration.

13) Public routing and route names
- Issue: Product doc defines routes (/explore, /explore/:roleId/gaps/:targetRoleId, /career-map, /competencies, /assessment, /export). Current routes include /graph, /compare, but not the named routes; many are auth-only.
- Impact: Navigation misalignment; discoverability issues.

14) Attachments seeding coverage
- Issue: Data mapping and seeding likely handled via admin function (Admin.tsx, seed_upsert/index.ts exists), but current app README indicates Sponsors/Notifications pages; we did not inspect Admin.tsx content in this pass, and role cards content may not be loaded into roles table.
- Impact: Risk of incomplete role taxonomy and card fields.

## Remediation Plan (prioritized checklist)

P0 — Must fix for MVP parity:
1. Introduce a public Explore flow:
   - Add /explore route (public) with:
     - Current role selector (from roles table).
     - Ranked adjacency table fetched from role_adjacency (descending by weight/overlap).
     - Row click to view gap details comparing current vs target role (public view component).
   - Add /explore/:source/gaps/:target route (public) showing:
     - Role cards for source and target (modal/drawer).
     - Competency matrix with F/P/A/Au labels derived from numeric mapping and color coding.
   - Update App.tsx routes to not guard /explore paths.

2. Role cards UI and data:
   - Create RoleCard component to display mission, scope, key decisions, conversations, readiness signals (extend roles table or denormalize details if already seeded via Admin).
   - Ensure seeding populates roles.description, key fields from Role_Card_* attachments.
   - Provide modal/drawer integration in Explore and Graph.

3. DB-driven role adjacency and graph:
   - Update Graph.tsx to fetch nodes (roles) and edges (role_adjacency) from Supabase instead of static seeds.
   - Add hover showing overlap %, and edge click to show top-5 gap competencies for that transition by invoking a parameterized gap function that can compute for a source and target role without profile context (new edge function or PostgREST query with safe public read).

4. Sponsors backend model:
   - Add sponsors table to schema with owner-based RLS (as per Product doc), and wire Sponsors.tsx to actual table fields (name, role, type, visibility cadence, notes).
   - Add policies similar to plans/evidence.

5. Evidence categories and fields:
   - Extend evidence schema with category enum and optional fields (evidence_date, associated_competencies, associated_phase). Update Evidence.tsx UI to support category filter and linking to plan phases.

6. Anonymous gap analysis:
   - Provide an Edge Function for “role-to-role” gap analysis that does not require a user profile (reads role_competencies and returns matrix and deltas). Alternatively, allow public read of role_competencies and run local logic in frontend for explore pages. Keep current rpc_gap_analysis for profile-based computations.

P1 — Important for full journey alignment:
7. Proficiency labels:
   - Standardize mapping (e.g., numeric levels 0..3 → F/P/A/Au) and render in Compare, Explore gap, Dashboard.

8. Convert explore to profile:
   - Add CTA on explore gap views: “Save as Profile” which, after login, pre-fills profile current_role and target_role and invokes upsertCurrentUserProfile, then navigates to Dashboard.

9. Assessment page and model:
   - Add assessments table and /assessment route with Role Navigator Worksheet (Interest, Sponsorship, Runway, Risk Fit, Market Pull, Scope Fit) and weighted scoring (weights per Product doc). Persist and show ranking of up to 3 target roles.

10. Competency self-rating UI:
    - Add /competencies route to allow profile self-rating per competency for target role’s required set, saving to profile_competencies.

11. Development Plan template richness:
    - Introduce phase templates per Product doc and provide an option to “Apply template” to pre-populate plan_items structured by phases. Consider a “Monthly plan” sub-structure (Month 1–6) with derived items. Roll up statuses per phase on the UI.

12. Public export for explore:
    - Add lightweight PDF export of role-to-role gap analysis without requiring a profile (using a new Edge Function or a client-side PDF with a downloadable blob).

P2 — UX, polish, and naming alignment:
13. Route renaming to match doc:
    - Add aliases: /career-map (for Graph), /competencies (for self-rating matrix), /export (for consolidated export page), /explore as public entry.

14. Graph interactions:
    - Implement hover effects, path highlighting, and click behavior to open role cards and edge top-5 gaps.

15. File size guard and feedback:
    - Enforce ≤10MB client-side check in Evidence.tsx; show error/toast if exceeded.

## Acceptance Criteria for each journey after fixes

### Journey 1: Role Selection Path (Exploratory)
- Public access:
  - Visiting /explore renders without authentication.
- Role selection and adjacency:
  - User can select a current role from a searchable dropdown powered by roles table.
  - Adjacent roles render as a ranked table using role_adjacency with overlap %. Sorting works by overlap desc.
- Role cards:
  - Clicking the current or any target role opens a role card modal/drawer showing mission, scope, key decisions, and conversations.
- Gap analysis:
  - Clicking “View Details” shows a public gap page (/explore/:source/gaps/:target) with a competency matrix:
    - Rows show source level, target level, delta, and proficiency labels F/P/A/Au derived from numeric mapping.
    - Color-coded status per Product doc (Green/Yellow/Orange/Red).
- Export:
  - “Export Snapshot” on the public gap page generates a PDF or image and downloads it without requiring authentication (either client-side generation or an Edge Function allowing public role-to-role export without PII).
- Conversion to profile:
  - A “Save as Profile” action prompts login and then pre-fills profile current_role and target_role; after save, user lands on Dashboard.

### Journey 2: Profile-Based Path (Structured Planning)

Phase 1: Authentication & Profile Creation
- Auth:
  - Users can login/signup via Supabase Auth; app state reflects session promptly.
- Profile Basics:
  - Profile editor allows selecting current role and up to 3 target roles (ranked).
  - Optional resume file upload to a profile bucket path is available (MVP: uploaded but not parsed).
- Persistence:
  - Profile is persisted; RLS ensures user-only access.

Phase 2: Self-Assessment
- Role Navigator Worksheet:
  - /assessment supports scoring across Interest, Sponsorship, Runway, Risk Fit, Market Pull, Scope Fit with UI sliders/inputs and weighted scoring matching Product doc weights.
  - Renders ranked target roles with final scores and persists assessment to assessments table.
- Self-Competency Rating:
  - /competencies allows users to rate self per competency for their top-ranked target role; values displayed as F/P/A/Au; saving updates profile_competencies.

Phase 3: Career Map & Gap Analysis
- Career Map:
  - /career-map renders a D3 graph powered by role_adjacency; current role is emphasized; hovering shows overlap %; clicking nodes opens role card; clicking edges shows top-5 gaps for that transition.
- Gap Dashboard:
  - Dashboard and Compare pages display gap summaries and detailed matrices with proper proficiency labels; top gaps highlighted.
- Evidence & Artifacts:
  - Evidence vault supports upload/linking, categories, and optional linking to plan phases; RLS limits items to owner.

Phase 4: Development Plan Builder
- Template:
  - DevPlan provides pre-filled template entries per phase that users can edit; “Generate from gaps” creates items from top deficits.
- Monthly plan:
  - A simple Month 1–6 structure or per-item due dates allow monthly view; status “Not Started/In Progress/Blocked/Done” tracked; phase roll-up visible.
- Persistence:
  - Plan and items persist; owner RLS enforced.

Phase 5: Sponsor & Evidence Tracking
- Sponsors:
  - Sponsors table exists and is wired to Sponsors.tsx; fields include sponsor_name, sponsor_role, type, visibility cadence, notes; CRUD works under RLS.
- Evidence:
  - Evidence supports categories (por|kpi|artifact|leadership|external_signal|other); filtering and basic search are available; max upload size enforced on client.

Phase 6: Progress Monitoring and Export
- Dashboard:
  - Shows current/target role, readiness, overlap, gap summary, plan status, evidence counts; refresh KPIs recomputes via rpc_recompute_profile.
- Export:
  - Export profile PDF completes successfully with summary, gaps, and plan items; public explore export also available.

## Concrete Fix Recommendations

UI/Routes:
- Add new routes and adjust guards:
  - /explore (public) and /explore/:source/gaps/:target (public).
  - /career-map (alias of /graph with DB-driven data).
  - /assessment (Role Navigator Worksheet).
  - /competencies (Self-Rating matrix).
  - /export (optional consolidated export page).
- Implement RoleCard component and integrate with Explore, Career Map, and Compare.
- Update Graph.tsx to fetch roles and role_adjacency from Supabase and enable interactions:
  - Hover: show overlap % and count of gaps (requires role-to-role gap function).
  - Click edge: fetch top-5 gaps via new Edge Function (see API below).
- Update Compare.tsx to show F/P/A/Au labels and mapping; maintain numeric computations internally but display anchors.
- Add “Save as Profile” on public gap page that navigates to login and pre-fills Profile after auth.

APIs/Edge Functions:
- New edge function: fn_gap_roles_public
  - Input: { source_role_code, target_role_code }
  - Output: gap matrix with target/source levels, deltas, and optionally top-5 gaps
  - Auth: allow anonymous read relying only on reference tables (roles, role_competencies); no profile data; ensure public select is allowed by policies on reference tables (already allowed).
- Extend fn_export_profile_pdf or add fn_export_gap_snapshot:
  - Provide role-to-role export for anonymous explore (no PII). Alternatively implement client-side PDF generation for public.

Schema and Policies:
- Add sponsors table (as per Product doc) with RLS owner policies similar to plans/evidence.
- Extend evidence table with category enum and additional fields:
  - category text or enum, evidence_date date, associated_competencies text[], associated_phase text (phase_1..4).
- Add assessments table (profiles-linked) to store worksheet inputs and weighted_scores.
- Consider a target_roles table or JSONB on profiles for 1–3 targets with rank and worksheet scores; update RLS accordingly.

Policy changes:
- Ensure reference tables remain publicly selectable (already in 03_policies.sql).
- Implement RLS policies for sponsors and assessments similar to existing ones.

Frontend integration:
- Update API helpers to support:
  - Public role-to-role gap calls (new function).
  - Sponsors CRUD tied to real sponsors table.
  - Evidence categories and filters.
  - Assessments CRUD and worksheet scoring.

## Prioritized Checklist for Remediation

P0:
- [ ] Add /explore (public) and /explore/:source/gaps/:target public routes with role selector, adjacency ranked table, gap matrix view.
- [ ] Implement RoleCard component and wire to explore and graph views.
- [ ] Replace Graph.tsx static seeds with Supabase roles/role_adjacency; add hover/click interactions.
- [ ] Create edge function for public role-to-role gap analysis (no auth required data).
- [ ] Add sponsors table + RLS; wire Sponsors.tsx to real table.
- [ ] Extend evidence schema with category and fields; update Evidence.tsx to support category and client-side 10MB guard.

P1:
- [ ] Add proficiency label mapping (F/P/A/Au) across Compare, Explore gap, Dashboard.
- [ ] Add “Save as Profile” CTA in public gap views with auth handoff.
- [ ] Add assessments table + /assessment page for worksheet and scoring; persist and rank targets.
- [ ] Add /competencies self-rating page writing to profile_competencies.
- [ ] Enhance DevPlan templates per Product doc and implement optional “Apply template” to seed plan items.

P2:
- [ ] Route aliases (/career-map, /export) and navigation updates.
- [ ] Graph advanced interactions (edge click top-5 gaps, path highlighting).
- [ ] Evidence UI polish: category filters, search, and phase linking.
- [ ] Public gap export as PDF or image (client-side or new function).

## Mapping Appendix: Implementation References

- Authentication and guards: frontend_cnp_app/src/App.tsx
- Dashboard KPIs and gap integration: frontend_cnp_app/src/routes/Dashboard.tsx
- Profile editor and KPI recompute: frontend_cnp_app/src/routes/Profile.tsx
- Compare page (gap matrix): frontend_cnp_app/src/routes/Compare.tsx
- Graph page (D3 + static seeds): frontend_cnp_app/src/routes/Graph.tsx
- Evidence vault: frontend_cnp_app/src/routes/Evidence.tsx
- Dev plan builder: frontend_cnp_app/src/routes/DevPlan.tsx
- Sponsors management: frontend_cnp_app/src/routes/Sponsors.tsx
- Gap analysis Edge Function (profile-based): supabase/functions/rpc_gap_analysis/index.ts
- Recompute profile KPIs: supabase/functions/rpc_recompute_profile/index.ts
- Export profile PDF: supabase/functions/fn_export_profile_pdf/index.ts
- Schema and RLS: supabase/schema/01_tables.sql, 02_rls.sql, 03_policies.sql

## Notes on Data Seeding

Validate that Admin seeding (seed_upsert) ingests:
- Role cards into roles table with adequate descriptive fields.
- Competency mapping into competencies and role_competencies with normalized numeric targets (and mapping to F/P/A/Au).
- Role adjacency into role_adjacency with normalized weight (0..1).

If gaps exist in descriptive columns, extend roles table to include structured JSONB for key_decisions, conversations, and readiness_signals, or denormalize into columns as needed to support RoleCard UI.

## Acceptance Test Matrix (abbreviated)

- Public Explore flow:
  - Without being logged in, navigate to /explore, select “CA”, see ranked adjacency; click “CTO” → see gap page; export snapshot; click “Save as Profile”, login, land on Dashboard with profile pre-filled.
- Profile-Based flow:
  - Login, edit Profile with current and 3 target roles; open /assessment and score; top target correctly ranked; open /competencies and rate self; Dashboard shows readiness and top gaps; DevPlan “Generate from gaps” creates actions; Sponsors CRUD works and RLS enforced; Evidence upload with category works and file size checked; Export PDF produces signed URL or client-side download.

## Risks and Considerations

- Public gap analysis must avoid any PII and should rely solely on reference tables permitted for anonymous select.
- RLS must be carefully applied for any new tables (assessments, sponsors) to prevent data leaks.
- Mapping numeric levels to F/P/A/Au must be consistent across seeding and UI; choose an internal scale (e.g., 0..3) or normalized 0..100 with buckets.
- DevPlan monthly structure may require additional schema or robust UI encoding; consider iterative approach (start with due_date + grouping by month).

## References (source files used)

- attachments/20251127_081035_Career_Navigator_MVP_-_Product_Document.pdf
- career-navigator-215143-215152/supabase/schema/01_tables.sql
- career-navigator-215143-215152/supabase/schema/02_rls.sql
- career-navigator-215143-215152/supabase/schema/03_policies.sql
- career-navigator-215143-215152/supabase/functions/rpc_gap_analysis/index.ts
- career-navigator-215143-215152/supabase/functions/rpc_recompute_profile/index.ts
- career-navigator-215143-215152/supabase/functions/fn_export_profile_pdf/index.ts
- career-navigator-215143-215152/frontend_cnp_app/src/App.tsx
- career-navigator-215143-215152/frontend_cnp_app/src/routes/Dashboard.tsx
- career-navigator-215143-215152/frontend_cnp_app/src/routes/Profile.tsx
- career-navigator-215143-215152/frontend_cnp_app/src/routes/Compare.tsx
- career-navigator-215143-215152/frontend_cnp_app/src/routes/Graph.tsx
- career-navigator-215143-215152/frontend_cnp_app/src/routes/DevPlan.tsx
- career-navigator-215143-215152/frontend_cnp_app/src/routes/Evidence.tsx
- career-navigator-215143-215152/frontend_cnp_app/src/routes/Sponsors.tsx
