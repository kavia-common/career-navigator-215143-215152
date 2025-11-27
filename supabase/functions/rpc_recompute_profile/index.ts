import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * PUBLIC_INTERFACE
 * rpc_recompute_profile Edge Function
 *
 * Purpose:
 * - Recompute key profile KPIs and persist them in a RLS-safe manner, then return the updated KPI set.
 *   KPIs include:
 *     • readiness score (computed via existing rpc_gap_analysis Edge Function or local fallback)
 *     • counts: profile_competencies entries, evidence items, completed skills (proxy via plan_items with completion=100)
 *     • timestamps
 *
 * Access:
 * - Requires authenticated user (Bearer JWT). All reads/writes are performed via PostgREST forwarding caller JWT,
 *   ensuring RLS safety.
 *
 * Input (JSON):
 * {
 *   profile_id?: string,        // optional; must equal caller id if provided
 *   target_role_code?: string   // optional; used for readiness computation if not set on profile
 * }
 *
 * Output (200 JSON):
 * {
 *   profile_id: string,
 *   target_role_code?: string,
 *   readiness: number,                // 0..1
 *   deficit: number,
 *   deficitMax: number,
 *   overlap: number,
 *   counts: {
 *     competencies: number,
 *     evidence: number,
 *     plan_items: number,
 *     completed_items: number
 *   },
 *   updated_at: string
 * }
 *
 * Notes:
 * - This function assumes a table public.profile_kpis exists to persist KPIs. If not present yet, it will no-op persistence
 *   and still return the calculated KPIs to the caller.
 *   Suggested schema:
 *     create table if not exists public.profile_kpis (
 *       profile_id uuid primary key references public.profiles(id) on delete cascade,
 *       readiness numeric,
 *       deficit numeric,
 *       deficit_max numeric,
 *       overlap numeric,
 *       competencies_count integer,
 *       evidence_count integer,
 *       plan_items_count integer,
 *       completed_items_count integer,
 *       target_role_code text,
 *       updated_at timestamptz not null default now()
 *     );
 *   RLS policies should allow select/upsert for owner (profile_id = auth.uid()).
 */

type ReqInput = {
  profile_id?: string;
  target_role_code?: string;
};

type ProfileRow = {
  id: string;
  role_target_code?: string | null;
};

type GapBreakdown = {
  competency_id: string;
  role_target: number;
  profile_level: number;
  delta: number;
  traffic: "Green" | "Amber" | "Red";
};

type GapResult = {
  readiness: number;
  deficit: number;
  deficitMax: number;
  overlap: number;
  breakdown: GapBreakdown[];
  target_role_code?: string;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function requireAuth(req: Request): string {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    throw new Error("Unauthorized: missing bearer token");
  }
  return auth;
}

// Minimal RLS-safe PostgREST client
function getPostgrest(req: Request) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) throw new Error("Supabase environment missing (SUPABASE_URL / SUPABASE_ANON_KEY).");
  const base = `${url}/rest/v1`;
  const auth = req.headers.get("Authorization") || `Bearer ${anon}`;

  async function get<T = unknown>(path: string, params: Record<string, string | number> = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    const res = await fetch(`${base}/${path}${qs.toString() ? `?${qs.toString()}` : ""}`, {
      method: "GET",
      headers: {
        "apikey": anon,
        "Authorization": auth,
        "Accept": "application/json",
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) return { data: null as T | null, error: data?.message || res.statusText };
    return { data: data as T, error: undefined };
  }

  async function upsert<T = unknown>(table: string, rows: unknown, onConflict?: string) {
    const params = new URLSearchParams();
    if (onConflict) params.set("on_conflict", onConflict);
    const res = await fetch(`${base}/${table}?${params.toString()}`, {
      method: "POST",
      headers: {
        "apikey": anon,
        "Authorization": auth,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(rows),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) return { data: null as T | null, error: data?.message || res.statusText, status: res.status };
    return { data: data as T, status: res.status, error: undefined };
  }

  return { get, upsert, url, anon, auth };
}

// Try calling the existing rpc_gap_analysis function for consistent readiness calculation
async function callRpcGapAnalysis(
  req: Request,
  input: { profile_id: string; target_role_code?: string }
): Promise<{ ok: boolean; gap?: GapResult; error?: string }> {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/rpc_gap_analysis`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": requireAuth(req),
        "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profile_id: input.profile_id,
        target_role_code: input.target_role_code,
      }),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return { ok: false, error: data?.error || res.statusText };
    }
    const gap: GapResult = {
      readiness: Number(data.readiness ?? 0),
      deficit: Number(data.deficit ?? 0),
      deficitMax: Number(data.deficitMax ?? 0),
      overlap: Number(data.overlap ?? 0),
      breakdown: Array.isArray(data.breakdown) ? data.breakdown : [],
      target_role_code: data.target_role_code,
    };
    return { ok: true, gap };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "rpc_gap_analysis call failed" };
  }
}

// Local fallback readiness calculation (simple D/Dmax method)
const TRAFFIC = { green: 0.7, amber: 0.4 };
type RoleCompRow = { role_code: string; competency_id: string; target: number };
type ProfileCompRow = { profile_id: string; competency_id: string; level: number };
type CompRow = { id: string; code?: string | null; name?: string | null };

function computeGapLocal(
  roleTargets: RoleCompRow[],
  levels: ProfileCompRow[],
  compMeta: Record<string, { code?: string | null; name?: string | null }>
): GapResult {
  const levelById: Record<string, number> = {};
  for (const r of levels) levelById[r.competency_id] = Number(r.level ?? 0);

  let D = 0;
  let Dmax = 0;
  const breakdown: GapBreakdown[] = [];

  for (const t of roleTargets) {
    const id = t.competency_id;
    const T = Number(t.target ?? 0);
    const L = Number(levelById[id] ?? 0);
    const delta = Math.max(0, T - L);
    D += delta;
    Dmax += Math.max(0, T);

    const pct = T === 0 ? 1 : Math.max(0, Math.min(1, L / (T || 1)));
    const traffic: "Green" | "Amber" | "Red" =
      pct >= TRAFFIC.green ? "Green" : pct >= TRAFFIC.amber ? "Amber" : "Red";

    breakdown.push({
      competency_id: id,
      role_target: T,
      profile_level: L,
      delta,
      traffic,
    });
  }

  breakdown.sort((a, b) => b.delta - a.delta);
  const readiness = Dmax > 0 ? 1 - D / Dmax : 1;
  const overlap = Dmax > 0 ? Math.max(0, Math.min(1, (Dmax - D) / Dmax)) : 1;

  return { readiness, deficit: D, deficitMax: Dmax, overlap, breakdown };
}

serve(async (req) => {
  try {
    // Auth required
    requireAuth(req);

    // Parse input
    let payload: ReqInput = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const client = getPostgrest(req);

    // Resolve caller profile (RLS ensures only own row is returned)
    const { data: profs, error: profErr } = await client.get<ProfileRow[]>("profiles", {
      select: "id,role_target_code",
      limit: 1,
    } as any);
    if (profErr) return json(401, { error: "Unauthorized or profile not found", details: profErr });

    const caller: ProfileRow | undefined = Array.isArray(profs) && profs.length ? profs[0] : undefined;
    if (!caller?.id) return json(401, { error: "Unauthorized: profile missing" });

    // Effective profile id must be caller
    const requestedProfile = (payload.profile_id || "").trim();
    const profileId = requestedProfile && requestedProfile === caller.id ? requestedProfile : caller.id;

    // Resolve target role code
    let targetRoleCode = (payload.target_role_code || caller.role_target_code || "").trim();

    // 1) Compute readiness via rpc_gap_analysis if available
    let gap: GapResult | undefined;
    const rpcRes = await callRpcGapAnalysis(req, { profile_id: profileId, target_role_code: targetRoleCode || undefined });
    if (rpcRes.ok && rpcRes.gap) {
      gap = rpcRes.gap;
      if (!targetRoleCode && rpcRes.gap.target_role_code) targetRoleCode = rpcRes.gap.target_role_code;
    }

    // 2) Fallback to local RLS-safe computation if rpc not available
    if (!gap) {
      if (!targetRoleCode) {
        return json(400, { error: "Missing target_role_code and profile has no role_target_code set." });
      }
      const { data: roleTargets, error: rtErr } = await client.get<RoleCompRow[]>("role_competencies", {
        select: "role_code,competency_id,target",
        role_code: `eq.${targetRoleCode}`,
      } as any);
      if (rtErr) return json(400, { error: "Failed to load role competencies", details: rtErr });
      const rcRows: RoleCompRow[] = Array.isArray(roleTargets) ? roleTargets : [];
      if (!rcRows.length) return json(404, { error: "No competency targets found for target role", target_role_code: targetRoleCode });

      const compIds = Array.from(new Set(rcRows.map(r => r.competency_id)));
      let compMeta: Record<string, { code?: string | null; name?: string | null }> = {};
      if (compIds.length) {
        const inList = compIds.join(",");
        const { data: comps } = await client.get<CompRow[]>("competencies", {
          select: "id,code,name",
          id: `in.(${inList})`,
        } as any);
        if (Array.isArray(comps)) {
          compMeta = comps.reduce((acc, c) => {
            acc[c.id] = { code: c.code ?? null, name: c.name ?? null };
            return acc;
          }, {} as Record<string, { code?: string | null; name?: string | null }>);
        }
      }
      const { data: levels, error: lvErr } = await client.get<ProfileCompRow[]>("profile_competencies", {
        select: "profile_id,competency_id,level",
        profile_id: `eq.${profileId}`,
      } as any);
      if (lvErr) return json(400, { error: "Failed to load profile competencies", details: lvErr });
      const plRows: ProfileCompRow[] = Array.isArray(levels) ? levels : [];

      gap = computeGapLocal(rcRows, plRows, compMeta);
    }

    // 3) Counts (RLS ensures only own rows)
    // profile_competencies count
    const { data: compRows } = await client.get<Array<{ competency_id: string }>>("profile_competencies", {
      select: "competency_id",
      profile_id: `eq.${profileId}`,
    } as any);
    const competenciesCount = Array.isArray(compRows) ? compRows.length : 0;

    // evidence count
    const { data: evidRows } = await client.get<Array<{ id: string }>>("evidence", {
      select: "id",
      profile_id: `eq.${profileId}`,
    } as any);
    const evidenceCount = Array.isArray(evidRows) ? evidRows.length : 0;

    // plan items counts (need to join via plans owner, but RLS policy on plan_items already enforces owner via EXISTS)
    const { data: itemsRows } = await client.get<Array<{ id: string; completion?: number | null }>>("plan_items", {
      select: "id,completion",
      // No filter needed; RLS returns only items belonging to caller's plans
    } as any);
    const planItemsCount = Array.isArray(itemsRows) ? itemsRows.length : 0;
    const completedItemsCount = Array.isArray(itemsRows)
      ? itemsRows.filter((r) => typeof r.completion === "number" && Number(r.completion) >= 100).length
      : 0;

    const updatedAt = new Date().toISOString();

    // 4) Persist to profile_kpis if table exists (best-effort)
    let persisted = false;
    try {
      // Probe table existence via select limit=0
      const probe = await fetch(`${client.url}/rest/v1/profile_kpis?select=profile_id&limit=0`, {
        method: "GET",
        headers: {
          "apikey": client.anon,
          "Authorization": client.auth,
          "Accept": "application/json",
        },
      });
      if (probe.ok || probe.status === 200 || probe.status === 206) {
        const upsertPayload = [{
          profile_id: profileId,
          readiness: gap.readiness,
          deficit: gap.deficit,
          deficit_max: gap.deficitMax,
          overlap: gap.overlap,
          competencies_count: competenciesCount,
          evidence_count: evidenceCount,
          plan_items_count: planItemsCount,
          completed_items_count: completedItemsCount,
          target_role_code: targetRoleCode || null,
          updated_at: updatedAt,
        }];
        const res = await client.upsert("profile_kpis", upsertPayload, "profile_id");
        if (!res.error) persisted = true;
      }
    } catch {
      // ignore persistence issues; still return computed KPIs
    }

    // 5) Return KPI set
    return json(200, {
      profile_id: profileId,
      target_role_code: targetRoleCode || null,
      readiness: gap.readiness,
      deficit: gap.deficit,
      deficitMax: gap.deficitMax,
      overlap: gap.overlap,
      counts: {
        competencies: competenciesCount,
        evidence: evidenceCount,
        plan_items: planItemsCount,
        completed_items: completedItemsCount,
      },
      updated_at: updatedAt,
      persisted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json(500, { error: msg });
  }
});
