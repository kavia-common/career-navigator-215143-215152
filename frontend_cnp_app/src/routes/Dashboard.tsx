import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { exportProfilePdf, listEvidence, rpcGapAnalysis, rpcRecomputeProfile } from "../lib/api";
import "../styles/theme.css";

/**
 * PUBLIC_INTERFACE
 * Dashboard: Auth-required landing showing KPIs, top competency gaps, recent evidence, and quick actions.
 * Accessible states with Ocean Professional theme tokens.
 */
export default function Dashboard(): JSX.Element {
  const navigate = useNavigate();

  type GapRow = {
    competency_id: string;
    competency_name?: string | null;
    role_target: number;
    profile_level: number;
    delta: number;
    traffic: "Green" | "Amber" | "Red";
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [targetRoleCode, setTargetRoleCode] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<number | null>(null);
  const [overlap, setOverlap] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<GapRow[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [kpiCounts, setKpiCounts] = useState<{ competencies?: number; evidence?: number; plan_items?: number; completed_items?: number } | null>(null);

  const deriveTraffic = (level: number, target: number): "Green" | "Amber" | "Red" => {
    const T = Number(target || 0);
    const L = Number(level || 0);
    if (T <= 0) return "Green";
    const pct = Math.max(0, Math.min(1, L / T));
    if (pct >= 0.7) return "Green";
    if (pct >= 0.4) return "Amber";
    return "Red";
  };

  const normalizeBreakdown = (rows: any[]): GapRow[] =>
    (rows || []).map((row: any) => {
      const roleTarget = Number(row.role_target ?? row.target ?? 0);
      const profLevel = Number(row.profile_level ?? row.current ?? 0);
      return {
        competency_id: row.competency_id,
        competency_name: row.competency_name ?? row.competency_code ?? row.name ?? null,
        role_target: roleTarget,
        profile_level: profLevel,
        delta: Number(row.delta ?? Math.max(0, roleTarget - profLevel)),
        traffic: (row.traffic as GapRow["traffic"]) || deriveTraffic(profLevel, roleTarget),
      };
    });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: authRes } = await supabase.auth.getUser();
      const uid = authRes.user?.id || null;
      if (!uid) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      setProfileId(uid);

      // Read profile target role directly
      let trg: string | null = null;
      try {
        const row = await supabase.from("profiles").select("role_target_code").eq("id", uid).maybeSingle();
        if (!row.error && row.data) {
          trg = (row.data as any).role_target_code || null;
        }
      } catch {
        // ignore
      }
      setTargetRoleCode(trg);

      const ev = await listEvidence();
      if (!ev.error) setEvidence(ev.data || []);

      const kpi = await rpcRecomputeProfile(uid, trg || undefined);
      if (!kpi.error && kpi.data) {
        setKpiCounts(kpi.data.counts || null);
        if (typeof kpi.data.readiness === "number") setReadiness(kpi.data.readiness);
        if (typeof (kpi.data as any).overlap === "number") setOverlap((kpi.data as any).overlap);
        else if (typeof (kpi.data as any).overlapRatio === "number") setOverlap((kpi.data as any).overlapRatio);
      }

      if (uid && trg) {
        const gap = await rpcGapAnalysis(uid, trg, { useCache: true });
        if (!gap.error) {
          const d = gap.data || {};
          const b = Array.isArray(d.breakdown) ? d.breakdown : [];
          setBreakdown(normalizeBreakdown(b));
          if (typeof d.readiness === "number") setReadiness(d.readiness);
          if (typeof (d as any).overlap === "number") setOverlap((d as any).overlap);
          else if (typeof (d as any).overlapRatio === "number") setOverlap((d as any).overlapRatio);
        } else {
          setError(gap.error);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const topGaps = useMemo(() => breakdown.slice(0, 5), [breakdown]);

  const onRefreshKpis = async () => {
    if (!profileId) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await rpcRecomputeProfile(profileId, targetRoleCode || undefined);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        const k = res.data;
        setKpiCounts(k?.counts || null);
        if (typeof k?.readiness === "number") setReadiness(k.readiness);
        if (typeof k?.overlap === "number") setOverlap(k.overlap);
      }

      if (targetRoleCode) {
        const gap = await rpcGapAnalysis(profileId, targetRoleCode, { useCache: true });
        if (!gap.error) {
          const d = gap.data || {};
          const b = Array.isArray(d.breakdown) ? d.breakdown : [];
          setBreakdown(normalizeBreakdown(b));
          if (typeof d.readiness === "number") setReadiness(d.readiness);
          if (typeof d.overlap === "number") setOverlap(d.overlap);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to refresh KPIs");
    } finally {
      setRefreshing(false);
    }
  };

  const onExportPdf = async () => {
    if (!profileId) return;
    try {
      const { data, error } = await exportProfilePdf(profileId);
      if (error) {
        setError(error);
        return;
      }
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = "career-profile.pdf";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to export PDF");
    }
  };

  const chip = (label: string, value?: string | number | null) => (
    <div style={{
      padding: "10px 14px",
      background: "var(--color-surface)",
      border: "1px solid #E5E7EB",
      borderRadius: 10,
      minWidth: 140,
      flex: "1 1 160px"
    }}>
      <div style={{ fontSize: 12, color: "#6B7280" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text)" }}>{value ?? "-"}</div>
    </div>
  );

  const trafficDot = (t: GapRow["traffic"]) => {
    const color = t === "Green" ? "var(--color-success)" : t === "Amber" ? "#F59E0B" : "var(--color-error)";
    return <span style={{
      display: "inline-block",
      width: 10, height: 10, borderRadius: 9999, background: color, marginRight: 8
    }} />;
  };

  const [hasAnyRoles, setHasAnyRoles] = useState<boolean | null>(null);
  useEffect(() => {
    // health probe: are there any roles yet?
    (async () => {
      try {
        const { data, error } = await supabase.from("roles").select("code").limit(1);
        if (error) {
          setHasAnyRoles(null);
        } else {
          setHasAnyRoles((data || []).length > 0);
        }
      } catch {
        setHasAnyRoles(null);
      }
    })();
  }, []);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24, color: "var(--color-text)" }}>Dashboard</h1>
        <p style={{ marginTop: 4, color: "#6B7280" }}>
          Track your readiness and close gaps toward your target role.
        </p>
        {hasAnyRoles === false && (
          <div role="note" style={{ marginTop: 6, color: "#9CA3AF" }}>
            No roles in catalog yet. Ask an admin to seed roles in the Admin console.
          </div>
        )}
      </header>

      {loading ? (
        <div role="status" aria-live="polite" style={{ padding: 16, color: "#6B7280" }}>
          Loading dashboard…
        </div>
      ) : error ? (
        <div role="alert" style={{ padding: 12, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B", borderRadius: 8 }}>
          {error}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {chip("Target Role", targetRoleCode || "Not set")}
            {chip("Readiness", readiness != null ? `${Math.round(readiness * 100)}%` : "-")}
            {chip("Overlap", overlap != null ? `${Math.round(overlap * 100)}%` : "-")}
            {chip("Competencies", kpiCounts?.competencies ?? "-")}
            {chip("Evidence", kpiCounts?.evidence ?? "-")}
            {chip("Plan Items", kpiCounts?.plan_items ?? "-")}
            {chip("Completed", kpiCounts?.completed_items ?? "-")}
            <button
              onClick={onRefreshKpis}
              disabled={refreshing}
              className="btn btn-primary"
              style={{ height: 44, minWidth: 140 }}
            >
              {refreshing ? "Refreshing…" : "Refresh KPIs"}
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <h2 style={{ fontSize: 18, color: "var(--color-text)", marginBottom: 8 }}>Top Competency Gaps</h2>
            {topGaps.length === 0 ? (
              <div style={{ color: "#6B7280" }}>No gaps found. Great job!</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Competency</th>
                      <th>Current</th>
                      <th>Target</th>
                      <th>Delta</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGaps.map((g) => (
                      <tr key={g.competency_id}>
                        <td>{g.competency_name || g.competency_id}</td>
                        <td>{g.profile_level}</td>
                        <td>{g.role_target}</td>
                        <td>{g.delta}</td>
                        <td>
                          {trafficDot(g.traffic)}
                          <span>{g.traffic}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <h2 style={{ fontSize: 18, color: "var(--color-text)", marginBottom: 8 }}>Recent Evidence</h2>
            {evidence.length === 0 ? (
              <div style={{ color: "#6B7280" }}>No evidence yet. Add your first artifact.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {evidence.slice(0, 5).map((e) => (
                  <li key={e.id} className="card">
                    <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{e.title || "Untitled"}</div>
                    {e.description ? <div style={{ color: "#6B7280", marginTop: 4 }}>{e.description}</div> : null}
                    <div style={{ marginTop: 6, fontSize: 12, color: "#9CA3AF" }}>
                      {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
                    </div>
                    {e.url ? (
                      <div style={{ marginTop: 6 }}>
                        <a href={e.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)", textDecoration: "underline" }}>
                          View
                        </a>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <h2 style={{ fontSize: 18, color: "var(--color-text)", marginBottom: 8 }}>Quick Actions</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => navigate("/profile")}>Update Profile</button>
              <button className="btn btn-secondary" onClick={() => navigate("/evidence")}>Add Evidence</button>
              <button className="btn btn-secondary" onClick={() => navigate("/devplan")}>Generate Plan</button>
              <button className="btn btn-secondary" onClick={onExportPdf}>Export PDF</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
