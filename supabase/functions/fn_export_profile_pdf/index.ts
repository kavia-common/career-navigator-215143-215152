import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * PUBLIC_INTERFACE
 * fn_export_profile_pdf Edge Function
 *
 * Summary:
 *  Generates a PDF report for the authenticated user's profile (or a provided profile_id equal to the caller),
 *  including profile summary, competency gap analysis (leveraging the rpc_gap_analysis Edge Function or direct RLS-safe selects),
 *  and development plan items. The PDF is written to the 'exports' private storage bucket at:
 *    exports/{user_id}/profile_{timestamp}.pdf
 *  and the function returns JSON with { path, signed_url, created_at }.
 *
 * Access control:
 *  - Requires authenticated user (Authorization: Bearer <jwt>).
 *  - All reads are done via PostgREST forwarding the caller JWT to honor RLS policies.
 *  - Storage write uses service-level storage API with the caller's JWT; ensure a storage policy exists for 'exports' bucket.
 *
 * Input (JSON body):
 * {
 *   profile_id?: string,
 *   user_id?: string,             // alias of profile_id; ignored unless equals caller id
 *   target_role_code?: string     // optional, used for gap analysis if not in profile
 * }
 *
 * Output (200 JSON):
 * {
 *   path: string,         // storage object path inside 'exports' bucket
 *   signed_url: string,   // time-limited signed URL for download
 *   created_at: string    // ISO timestamp
 * }
 *
 * Notes:
 * - Uses a minimal internal PDF builder (no external deps) that outputs a basic PDF with embedded text content.
 *   This avoids adding Deno third-party PDF libs in the Edge Function environment.
 * - If rpc_gap_analysis function is deployed, this function calls it for consistent computation. If not available,
 *   it falls back to RLS-safe direct computation within this function (the same D/Dmax method).
 */

type ReqInput = {
  profile_id?: string;
  user_id?: string;
  target_role_code?: string;
};

type ProfileRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role_current_code?: string | null;
  role_target_code?: string | null;
};

type PlanRow = {
  id: string;
  profile_id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

type PlanItemRow = {
  id: string;
  plan_id: string;
  title: string;
  description?: string | null;
  impact?: number | null;
  completion?: number | null;
  due_date?: string | null;
  created_at?: string;
};

type RoleCompRow = {
  role_code: string;
  competency_id: string;
  target: number;
};

type ProfileCompRow = {
  profile_id: string;
  competency_id: string;
  level: number;
};

type CompRow = {
  id: string;
  code?: string | null;
  name?: string | null;
};

type GapBreakdown = {
  competency_id: string;
  competency_code?: string | null;
  competency_name?: string | null;
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

// RLS-safe PostgREST client (forwards Authorization header)
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

  return { get, anon, url, auth };
}

// Attempt to call existing rpc_gap_analysis Edge Function for consistency
async function tryRpcGapAnalysis(
  req: Request,
  input: { profile_id: string; target_role_code?: string }
): Promise<{ ok: boolean; gap?: GapResult; target_role_code?: string; error?: string }> {
  try {
    const functionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/rpc_gap_analysis`;
    const res = await fetch(functionsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": requireAuth(req),
        "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
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
      breakdown: Array.isArray(data.breakdown) ? data.breakdown as GapBreakdown[] : [],
    };
    return { ok: true, gap, target_role_code: data.target_role_code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "rpc_gap_analysis call failed" };
  }
}

// Local fallback computation for gap analysis (matches logic used elsewhere)
const TRAFFIC = { green: 0.7, amber: 0.4 };

function computeGap(
  roleTargets: RoleCompRow[],
  profileLevels: ProfileCompRow[],
  compMeta: Record<string, { code?: string | null; name?: string | null }>,
): GapResult {
  const levels: Record<string, number> = {};
  for (const pl of profileLevels) levels[pl.competency_id] = Number(pl.level ?? 0);

  let D = 0;
  let Dmax = 0;
  const breakdown: GapBreakdown[] = [];

  for (const rc of roleTargets) {
    const id = rc.competency_id;
    const T = Number(rc.target ?? 0);
    const L = Number(levels[id] ?? 0);
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
  }

  breakdown.sort((a, b) => b.delta - a.delta);
  const readiness = Dmax > 0 ? 1 - D / Dmax : 1;
  const overlap = Dmax > 0 ? Math.max(0, Math.min(1, (Dmax - D) / Dmax)) : 1;

  return { readiness, deficit: D, deficitMax: Dmax, overlap, breakdown };
}

/**
 * Minimal PDF builder (very basic text-only PDF).
 * This constructs a single-page PDF with monospaced text lines.
 */
function buildSimplePdf(title: string, sections: Array<{ heading: string; lines: string[] }>): Uint8Array {
  // PDF content stream builder
  const lines: string[] = [];
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  // Simple layout metrics
  const marginLeft = 50;
  const startY = 770;
  const lineHeight = 14;

  // Start PDF objects
  const objects: string[] = [];
  let objIndex = 1;

  // Font object (Builtin Helvetica)
  const fontObjNum = objIndex++;
  objects.push(`${fontObjNum} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj`);

  // Content stream
  let y = startY;
  const pushText = (text: string, bold = false) => {
    // No real bold; just uppercase heading indicator by prefix if needed
    const content = `BT /F1 10 Tf ${marginLeft} ${y} Td (${escape(text)}) Tj ET`;
    y -= lineHeight;
    lines.push(content);
  };

  // Title
  lines.push(`BT /F1 16 Tf ${marginLeft} ${y} Td (${escape(title)}) Tj ET`);
  y -= lineHeight * 2;

  for (const sec of sections) {
    // Heading
    lines.push(`BT /F1 12 Tf ${marginLeft} ${y} Td (${escape(sec.heading)}) Tj ET`);
    y -= lineHeight * 1.5;

    for (const l of sec.lines) {
      if (y < 60) {
        // For simplicity, we won't paginate in MVP; break if overflow
        lines.push(`BT /F1 10 Tf ${marginLeft} ${60} Td (…truncated…) Tj ET`);
        break;
      }
      pushText(l);
    }
    y -= lineHeight * 0.5;
  }

  const contentStream = lines.join("\n");
  const contentBytes = new TextEncoder().encode(contentStream);
  const contentLen = contentBytes.length;

  const contentsObjNum = objIndex++;
  objects.push(`${contentsObjNum} 0 obj
<< /Length ${contentLen} >>
stream
${contentStream}
endstream
endobj`);

  // Page object
  const pageObjNum = objIndex++;
  const pagesObjNum = objIndex++;
  const catalogObjNum = objIndex++;

  objects.push(`${pageObjNum} 0 obj
<< /Type /Page
   /Parent ${pagesObjNum} 0 R
   /MediaBox [0 0 612 792]
   /Resources << /Font << /F1 ${fontObjNum} 0 R >> >>
   /Contents ${contentsObjNum} 0 R
>>
endobj`);

  // Pages object
  objects.push(`${pagesObjNum} 0 obj
<< /Type /Pages /Kids [${pageObjNum} 0 R] /Count 1 >>
endobj`);

  // Catalog object
  objects.push(`${catalogObjNum} 0 obj
<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>
endobj`);

  // Assemble PDF with xref
  const header = "%PDF-1.4\n";
  let body = "";
  const xref: number[] = [];
  let offset = header.length;

  for (const obj of objects) {
    xref.push(offset);
    const objText = obj + "\n";
    body += objText;
    offset += objText.length;
  }

  const xrefStart = offset;
  let xrefTable = "xref\n0 " + (objects.length + 1) + "\n";
  xrefTable += "0000000000 65535 f \n";
  for (const off of xref) {
    xrefTable += (off.toString().padStart(10, "0")) + " 00000 n \n";
  }

  const trailer = `trailer
<< /Size ${objects.length + 1}
   /Root ${catalogObjNum} 0 R
>>
startxref
${xrefStart}
%%EOF`;

  const full = header + body + xrefTable + trailer;
  return new TextEncoder().encode(full);
}

// Upload bytes to Storage 'exports' bucket
async function uploadToExports(
  req: Request,
  path: string,
  bytes: Uint8Array,
): Promise<{ ok: boolean; error?: string }> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) {
    return { ok: false, error: "Supabase environment not configured" };
  }
  const auth = requireAuth(req);
  const res = await fetch(`${url}/storage/v1/object/exports/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "apikey": anon,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || res.statusText };
  }
  return { ok: true };
}

// Create a signed URL for a storage object
async function createSignedUrl(req: Request, path: string, expiresIn: number = 60 * 60): Promise<{ ok: boolean; signed_url?: string; error?: string }> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) {
    return { ok: false, error: "Supabase environment not configured" };
  }
  const auth = requireAuth(req);
  const res = await fetch(`${url}/storage/v1/object/sign/exports/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "apikey": anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    return { ok: false, error: data?.message || res.statusText };
  }
  // Supabase returns { signedURL: "/object/sign/..." } or { signedUrl }
  const signedUrl: string = data?.signedURL || data?.signedUrl || "";
  // If the returned URL is relative, prefix with base
  const absolute = signedUrl.startsWith("http") ? signedUrl : `${url}${signedUrl}`;
  return { ok: true, signed_url: absolute };
}

serve(async (req) => {
  try {
    // Require auth
    const authHdr = requireAuth(req);
    const client = getPostgrest(req);

    // Determine caller's profile (RLS-safe: select returns only own row)
    const { data: myProfiles, error: profErr } = await client.get<ProfileRow[]>("profiles", {
      select: "id,email,full_name,role_current_code,role_target_code",
      limit: 1,
    } as any);
    if (profErr) return json(401, { error: "Unauthorized or profile not accessible", details: profErr });
    const caller: ProfileRow | undefined = Array.isArray(myProfiles) && myProfiles.length ? myProfiles[0] : undefined;
    if (!caller?.id) return json(401, { error: "Unauthorized: profile not found for caller" });

    // Parse input
    let payload: ReqInput = {};
    try {
      payload = await req.json();
    } catch {
      // allow empty body
    }

    // Resolve effective profile_id (only allow using caller's id)
    const requestedProfile = (payload.profile_id || payload.user_id || "").trim();
    const profileId = requestedProfile && requestedProfile === caller.id ? requestedProfile : caller.id;

    // Resolve target role
    let targetRoleCode = (payload.target_role_code || caller.role_target_code || "").trim();

    // Try calling rpc_gap_analysis for consistent computation
    let gap: GapResult | undefined;
    if (profileId) {
      const rpcRes = await tryRpcGapAnalysis(req, { profile_id: profileId, target_role_code: targetRoleCode || undefined });
      if (rpcRes.ok && rpcRes.gap) {
        gap = rpcRes.gap;
        if (!targetRoleCode && rpcRes.target_role_code) targetRoleCode = rpcRes.target_role_code;
      }
    }

    // If rpc call failed or not available, compute locally (RLS-safe reads)
    if (!gap) {
      if (!targetRoleCode) {
        return json(400, { error: "Missing target_role_code and profile has no role_target_code set." });
      }
      const { data: roleTargets, error: rcErr } = await client.get<RoleCompRow[]>("role_competencies", {
        select: "role_code,competency_id,target",
        role_code: `eq.${targetRoleCode}`,
      } as any);
      if (rcErr) return json(400, { error: "Failed to load role competencies", details: rcErr });
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
      const { data: levels, error: lvlErr } = await client.get<ProfileCompRow[]>("profile_competencies", {
        select: "profile_id,competency_id,level",
        profile_id: `eq.${profileId}`,
      } as any);
      if (lvlErr) return json(400, { error: "Failed to load profile competencies", details: lvlErr });
      const plRows: ProfileCompRow[] = Array.isArray(levels) ? levels : [];
      gap = computeGap(rcRows, plRows, compMeta);
    }

    // Fetch latest plan and items (optional section)
    let latestPlan: PlanRow | null = null;
    let planItems: PlanItemRow[] = [];
    {
      const { data: plans } = await client.get<PlanRow[]>("plans", {
        select: "id,profile_id,title,created_at,updated_at",
        profile_id: `eq.${profileId}`,
        order: "updated_at.desc",
        limit: 1,
      } as any);
      if (Array.isArray(plans) && plans.length) {
        latestPlan = plans[0];
        const { data: items } = await client.get<PlanItemRow[]>("plan_items", {
          select: "id,plan_id,title,description,impact,completion,due_date,created_at",
          plan_id: `eq.${latestPlan.id}`,
          order: "created_at.asc",
        } as any);
        if (Array.isArray(items)) planItems = items;
      }
    }

    // Prepare PDF content sections
    const createdAt = new Date().toISOString();
    const title = "Career Navigator — Profile Report";

    const profileSection = {
      heading: "Profile Summary",
      lines: [
        `User ID: ${caller.id}`,
        `Email: ${caller.email ?? ""}`,
        `Full Name: ${caller.full_name ?? ""}`,
        `Current Role: ${caller.role_current_code ?? ""}`,
        `Target Role: ${targetRoleCode || caller.role_target_code || ""}`,
        `Generated at: ${createdAt}`,
      ],
    };

    const gapHeaderLines = [
      `Readiness: ${((gap.readiness || 0) * 100).toFixed(0)}%`,
      `Overlap: ${((gap.overlap || 0) * 100).toFixed(0)}%`,
      `Deficit: ${gap.deficit?.toFixed(2) ?? "0"} / ${gap.deficitMax?.toFixed(2) ?? "0"}`,
      `Top Gaps:`,
    ];
    const topBreakdown = (gap.breakdown || []).slice(0, 12).map((b, idx) => {
      const name = b.competency_name || b.competency_code || b.competency_id;
      return `${(idx + 1).toString().padStart(2, "0")}. ${name} — target ${b.role_target}, level ${b.profile_level}, gap ${b.delta} [${b.traffic}]`;
    });
    const gapSection = {
      heading: "Competency Gap Analysis",
      lines: [...gapHeaderLines, ...topBreakdown],
    };

    const planSection = {
      heading: "Development Plan",
      lines: latestPlan
        ? [
            `Plan: ${latestPlan.title}`,
            ...(planItems.length
              ? planItems.map((it, i) => {
                  const parts = [
                    `${(i + 1).toString().padStart(2, "0")}. ${it.title}`,
                    it.description ? `   - ${it.description}` : "",
                    typeof it.impact === "number" ? `   - Impact: ${it.impact}` : "",
                    typeof it.completion === "number" ? `   - Completion: ${it.completion}%` : "",
                    it.due_date ? `   - Due: ${it.due_date}` : "",
                  ].filter(Boolean);
                  return parts.join("\n");
                })
              : ["(No items)"]),
          ]
        : ["No plan found for this profile."],
    };

    const pdfBytes = buildSimplePdf(title, [profileSection, gapSection, planSection]);

    // Construct storage path and upload
    const userId = caller.id;
    const ts = Date.now();
    const path = `${userId}/profile_${ts}.pdf`;

    const uploadRes = await uploadToExports(req, path, pdfBytes);
    if (!uploadRes.ok) return json(500, { error: "Failed to store PDF", details: uploadRes.error });

    const signed = await createSignedUrl(req, path, 60 * 60); // 1 hour
    if (!signed.ok) return json(500, { error: "Failed to create signed URL", details: signed.error });

    return json(200, { path, signed_url: signed.signed_url, created_at: createdAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json(500, { error: msg });
  }
});
