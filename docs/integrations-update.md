# Frontend Integrations Update

This update aligns the React app with the finalized Supabase schema and helpers.

1) Automatic profile provisioning (ensure_profile)
- On SIGNED_IN and TOKEN_REFRESHED events, the app invokes public.ensure_profile(uid,email,full_name) via RPC (lib/api.ensureCurrentUserProfile) to guarantee a profile row exists.
- Login route also triggers ensure_profile after session creation before redirect.

2) Audit logging hooks
- lib/api.logAuditEvent(event_type, details) calls public.log_audit_event.
- Hooks added in evidence create/upload/delete, plan save, skill progress update, sponsors create/update/delete, and notifications create/mark delivered.
- RLS: server function should attach profile_id = auth.uid().

3) Graph cache with TTL
- lib/api.rpcGapAnalysis optionally uses graph_cache(profile_id, target_role) with TTL from app_config.graph_cache_ttl_seconds.
- If cache is valid, returns it; otherwise calls Edge Function rpc_gap_analysis and upserts cache.

4) Sponsors
- APIs: listSponsors, createSponsor, updateSponsor, deleteSponsor (RLS-scoped).
- UI: routes/Sponsors.tsx with list/create/update/delete, added to nav and routes.

5) Notifications
- APIs: listNotifications, createNotification, markNotificationDelivered (RLS-scoped).
- UI: routes/Notifications.tsx with list/create/mark delivered, added to nav and routes.

6) RLS Compliance
- All table operations use auth.getUser() and profile_id filters where applicable.
- No service-role keys in the browser.

Environment variables
- REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_KEY: Supabase client.
- REACT_APP_FRONTEND_URL: used to build auth redirect URLs.

Prereqs on DB side
- public.ensure_profile(uid uuid, email text, full_name text)
- public.log_audit_event(event_type text, details jsonb)
- Tables with RLS: profiles, sponsors, notifications, evidence, plan_items, graph_cache, app_config, profile_skill_progress
- Policies enforcing profile_id = auth.uid()
