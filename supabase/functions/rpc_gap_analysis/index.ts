import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * PUBLIC_INTERFACE
 * rpc_gap_analysis Edge Function
 *
 * Summary:
 *  Deterministically computes gap analysis for a user's profile toward a target role.
 *  - Enforces authenticated access (no anonymous)
 *  - Uses PostgREST with the caller's JWT to honor RLS policies
 *  - Reads: profiles (own), role_competencies (ref), competencies (ref), profile_competencies (own)
 *  - Computes readiness R = 1 - D/Dmax with D = sum(max(0, T-L)), Dmax = sum(T)
 *  - Returns full explainability breakdown and a lightweight D3 graph dataset
 *
 * Input (JSON body):
 * {
 *   profile_id?: string,          // optional; if omitted, uses auth.uid() from JWT
 *   target_role_code?: string     // optional; if omitted, uses profiles.role_target_code for the user
 * }
 *
 * Output (200 JSON):
 * {
 *   profile_id: string,
 *   target_role_code: string,
 *   readiness: number,         // 0..1
 *   deficit: number,           // D
 *   deficitMax: number,        // Dmax
 *   overlap: number,           // 0..1
 *   breakdown: Array<{
 *     competency_id: string,
 *     competency_code?: string | null,
 *     competency_name?: string | null,
 *     role_target: number,
 *     profile_level: number,
 *     delta: number,
 *     traffic: "Green" | "Amber" | "Red"
 *   }>,
 *   vectors: {
 *     targets: Record<string, number>,
 *     levels: Record<string, number>,
 *     deltas: Record<string, number>
 *   },
 *   d3: {
 *     nodes: Array<{ id: string; label: string; x: number; y: number }>,
 *     links: Array<{ source: string; target: string; weight: number }>
 *   }
 * }
 *
 * Notes:
 * - All selects respect RLS by forwarding the user's Authorization header to PostgREST.
 * - If target_role_code is not provided and profile has none, returns 400.
 * - Competency positions for D3 are deterministically derived from a simple string hash on competency_id.
 */

type GapInput = {
  profile_id?: string;
  target_role_code?: string;
};

type ProfileRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role_current_code?: string | null;
  role_target_code?: string | null;
};

type RoleCompRow = {
  role_code: string;
  competency_id: string;
  target: number;
};

type CompRow = {
  id: string;
  code?: string | null;
  name?: string | null;
};

type ProfileCompRow = {
  profile_id: string;
  competency_id: string;
  level: number;
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

// Deterministic hash and layout helpers (copied concept from frontend but simplified)

/** Deterministic hash of a string -> positive 32-bit int */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Place nodes deterministically on a circle for stable D3 positions */
function deriveD3ForCompetencies(
  competencies: Array<{ id: string; label: string }>,
  radius = 120,
): {
  nodes: Array<{ id: string; label: string; x: number; y: number }>;
  links: Array<{ source: string; target: string; weight: number }>;
} {
  const nodes = competencies.map((c) => {
    const h = hashCode(c.id);
    const angle = ((h % 3600) / 3600) * 2 * Math.PI;
    return {
      id: c.id,
      label: c.label,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
  // No competency-to-competency links in MVP; return empty for now.
  const links: Array<{ source: string; target: string; weight: number }> = [];
  return { nodes, links };
}

/** Traffic light thresholds used for per-competency attainment */
const TRAFFIC = { green: 0.7, amber: 0.4 };

/** Compute readiness and breakdown using deterministic D/Dmax formula */
function computeGap(
  roleTargets: RoleCompRow[],
  profileLevels: ProfileCompRow[],
  compMeta: Record<string, { code?: string | null; name?: string | null }>,
) {
  const levelsById: Record<string, number> = {};
  for (const pl of profileLevels) {
    levelsById[pl.competency_id] = Number(pl.level ?? 0);
  }

  let D = 0;
  let Dmax = 0;
  const breakdown: Array<{
    competency_id: string;
    competency_code?: string | null;
    competency_name?: string | null;
    role_target: number;
    profile_level: number;
    delta: number;
    traffic: "Green" | "Amber" | "Red";
  }> = [];

  const targetsVec: Record<string, number> = {};
  const levelsVec: Record<string, number> = {};
  const deltasVec: Record<string, number> = {};

  for (const rc of roleTargets) {
    const id = rc.competency_id;
    const T = Number(rc.target ?? 0);
    const L = Number(levelsById[id] ?? 0);
    const delta = Math.max(0, T - L);

    D += delta;
    Dmax += Math.max(0, T);

    const pct = T === 0 ? 1 : Math.max(0, Math.min(1, L / (T || 1)));
    const traffic: "Green" | "Amber" | "Red" =
      pct >= TRAFFIC.green ? "Green" : pct >= TRAFFIC.amber ? "Amber" : "Red";

    const meta = compMeta[id] || {};
    breakdown.push({
      competency_id: id,
      competency_code: meta.code ?? null,
      competency_name: meta.name ?? null,
      role_target: T,
      profile_level: L,
      delta,
      traffic,
    });

    targetsVec[id] = T;
    levelsVec[id] = L;
    deltasVec[id] = delta;
  }

  breakdown.sort((a, b) => b.delta - a.delta);
  const readiness = Dmax > 0 ? 1 - D / Dmax : 1;
  const overlap = Dmax > 0 ? Math.max(0, Math.min(1, (Dmax - D) / Dmax)) : 1;

  return {
    readiness,
    deficit: D,
    deficitMax: Dmax,
    overlap,
    breakdown,
    vectors: { targets: targetsVec, levels: levelsVec, deltas: deltasVec },
  };
}

// Minimal PostgREST wrapper that forwards the caller's JWT (RLS-safe)
function getPostgrest(req: Request) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) {
    throw new Error("Supabase environment is not configured (SUPABASE_URL/ANON).");
  }
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
    if (!res.ok) {
      return { data: null as T | null, error: data?.message || res.statusText };
    }
    return { data: data as T, error: undefined };
  }

  return { get };
}

serve(async (req) => {
  try {
    // 1) Require authenticated user
    requireAuth(req);

    // 2) Parse input
    let payload: GapInput | null = null;
    try {
      payload = await req.json();
    } catch {
      // Allow empty body (optional inputs)
      payload = {};
    }

    const client = getPostgrest(req);

    // 3) Resolve current user id via /auth endpoint (Edge functions do not directly expose auth.uid())
    // Workaround: query profiles table filtered by RLS using 'select=id' limit=1 combined with eq(id, auth.uid())
    // However, PostgREST cannot inject auth.uid() in URL; instead, we fetch the current user's own profile by selecting all and relying on RLS to only return own row.
    const { data: myProfiles, error: profErr } = await client.get<ProfileRow[]>("profiles", {
      select: "id,role_target_code",
      limit: 1,
    });

    if (profErr) return json(401, { error: "Unauthorized or profile not accessible", details: profErr });

    const callerProfile: ProfileRow | undefined = Array.isArray(myProfiles) && myProfiles.length > 0 ? myProfiles[0] : undefined;
    if (!callerProfile?.id) {
      return json(401, { error: "Unauthorized: profile not found. Ensure you are signed in and have a profile row." });
    }

    // Prefer provided profile_id only if it equals the caller's id (RLS will also enforce)
    const profileId = payload?.profile_id && payload.profile_id === callerProfile.id
      ? payload.profile_id
      : callerProfile.id;

    // 4) Resolve target role code: prefer provided else use profile.role_target_code
    let targetRoleCode = (payload?.target_role_code || callerProfile.role_target_code || "").trim();
    if (!targetRoleCode) {
      return json(400, { error: "Missing target_role_code and profile has no role_target_code set." });
    }

    // 5) Fetch reference role competency targets
    const { data: roleTargets, error: rcErr } = await client.get<RoleCompRow[]>("role_competencies", {
      select: "role_code,competency_id,target",
      role_code: `eq.${targetRoleCode}`,
    } as any);
    if (rcErr) return json(400, { error: "Failed to load role competencies", details: rcErr });

    const roleComps: RoleCompRow[] = Array.isArray(roleTargets) ? roleTargets : [];
    if (roleComps.length === 0) {
      return json(404, { error: "No competency targets found for target role", target_role_code: targetRoleCode });
    }

    // 6) Fetch competencies metadata for labels
    const compIds = Array.from(new Set(roleComps.map((r) => r.competency_id)));
    let compMeta: Record<string, { code?: string | null; name?: string | null }> = {};

    if (compIds.length > 0) {
      // PostgREST in.() needs comma-separated list inside parentheses; URL-encoded commas are handled by PostgREST.
      const inList = compIds.join(",");
      const { data: comps, error: cErr } = await client.get<CompRow[]>("competencies", {
        select: "id,code,name",
        id: `in.(${inList})`,
      } as any);
      if (!cErr && Array.isArray(comps)) {
        compMeta = comps.reduce((acc, c) => {
          acc[c.id] = { code: c.code ?? null, name: c.name ?? null };
          return acc;
        }, {} as Record<string, { code?: string | null; name?: string | null }>);
      }
    }

    // 7) Fetch user's profile competency levels (RLS ensures only own rows are returned)
    const { data: levels, error: lvlErr } = await client.get<ProfileCompRow[]>("profile_competencies", {
      select: "profile_id,competency_id,level",
      profile_id: `eq.${profileId}`,
    } as any);
    if (lvlErr) return json(400, { error: "Failed to load profile competencies", details: lvlErr });

    const profLevels: ProfileCompRow[] = Array.isArray(levels) ? levels : [];

    // 8) Compute gap metrics
    const gap = computeGap(roleComps, profLevels, compMeta);

    // 9) Build D3 dataset from competencies in this analysis (deterministic positions)
    const d3 = deriveD3ForCompetencies(
      compIds.map((id) => ({
        id,
        label: compMeta[id]?.name || compMeta[id]?.code || id,
      })),
      140,
    );

    // 10) Response payload
    return json(200, {
      profile_id: profileId,
      target_role_code: targetRoleCode,
      readiness: gap.readiness,
      deficit: gap.deficit,
      deficitMax: gap.deficitMax,
      overlap: gap.overlap,
      breakdown: gap.breakdown,
      vectors: gap.vectors,
      d3,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json(500, { error: msg });
  }
});
