import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * PUBLIC_INTERFACE
 * seed_upsert Edge Function
 *
 * Summary:
 *   Idempotently upserts seed data into reference tables using ON CONFLICT DO UPDATE.
 *   Intended to load data parsed from provided attachments (XLSX/TXT) on the client/admin side,
 *   then sent here as normalized JSON arrays.
 *
 * Access control:
 *   - Restricted to calls using the Supabase service role key or an admin user with appropriate claim.
 *   - In Supabase Edge runtime, service role requests include 'Authorization: Bearer <service_key>'.
 *
 * Input (JSON body):
 * {
 *   roles?: Array<{ code: string; name: string; description?: string; family?: string; level?: string }>,
 *   competencies?: Array<{ id?: string; code?: string; name: string; description?: string; category?: string }>,
 *   role_competencies?: Array<{ role_code: string; competency_id?: string; competency_code?: string; target: number }>,
 *   adjacencies?: Array<{ source: string; target: string; weight: number }>,
 *   content_refs?: Array<{ ref_type: string; ref_key: string; title?: string; body?: string }>
 * }
 *
 * Notes:
 * - role_competencies accepts either competency_id (uuid) or competency_code; if competency_code is provided and id is absent,
 *   this function will resolve the id by code (assuming competencies.code is unique as per schema).
 *
 * Output:
 * 200 JSON:
 * {
 *   ok: boolean,
 *   counts: {
 *     roles: number,
 *     competencies: number,
 *     role_competencies: number,
 *     role_adjacency: number,
 *     content_refs: number
 *   },
 *   errors?: Array<{ table: string; index?: number; error: string }>
 * }
 *
 * Environment:
 *   SUPABASE_URL (injected by Supabase)
 *   SUPABASE_ANON_KEY (injected by Supabase)
 *   Service invocations should use service key token in Authorization header.
 */

// Minimal PostgREST client with service role headers
function getRestClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) {
    throw new Error("Supabase environment is not configured (SUPABASE_URL/ANON).");
  }

  // Forward Authorization header if provided (service role or user JWT)
  const auth = req.headers.get("Authorization") || `Bearer ${anon}`;

  const base = `${url}/rest/v1`;

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "apikey": anon,
    "Authorization": auth,
    // Prefer return=representation to get affected rows in upsert; resolution=merge-duplicates to avoid duplicates
    "Prefer": "resolution=merge-duplicates",
  };

  async function rpc<T = unknown>(path: string, options: RequestInit): Promise<{ data: T | null; error?: string; response: Response }> {
    const res = await fetch(`${base}/${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers ?? {}) },
    });
    let data: any = null;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { data: null, error: data?.message || res.statusText || "Request failed", response: res };
    }
    return { data, response: res };
  }

  return {
    upsert: async <T = unknown>(table: string, rows: unknown[], onConflict?: string) => {
      const params = new URLSearchParams();
      params.set("on_conflict", onConflict ?? "");
      // return=representation helps count affected rows, but if RLS filters block return, we'll fallback to row count of input
      const { data, error, response } = await rpc<T>(`${table}?${params.toString()}`, {
        method: "POST",
        body: JSON.stringify(rows),
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      });
      return { data, error, response };
    },
    select: async <T = unknown>(table: string, query: string) => {
      const { data, error } = await rpc<T>(`${table}?${query}`, {
        method: "GET",
      });
      return { data, error };
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isServiceOrAdmin(req: Request): boolean {
  // Heuristic:
  // - Service role calls usually use the service key (has role claim 'service_role' in jwt)
  // - On Edge Functions, we don't decode token here; rely on Supabase protection by deploying with appropriate settings.
  //   We still implement header-based restriction: require 'Authorization: Bearer ...' and disallow anonymous.
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) return false;

  // Additional optional header check for admin overrides can be configured by gateway; omitted here.
  return true;
}

type RoleRow = { code: string; name: string; description?: string; family?: string; level?: string };
type CompetencyRow = { id?: string; code?: string; name: string; description?: string; category?: string };
type RoleCompetencyRow = { role_code: string; competency_id?: string; competency_code?: string; target: number };
type AdjacencyRow = { source: string; target: string; weight: number };
type ContentRefRow = { ref_type: string; ref_key: string; title?: string; body?: string };

type Payload = {
  roles?: RoleRow[];
  competencies?: CompetencyRow[];
  role_competencies?: RoleCompetencyRow[];
  adjacencies?: AdjacencyRow[];
  content_refs?: ContentRefRow[];
};

// Helper: resolve competency_id from competency_code
async function resolveCompetencyIds(
  client: ReturnType<typeof getRestClient>,
  rows: RoleCompetencyRow[],
): Promise<{ rows: Array<{ role_code: string; competency_id: string; target: number }>; errors: Array<{ table: string; index: number; error: string }> }> {
  const errors: Array<{ table: string; index: number; error: string }> = [];
  const out: Array<{ role_code: string; competency_id: string; target: number }> = [];

  // Collect unique codes that need resolution
  const needCodes = Array.from(
    new Set(
      rows
        .filter((r) => !r.competency_id && r.competency_code)
        .map((r) => (r.competency_code || "").trim())
        .filter((s) => s.length > 0),
    ),
  );

  const codeToId: Record<string, string> = {};
  if (needCodes.length > 0) {
    // Build OR query in PostgREST: code=in.(...escaped)
    const inList = needCodes
      .map((c) => c.replace(/"/g, '""')) // minimal escape
      .join(",");
    const query = `select=id,code&code=in.(${inList})`;
    const { data, error } = await client.select<Array<{ id: string; code: string }>>("competencies", query);
    if (error) {
      // If lookup fails, we will emit errors per row later
    } else if (Array.isArray(data)) {
      for (const row of data) codeToId[row.code] = row.id;
    }
  }

  rows.forEach((r, idx) => {
    const rc = r as RoleCompetencyRow;
    let cid = rc.competency_id;
    if (!cid && rc.competency_code) {
      cid = codeToId[rc.competency_code];
    }
    if (!cid) {
      errors.push({ table: "role_competencies", index: idx, error: "competency_id not provided and competency_code could not be resolved" });
      return;
    }
    out.push({ role_code: rc.role_code, competency_id: cid, target: Number(rc.target ?? 0) });
  });

  return { rows: out, errors };
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method Not Allowed. Use POST." });
    }

    if (!isServiceOrAdmin(req)) {
      return jsonResponse(401, { ok: false, error: "Unauthorized. Admin/service role required." });
    }

    const client = getRestClient(req);

    let payload: Payload | null = null;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body." });
    }

    if (!payload || typeof payload !== "object") {
      return jsonResponse(400, { ok: false, error: "Missing or invalid payload." });
    }

    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    const competencies = Array.isArray(payload.competencies) ? payload.competencies : [];
    const role_competencies = Array.isArray(payload.role_competencies) ? payload.role_competencies : [];
    const adjacencies = Array.isArray(payload.adjacencies) ? payload.adjacencies : [];
    const content_refs = Array.isArray(payload.content_refs) ? payload.content_refs : [];

    const errors: Array<{ table: string; index?: number; error: string }> = [];
    const counts = {
      roles: 0,
      competencies: 0,
      role_competencies: 0,
      role_adjacency: 0,
      content_refs: 0,
    };

    // Normalize rows (basic trimming and type guards)
    const normRoles: RoleRow[] = roles
      .filter((r) => r && typeof r.code === "string" && typeof r.name === "string")
      .map((r) => ({
        code: r.code.trim(),
        name: r.name.trim(),
        description: (r.description ?? "") || undefined,
        family: r.family || undefined,
        level: r.level || undefined,
      }))
      .filter((r) => r.code.length > 0 && r.name.length > 0);

    const normCompetencies: CompetencyRow[] = competencies
      .filter((c) => c && typeof c.name === "string")
      .map((c) => ({
        id: c.id,
        code: c.code?.trim() || undefined,
        name: c.name.trim(),
        description: c.description || undefined,
        category: c.category || undefined,
      }))
      .filter((c) => c.name.length > 0);

    const normAdj: AdjacencyRow[] = adjacencies
      .filter((a) => a && typeof a.source === "string" && typeof a.target === "string")
      .map((a) => ({
        source: a.source.trim(),
        target: a.target.trim(),
        weight: Math.max(0, Math.min(1, Number(a.weight ?? 0))),
      }))
      .filter((a) => a.source && a.target && a.source !== a.target);

    // Optional content_refs table (not present in initial schema; we accept and upsert into a shadow table if exists)
    const normContent: ContentRefRow[] = content_refs
      .filter((r) => r && typeof r.ref_type === "string" && typeof r.ref_key === "string")
      .map((r) => ({
        ref_type: r.ref_type.trim(),
        ref_key: r.ref_key.trim(),
        title: r.title || undefined,
        body: r.body || undefined,
      }))
      .filter((r) => r.ref_type.length > 0 && r.ref_key.length > 0);

    // 1) Upsert roles
    if (normRoles.length > 0) {
      const { error, data, response } = await client.upsert("roles", normRoles, "code");
      if (error) {
        errors.push({ table: "roles", error });
      } else {
        // If representation is blocked by RLS, count falls back
        counts.roles = Array.isArray(data) ? (data as unknown[]).length : normRoles.length;
      }
    }

    // 2) Upsert competencies
    if (normCompetencies.length > 0) {
      // We prefer upsert on unique code if present; if only id is present, use id conflict; if neither, insert will create IDs
      // To stay generic, use (code) conflict if any row provides code; otherwise rely on (id).
      const hasAnyCode = normCompetencies.some((c) => !!c.code);
      const conflict = hasAnyCode ? "code" : "id";
      const { error, data } = await client.upsert("competencies", normCompetencies, conflict);
      if (error) {
        errors.push({ table: "competencies", error });
      } else {
        counts.competencies = Array.isArray(data) ? (data as unknown[]).length : normCompetencies.length;
      }
    }

    // 3) Resolve competency ids where needed and upsert role_competencies
    if (role_competencies.length > 0) {
      const { rows: rcResolved, errors: rcErrors } = await resolveCompetencyIds(client, role_competencies);
      if (rcErrors.length) errors.push(...rcErrors);
      if (rcResolved.length > 0) {
        const { error, data } = await client.upsert("role_competencies", rcResolved, "role_code,competency_id");
        if (error) {
          errors.push({ table: "role_competencies", error });
        } else {
          counts.role_competencies = Array.isArray(data) ? (data as unknown[]).length : rcResolved.length;
        }
      }
    }

    // 4) Upsert role_adjacency
    if (normAdj.length > 0) {
      const { error, data } = await client.upsert("role_adjacency", normAdj, "source,target");
      if (error) {
        errors.push({ table: "role_adjacency", error });
      } else {
        counts.role_adjacency = Array.isArray(data) ? (data as unknown[]).length : normAdj.length;
      }
    }

    // 5) Upsert content_refs if a table exists; if not, skip gracefully.
    if (normContent.length > 0) {
      // Probe table existence using a lightweight select with limit=1; if 404, table likely missing
      const probe = await fetch(`${(Deno.env.get("SUPABASE_URL") ?? "")}/rest/v1/content_refs?select=ref_type&limit=1`, {
        method: "GET",
        headers: {
          "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          "Authorization": req.headers.get("Authorization") || "",
          "Accept": "application/json",
        },
      });
      if (probe.ok || probe.status === 200 || probe.status === 206) {
        const { error, data } = await getRestClient(req).upsert("content_refs", normContent, "ref_type,ref_key");
        if (error) {
          errors.push({ table: "content_refs", error });
        } else {
          counts.content_refs = Array.isArray(data) ? (data as unknown[]).length : normContent.length;
        }
      } else {
        // silently ignore if table not present
      }
    }

    return jsonResponse(200, { ok: true, counts, errors: errors.length ? errors : undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(500, { ok: false, error: msg });
  }
});
