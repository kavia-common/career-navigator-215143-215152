import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { exportProfilePdf, getCurrentUserProfile, listEvidence, rpcGapAnalysis, rpcRecomputeProfile } from "../lib/api";

/**
 * PUBLIC_INTERFACE
 * Dashboard: Auth-required landing showing KPIs, top competency gaps, recent evidence, and quick actions.
 * - Fetches readiness via rpc_gap_analysis (Edge Function)
 * - Refresh KPIs via rpc_recompute_profile
 * - Shows color-coded gaps table (Green/Amber/Red based on attainment)
 * - Lists recent evidence items
 * - Provides quick actions: Update Profile, Add Evidence, Generate Plan, Export PDF
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
    // Normalize to Ocean Professional G/A/R thresholds by attainment vs target
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
      // Auth
      const { data: authRes } = await supabase.auth.getUser();
      const uid = authRes.user?.id || null;
      if (!uid) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      setProfileId(uid);

      // Profile/target
      const prof = await getCurrentUserProfile();
      if (prof.error) {
        setError(prof.error);
        setLoading(false);
        return;
      }
      const trg = prof.data?.role_target_code || null;
      setTargetRoleCode(trg);

      // Evidence list (non-blocking error)
      const ev = await listEvidence();
      if (!ev.error) setEvidence(ev.data);

      // Recompute KPIs first to refresh readiness/overlap server-side
      const kpi = await rpcRecomputeProfile(uid, trg || undefined);
      if (!kpi.error && kpi.data) {
        setKpiCounts(kpi.data.counts || null);
        if (typeof kpi.data.readiness === "number") setReadiness(kpi.data.readiness);
        if (typeof kpi.data.overlap === "number") setOverlap(kpi.data.overlap);
      }

      // Gap analysis for table (after recompute to reflect latest)
      if (uid && trg) {
        const gap = await rpcGapAnalysis(uid, trg);
        if (!gap.error) {
          const d = gap.data || {};
          const b = Array.isArray(d.breakdown) ? d.breakdown : [];
          setBreakdown(normalizeBreakdown(b));
          if (typeof d.readiness === "number") setReadiness(d.readiness);
          if (typeof d.overlap === "number") setOverlap(d.overlap);
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
      // recompute
      const res = await rpcRecomputeProfile(profileId, targetRoleCode || undefined);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        const k = res.data;
        setKpiCounts(k?.counts || null);
        if (typeof k?.readiness === "number") setReadiness(k.readiness);
        if (typeof k?.overlap === "number") setOverlap(k.overlap);
      }

      // refresh gaps
      if (targetRoleCode) {
        const gap = await rpcGapAnalysis(profileId, targetRoleCode);
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

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24, color: "var(--color-text)" }}>Dashboard</h1>
        <p style={{ marginTop: 4, color: "#6B7280" }}>
          Track your readiness and close gaps toward your target role.
        </p>
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
              style={{
                padding: "10px 14px",
                background: "var(--color-primary)",
                color: "white",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                height: 44,
                minWidth: 140
              }}>
              {refreshing ? "Refreshing…" : "Refresh KPIs"}
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <h2 style={{ fontSize: 18, color: "var(--color-text)", marginBottom: 8 }}>Top Competency Gaps</h2>
            {topGaps.length === 0 ? (
              <div style={{ color: "#6B7280" }}>No gaps found. Great job!</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Competency</th>
                      <th style={thStyle}>Current</th>
                      <th style={thStyle}>Target</th>
                      <th style={thStyle}>Delta</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGaps.map((g) => (
                      <tr key={g.competency_id} style={{ background: "#fff" }}>
                        <td style={tdStyle}>{g.competency_name || g.competency_id}</td>
                        <td style={tdStyle}>{g.profile_level}</td>
                        <td style={tdStyle}>{g.role_target}</td>
                        <td style={tdStyle}>{g.delta}</td>
                        <td style={tdStyle}>
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
                  <li key={e.id} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, background: "#fff" }}>
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
              <button style={btnSecondary} onClick={() => navigate("/profile")}>Update Profile</button>
              <button style={btnSecondary} onClick={() => navigate("/evidence")}>Add Evidence</button>
              <button style={btnSecondary} onClick={() => navigate("/devplan")}>Generate Plan</button>
              <button style={btnSecondary} onClick={onExportPdf}>Export PDF</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  color: "#6B7280",
  fontWeight: 500,
  padding: "10px 12px",
  borderBottom: "1px solid #E5E7EB",
  background: "var(--color-surface)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #F3F4F6",
  color: "var(--color-text)",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 14px",
  background: "var(--color-surface)",
  border: "1px solid #E5E7EB",
  color: "var(--color-text)",
  borderRadius: 10,
  cursor: "pointer",
  minWidth: 150,
};
