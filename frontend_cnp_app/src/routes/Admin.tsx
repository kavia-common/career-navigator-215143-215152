import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";
import { seedUpsert } from "../lib/api";

/**
 * Admin Console
 * - Restricts access to admin users by checking table public.admin_users (email or user_id)
 * - Allows uploading/choosing provided attachments (xlsx/txt)
 * - Deterministically parses into: roles, competencies, role_competencies, adjacencies
 * - Shows preview counts and simple diffs vs existing DB
 * - Sends idempotent payload to seed_upsert Edge Function
 */

// Types for parsed payload
type RoleRow = { code: string; name: string; description?: string; family?: string; level?: string };
type CompetencyRow = { id?: string; code?: string; name: string; description?: string; category?: string };
type RoleCompetencyRow = { role_code: string; competency_id?: string; competency_code?: string; target: number };
type AdjacencyRow = { source: string; target: string; weight: number };

type ParsedPayload = {
  roles: RoleRow[];
  competencies: CompetencyRow[];
  role_competencies: RoleCompetencyRow[];
  adjacencies: AdjacencyRow[];
};

type DiffSummary = {
  roles: { newCount: number; totalAfter: number };
  competencies: { newCount: number; totalAfter: number };
  role_competencies: { newCount: number; totalAfter: number };
  adjacencies: { newCount: number; totalAfter: number };
};

// Internal helper: normalize header keys
function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

// Internal helper: read file as ArrayBuffer / text
async function readFile(file: File): Promise<{ buffer?: ArrayBuffer; text?: string; ext: string }> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return { buffer, ext };
  } else {
    const text = await file.text();
    return { text, ext };
  }
}

// Deterministic parser for XLSX sheets based on expected columns
function parseXlsx(buffer: ArrayBuffer): Partial<ParsedPayload> {
  const wb = XLSX.read(buffer, { type: "array" });
  const out: Partial<ParsedPayload> = {};

  const allSheets = wb.SheetNames;

  // Heuristics to detect sheet purposes by header fields
  for (const sheetName of allSheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!rows.length) continue;

    const headers = Object.keys(rows[0]).map(normalizeKey);
    const has = (k: string) => headers.includes(k);

    // Roles: expect code, name; optional description, family, level
    if (has("code") && has("name") && (!has("competency_id") && !has("competency_code")) && !has("source")) {
      const roles: RoleRow[] = rows
        .map((r) => ({
          code: String(r[Object.keys(r).find((k) => normalizeKey(k) === "code") as string] ?? "").trim(),
          name: String(r[Object.keys(r).find((k) => normalizeKey(k) === "name") as string] ?? "").trim(),
          description: String(r[Object.keys(r).find((k) => normalizeKey(k) === "description") as string] ?? "").trim() || undefined,
          family: String(r[Object.keys(r).find((k) => normalizeKey(k) === "family") as string] ?? "").trim() || undefined,
          level: String(r[Object.keys(r).find((k) => normalizeKey(k) === "level") as string] ?? "").trim() || undefined,
        }))
        .filter((r) => r.code && r.name);
      out.roles = [...(out.roles || []), ...roles];
      continue;
    }

    // Competencies: expect name; optional id/code/description/category
    if (has("name") && !has("role_code") && !has("source")) {
      // But avoid accidentally parsing non-competency sheets that also have "name" only. Use presence of category or code or description to bias.
      const competencies: CompetencyRow[] = rows
        .map((r) => ({
          id: String(r[Object.keys(r).find((k) => normalizeKey(k) === "id") as string] ?? "").trim() || undefined,
          code: String(r[Object.keys(r).find((k) => normalizeKey(k) === "code") as string] ?? "").trim() || undefined,
          name: String(r[Object.keys(r).find((k) => normalizeKey(k) === "name") as string] ?? "").trim(),
          description: String(r[Object.keys(r).find((k) => normalizeKey(k) === "description") as string] ?? "").trim() || undefined,
          category: String(r[Object.keys(r).find((k) => normalizeKey(k) === "category") as string] ?? "").trim() || undefined,
        }))
        .filter((c) => c.name);
      // Only accept if at least 20% rows have a code/description/category (reduce false positives)
      const signal = competencies.filter((c) => c.code || c.description || c.category).length;
      if (signal > 0 || (rows.length > 0 && signal / rows.length >= 0.2)) {
        out.competencies = [...(out.competencies || []), ...competencies];
        continue;
      }
    }

    // Role competencies: expect role_code + competency_id/competency_code + target
    if ((has("role_code") || has("role")) && (has("competency_id") || has("competency_code") || has("competency")) && (has("target") || has("level") || has("score"))) {
      const roleKey = Object.keys(rows[0]).find((k) => ["role_code", "role"].includes(normalizeKey(k))) as string;
      const compIdKey = Object.keys(rows[0]).find((k) => ["competency_id"].includes(normalizeKey(k)));
      const compCodeKey = Object.keys(rows[0]).find((k) => ["competency_code", "competency"].includes(normalizeKey(k)));
      const targetKey = Object.keys(rows[0]).find((k) => ["target", "level", "score"].includes(normalizeKey(k))) as string;

      const rcs: RoleCompetencyRow[] = rows
        .map((r) => ({
          role_code: String(r[roleKey] ?? "").trim(),
          competency_id: compIdKey ? String(r[compIdKey] ?? "").trim() || undefined : undefined,
          competency_code: compCodeKey ? String(r[compCodeKey] ?? "").trim() || undefined : undefined,
          target: Number(r[targetKey] ?? 0),
        }))
        .filter((rc) => rc.role_code && (rc.competency_id || rc.competency_code));
      out.role_competencies = [...(out.role_competencies || []), ...rcs];
      continue;
    }

    // Adjacency: expect source, target, weight
    if (has("source") && has("target")) {
      const weightKey = Object.keys(rows[0]).find((k) => normalizeKey(k) === "weight");
      const adj: AdjacencyRow[] = rows
        .map((r) => ({
          source: String(r[Object.keys(r).find((k) => normalizeKey(k) === "source") as string] ?? "").trim(),
          target: String(r[Object.keys(r).find((k) => normalizeKey(k) === "target") as string] ?? "").trim(),
          weight: Math.max(0, Math.min(1, Number(weightKey ? r[weightKey] ?? 0 : 0))),
        }))
        .filter((a) => a.source && a.target && a.source !== a.target);
      out.adjacencies = [...(out.adjacencies || []), ...adj];
      continue;
    }
  }

  return out;
}

// Minimal parser for TXT role cards (derive roles and description)
function parseTxtRoleCard(text: string): Partial<ParsedPayload> {
  // Heuristic: first line is role name/title, derive code from uppercase initials
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return {};
  const title = lines[0];
  let code = title
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 6);

  if (!code) code = "ROLE" + Math.random().toString(36).slice(2, 6).toUpperCase();

  const role: RoleRow = {
    code,
    name: title,
    description: lines.slice(1, 40).join("\n"),
  };
  return { roles: [role] };
}

// Merge multiple Partial<ParsedPayload> into a single ParsedPayload (dedupe deterministically)
function mergePayloads(parts: Array<Partial<ParsedPayload>>): ParsedPayload {
  const rolesMap = new Map<string, RoleRow>();
  const compsByCode = new Map<string, CompetencyRow>();
  const compsById = new Map<string, CompetencyRow>();
  const rcSet = new Set<string>();
  const adjSet = new Set<string>();

  for (const p of parts) {
    // roles
    (p.roles || []).forEach((r) => {
      const key = r.code.trim();
      if (!key) return;
      if (!rolesMap.has(key)) rolesMap.set(key, r);
    });

    // competencies
    (p.competencies || []).forEach((c) => {
      const id = c.id?.trim();
      const code = c.code?.trim();
      if (id && !compsById.has(id)) compsById.set(id, { ...c, id });
      if (code && !compsByCode.has(code)) compsByCode.set(code, { ...c, code });
    });

    // role_competencies
    (p.role_competencies || []).forEach((rc) => {
      const key = `${rc.role_code}::${rc.competency_id || rc.competency_code}`;
      if (!rcSet.has(key)) rcSet.add(key);
    });

    // adjacencies (undirected duplicates prevented by ordering tuple)
    (p.adjacencies || []).forEach((a) => {
      const pair = a.source < a.target ? `${a.source}::${a.target}` : `${a.target}::${a.source}`;
      if (!adjSet.has(pair)) adjSet.add(pair);
    });
  }

  const roles = Array.from(rolesMap.values());
  const competencyIndex: CompetencyRow[] = [
    ...Array.from(compsById.values()),
    ...Array.from(compsByCode.values()).filter((c) => !c.id),
  ];

  const role_competencies: RoleCompetencyRow[] = Array.from(parts.flatMap((p) => p.role_competencies || [])).filter((rc, idx, arr) => {
    const key = `${rc.role_code}::${rc.competency_id || rc.competency_code}`;
    const firstIdx = arr.findIndex((x) => `${x.role_code}::${x.competency_id || x.competency_code}` === key);
    return firstIdx === idx;
  });

  const adjacencies: AdjacencyRow[] = Array.from(parts.flatMap((p) => p.adjacencies || [])).filter((a, idx, arr) => {
    const pair = a.source < a.target ? `${a.source}::${a.target}` : `${a.target}::${a.source}`;
    const firstIdx = arr.findIndex((x) => {
      const p2 = x.source < x.target ? `${x.source}::${x.target}` : `${x.target}::${x.source}`;
      return p2 === pair;
    });
    return firstIdx === idx;
  });

  return { roles, competencies: competencyIndex, role_competencies, adjacencies };
}

// Fetch existing DB snapshot for diff
async function fetchSnapshot(): Promise<{
  roles: Set<string>;
  competenciesById: Set<string>;
  competenciesByCode: Set<string>;
  roleCompKeys: Set<string>;
  adjKeys: Set<string>;
}> {
  const [rolesQ, compsQ, rcQ, adjQ] = await Promise.all([
    supabase.from("roles").select("code"),
    supabase.from("competencies").select("id,code"),
    supabase.from("role_competencies").select("role_code,competency_id"),
    supabase.from("role_adjacency").select("source,target"),
  ]);

  const roles = new Set<string>(((rolesQ.data as any[]) || []).map((r) => r.code));
  const competenciesById = new Set<string>(((compsQ.data as any[]) || []).map((c) => c.id));
  const competenciesByCode = new Set<string>(((compsQ.data as any[]) || []).map((c) => c.code).filter(Boolean));
  const roleCompKeys = new Set<string>(((rcQ.data as any[]) || []).map((r) => `${r.role_code}::${r.competency_id}`));
  const adjKeys = new Set<string>(((adjQ.data as any[]) || []).map((a) => `${a.source}::${a.target}`));

  return { roles, competenciesById, competenciesByCode, roleCompKeys, adjKeys };
}

// Compute diff summary
function computeDiff(payload: ParsedPayload, snapshot: Awaited<ReturnType<typeof fetchSnapshot>>): DiffSummary {
  let newRoles = 0;
  payload.roles.forEach((r) => {
    if (!snapshot.roles.has(r.code)) newRoles++;
  });

  let newComps = 0;
  payload.competencies.forEach((c) => {
    if (c.id) {
      if (!snapshot.competenciesById.has(c.id)) newComps++;
    } else if (c.code) {
      if (!snapshot.competenciesByCode.has(c.code)) newComps++;
    } else {
      // If neither, assume insert
      newComps++;
    }
  });

  let newRC = 0;
  payload.role_competencies.forEach((rc) => {
    const key = rc.competency_id ? `${rc.role_code}::${rc.competency_id}` : "";
    // For competency_code-based rows, we cannot know exact id; count as new if role is unknown
    if (key) {
      if (!snapshot.roleCompKeys.has(key)) newRC++;
    } else {
      newRC++;
    }
  });

  let newAdj = 0;
  payload.adjacencies.forEach((a) => {
    const key = `${a.source}::${a.target}`;
    if (!snapshot.adjKeys.has(key)) newAdj++;
  });

  return {
    roles: { newCount: newRoles, totalAfter: snapshot.roles.size + newRoles },
    competencies: { newCount: newComps, totalAfter: snapshot.competenciesById.size + newComps },
    role_competencies: { newCount: newRC, totalAfter: snapshot.roleCompKeys.size + newRC },
    adjacencies: { newCount: newAdj, totalAfter: snapshot.adjKeys.size + newAdj },
  };
}

// Check admin status: table public.admin_users with either user_id or email column
async function checkIsAdmin(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email || "";
  const userId = userData.user?.id || "";

  // Try by user_id then by email; treat absence of table as non-admin
  const q1 = await supabase.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (q1.data?.user_id) return true;

  const q2 = await supabase.from("admin_users").select("email").eq("email", email).maybeSingle();
  if (q2.data?.email) return true;

  return false;
}

// PUBLIC_INTERFACE
export function Admin(): JSX.Element {
  /** Admin surface. Upload/parse datasets and seed via Edge Function. */

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<ParsedPayload | null>(null);
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const [message, setMessage] = useState<string>("");
  const [seedStatus, setSeedStatus] = useState<"idle" | "running" | "ok" | "error">("idle");

  // Preload suggested attachments for easy selection
  const attachmentPaths = [
    "/home/kavia/workspace/code-generation/attachments/20251127_081108_Competency_mapping.xlsx",
    "/home/kavia/workspace/code-generation/attachments/20251127_081105_CA_Role_Adjacency.xlsx",
    "/home/kavia/workspace/code-generation/attachments/20251127_081107_CA_Role_Adjacency29.xlsx",
    "/home/kavia/workspace/code-generation/attachments/20251127_081124_Role_Navigator_Worksheet.xlsx",
  ];

  useEffect(() => {
    let active = true;
    checkIsAdmin().then((v) => active && setIsAdmin(v)).catch(() => active && setIsAdmin(false));
    return () => {
      active = false;
    };
  }, []);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fls = Array.from(e.target.files || []);
    setFiles(fls);
    setParsed(null);
    setDiff(null);
    setMessage("");
  }, []);

  // Parse selected files
  const onParse = useCallback(async () => {
    if (!files.length) return;
    setBusy(true);
    setMessage("");
    try {
      const parts: Array<Partial<ParsedPayload>> = [];
      for (const f of files) {
        const { buffer, text, ext } = await readFile(f);
        if (buffer) {
          parts.push(parseXlsx(buffer));
        } else if (text) {
          // Only parse TXT role cards; ignore other text
          if (ext === "txt") {
            parts.push(parseTxtRoleCard(text));
          }
        }
      }
      const merged = mergePayloads(parts);

      // Deterministic numeric normalization
      merged.role_competencies = merged.role_competencies.map((rc) => ({ ...rc, target: Number(rc.target ?? 0) }));
      merged.adjacencies = merged.adjacencies.map((a) => ({ ...a, weight: Math.max(0, Math.min(1, Number(a.weight ?? 0))) }));

      setParsed(merged);

      // Fetch snapshot and compute diff
      const snap = await fetchSnapshot();
      setDiff(computeDiff(merged, snap));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }, [files]);

  const totalCounts = useMemo(() => {
    if (!parsed) return null;
    return {
      roles: parsed.roles.length,
      competencies: parsed.competencies.length,
      role_competencies: parsed.role_competencies.length,
      adjacencies: parsed.adjacencies.length,
    };
  }, [parsed]);

  // Seed to Edge Function
  const onSeed = useCallback(async () => {
    if (!parsed) return;
    setSeedStatus("running");
    setMessage("");
    try {
      const payload = {
        roles: parsed.roles,
        competencies: parsed.competencies,
        role_competencies: parsed.role_competencies,
        adjacencies: parsed.adjacencies,
      };
      const res = await seedUpsert(payload);
      if (res.error) {
        setSeedStatus("error");
        setMessage(res.error);
        return;
      }
      setSeedStatus("ok");
      setMessage("Seed completed successfully.");
    } catch (e) {
      setSeedStatus("error");
      setMessage(e instanceof Error ? e.message : "Seed failed");
    }
  }, [parsed]);

  if (isAdmin === null) {
    return <section><h1 className="title">Admin</h1><p className="description">Checking admin access…</p></section>;
  }

  if (!isAdmin) {
    return <section><h1 className="title">Admin</h1><p className="description">Access denied. You are not an admin user.</p></section>;
  }

  return (
    <section>
      <h1 className="title">Admin Console</h1>
      <p className="description">Upload XLSX/TXT files, review parsed previews and diffs, then seed reference tables.</p>

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div>
          <label htmlFor="files">Select files</label>
          <input
            id="files"
            type="file"
            multiple
            onChange={onFileInput}
            accept=".xlsx,.xls,.txt"
            style={{
              display: "block",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color, rgba(0,0,0,0.12))",
            }}
          />
          <div style={{ fontSize: 12, color: "var(--ocean-secondary)", marginTop: 6 }}>
            Hint: You can upload any of the provided attachments (Competency_mapping.xlsx, CA_Role_Adjacency.xlsx, Role_Navigator_Worksheet.xlsx, and role card .txt files).
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="theme-toggle" onClick={onParse} disabled={!files.length || busy}>
            {busy ? "Parsing…" : "Parse"}
          </button>
          <button
            className="theme-toggle"
            onClick={onSeed}
            disabled={!parsed || seedStatus === "running"}
            aria-busy={seedStatus === "running"}
          >
            {seedStatus === "running" ? "Seeding…" : "Seed to Supabase"}
          </button>
        </div>

        {parsed && (
          <div style={{ display: "grid", gap: 8, padding: 12, border: "1px solid var(--border-color)", borderRadius: 12, background: "var(--ocean-surface)" }}>
            <h3 style={{ margin: 0 }}>Preview</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(200px, 1fr))", gap: 8 }}>
              <div>Roles: {totalCounts?.roles}</div>
              <div>Competencies: {totalCounts?.competencies}</div>
              <div>Role Competencies: {totalCounts?.role_competencies}</div>
              <div>Adjacencies: {totalCounts?.adjacencies}</div>
            </div>

            {diff && (
              <>
                <h3 style={{ marginBottom: 0, marginTop: 8 }}>Diff (new rows vs current DB)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(200px, 1fr))", gap: 8 }}>
                  <div>Roles: +{diff.roles.newCount} (total after: {diff.roles.totalAfter})</div>
                  <div>Competencies: +{diff.competencies.newCount} (total after: {diff.competencies.totalAfter})</div>
                  <div>Role Competencies: +{diff.role_competencies.newCount} (total after: {diff.role_competencies.totalAfter})</div>
                  <div>Adjacencies: +{diff.adjacencies.newCount} (total after: {diff.adjacencies.totalAfter})</div>
                </div>
              </>
            )}
          </div>
        )}

        {message && (
          <div role="status" aria-live="polite" style={{ marginTop: 4, color: seedStatus === "error" ? "var(--ocean-error)" : "var(--ocean-secondary)" }}>
            {message}
          </div>
        )}
      </div>
    </section>
  );
}
