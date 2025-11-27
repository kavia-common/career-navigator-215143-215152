import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { publicRoleToRoleGap, ensureCurrentUserProfile, upsertCurrentUserProfile } from "../lib/api";
import { GapAnalysisResult } from "../lib/types";
import { supabase } from "../lib/supabaseClient";

// PUBLIC_INTERFACE
export function ExploreGap(): JSX.Element {
  /**
   * Public gap details page:
   * - Reads :source and :target from route
   * - Calls a public gap function (client-side or edge function) to compute gap matrix
   * - Displays F/P/A/Au labels derived from numeric mapping
   * - Offers Export Snapshot (placeholder) and Save as Profile CTA
   */
  const { source, target } = useParams<{ source: string; target: string }>();
  const [gap, setGap] = useState<GapAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const proficiencyLabel = (n?: number | null): string => {
    const v = typeof n === "number" ? n : 0;
    // Map 0..3 to F/P/A/Au
    switch (v) {
      case 0:
        return "F";
      case 1:
        return "P";
      case 2:
        return "A";
      case 3:
        return "Au";
      default:
        return String(v);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!source || !target) return;
      try {
        setErr(null);
        setLoading(true);
        const res = await publicRoleToRoleGap(source, target);
        if (!active) return;
        setGap(res);
      } catch (e: any) {
        setErr(e?.message || "Failed to load gap details");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [source, target]);

  const rows = useMemo(() => {
    const deficits = gap?.deficits || [];
    const overlaps = gap?.overlaps || (gap as any)?.overlap || [];
    // Join deficits and overlaps over competencies for a full matrix
    const deficitIds = new Set(deficits.map((d) => d.competency_id));
    const merged = [...deficits];
    for (const o of overlaps) {
      if (!deficitIds.has(o.competency_id)) {
        merged.push({ ...o, delta: Math.max(0, (o.target_level ?? 0) - (o.source_level ?? 0)) });
      }
    }
    return merged.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  }, [gap]);

  const onSaveAsProfile = async () => {
    try {
      setSaving(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        // redirect to login with return url back to this page
        navigate(`/login?return=${encodeURIComponent(window.location.pathname)}`, { replace: false });
        return;
      }
      await ensureCurrentUserProfile();
      const patch = await upsertCurrentUserProfile({
        role_current_code: source || null || undefined,
        role_target_code: target || null || undefined,
      });
      if (patch.error) throw new Error(patch.error);
      navigate("/dashboard");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save profile from explore.");
    } finally {
      setSaving(false);
    }
  };

  const onExportSnapshot = async () => {
    // Minimal client-side print/export hint for MVP; P2 would call an Edge Function returning a signed URL.
    window.print();
  };

  return (
    <section className="container" aria-labelledby="explore-gap-title">
      <h1 id="explore-gap-title">Gap Details</h1>
      <p className="mb-4" style={{ color: "var(--color-secondary)" }}>
        Comparing {source} → {target}
      </p>

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="navlink" to="/explore">← Back to Explore</Link>
        <button className="theme-toggle" onClick={onExportSnapshot}>Export snapshot</button>
        <button className="theme-toggle" onClick={onSaveAsProfile} disabled={saving} aria-busy={saving}>
          {saving ? "Saving…" : "Save as Profile"}
        </button>
      </div>

      {loading ? (
        <div className="mt-4" aria-busy="true">Loading…</div>
      ) : err ? (
        <div className="mt-4" role="alert" style={{ color: "var(--ocean-error)" }}>{err}</div>
      ) : rows.length === 0 ? (
        <div className="card mt-4" style={{ color: "var(--color-secondary)" }}>
          No gap data available for this role pair.
        </div>
      ) : (
        <div className="card mt-4">
          <div style={{ marginBottom: 8, color: "var(--color-secondary)" }}>
            Overlap {(Number((gap as any)?.overlap ?? gap?.overlapRatio ?? 0) * 100).toFixed(0)}% •
            Total gaps {gap?.summary?.deficit_count ?? rows.filter((r) => (r.delta ?? 0) > 0).length}
          </div>
          <table className="app-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Competency</th>
                <th>Current</th>
                <th>Target</th>
                <th>Delta</th>
                <th>Proficiency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta = Math.max(0, Number(r.delta ?? 0));
                const status: "green" | "amber" | "red" = r.source_level >= r.target_level ? "green" : delta === 1 ? "amber" : "red";
                return (
                  <tr key={r.competency_id}>
                    <td style={{ textAlign: "left" }}>{r.name}</td>
                    <td>{proficiencyLabel(r.source_level)}</td>
                    <td>{proficiencyLabel(r.target_level)}</td>
                    <td>{delta}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: status === "green" ? "#DCFCE7" : status === "amber" ? "#FEF3C7" : "#FEE2E2",
                          color: status === "green" ? "#065F46" : status === "amber" ? "#92400E" : "#991B1B",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {status === "green" ? "Good" : status === "amber" ? "Minor Gap" : "Gap"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default ExploreGap;
