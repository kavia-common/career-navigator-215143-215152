import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  listCompetencies,
  listSkillsByCompetency,
  listProfileSkillProgress,
  updateSkillProgressAndRecompute,
  rpcGapAnalysis,
  getCurrentUserProfile,
} from "../lib/api";
import type { Skill, ProfileSkillProgress, UUID, UserProfile, Competency } from "../lib/types";

// PUBLIC_INTERFACE
export function CompetencyDetail(): JSX.Element {
  /**
   * Competency detail view
   * - Displays competency metadata
   * - Lists associated skills with description and resource link (if present)
   * - Each skill has a completion checkbox (0 or 100 progress)
   * - On toggle:
   *    • Upsert into profile_skill_progress
   *    • Recompute KPIs (rpc_recompute_profile) and refresh readiness and color signals via rpc_gap_analysis
   *
   * Query params:
   *   ?competency_id=<uuid>
   */
  const [params] = useSearchParams();
  const competencyId = (params.get("competency_id") || "").trim();

  const [loading, setLoading] = useState(true);
  const [competency, setCompetency] = useState<Competency | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [readiness, setReadiness] = useState<number | null>(null);

  let autoBumpThresholdPct = 80; // default
  const checkboxLabel = (s: Skill) => `Mark "${s.name}" as complete`;

  // Load competency, skills, user progress, and profile for target role
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // profile for target role code
        const profRes = await getCurrentUserProfile();

        // try get config
        try {
          const conf = await import("../lib/api");
          const cfg = await conf.getConfig?.("skill_promotion_threshold");
          if (cfg && !cfg.error && cfg.data) {
            const n = Number(cfg.data);
            if (!Number.isNaN(n)) {
              autoBumpThresholdPct = n;
            }
          }
        } catch {
          // ignore config errors
        }
        if (!active) return;
        if (!profRes.error && profRes.data) setProfile(profRes.data);

        // competence list to find current competency
        const [comps, skl, prog] = await Promise.all([
          listCompetencies(),
          competencyId ? listSkillsByCompetency(competencyId as UUID) : Promise.resolve({ data: [], error: undefined }),
          listProfileSkillProgress(),
        ]);

        if (!active) return;
        if (comps.error) throw new Error(comps.error);
        const c = (comps.data || []).find((x) => x.id === competencyId) || null;
        setCompetency(c || null);

        if (skl.error) throw new Error(skl.error);
        setSkills(skl.data || []);

        const pMap: Record<string, number> = {};
        if (!prog.error && Array.isArray(prog.data)) {
          for (const row of prog.data as ProfileSkillProgress[]) {
            pMap[row.skill_id] = Number(row.progress ?? 0);
          }
        }
        setProgressMap(pMap);

        // initial readiness if target role present
        if (profRes.data?.id && profRes.data.role_target_code) {
          const gap = await rpcGapAnalysis(profRes.data.id, profRes.data.role_target_code);
          if (!gap.error && gap.data) setReadiness(gap.data.readiness);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load competency details.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [competencyId]);

  const handleToggle = async (skillId: UUID) => {
    try {
      const current = Number(progressMap[skillId] ?? 0);
      const next = current >= 100 ? 0 : 100;

      // Optimistic UI
      setProgressMap((m) => ({ ...m, [skillId]: next }));

      const recompute = await updateSkillProgressAndRecompute(skillId, next, {
        targetRoleCode: profile?.role_target_code || undefined,
        thresholdPct: autoBumpThresholdPct,
        competencyId,
      });
      if (recompute.error) throw new Error(recompute.error);

      // Refresh readiness from rpc_gap_analysis to get latest color codes/breakdown
      if (profile?.id && (profile.role_target_code || "")) {
        const gap = await rpcGapAnalysis(profile.id, profile.role_target_code!);
        if (!gap.error && gap.data) {
          setReadiness(gap.data.readiness);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed updating progress.");
      // revert optimistic change if desired; for simplicity we refetch later or leave as-is
    }
  };

  const completedCount = useMemo(
    () => skills.reduce((acc, s) => acc + (Number(progressMap[s.id] ?? 0) >= 100 ? 1 : 0), 0),
    [skills, progressMap]
  );

  return (
    <section>
      <h1 className="title">Competency</h1>
      <p className="description">Track progress through the core skills that demonstrate this competency.</p>

      {loading ? (
        <div role="status" aria-busy="true">Loading…</div>
      ) : error ? (
        <div role="alert" style={{ color: "var(--ocean-error)" }}>{error}</div>
      ) : (
        <>
          <div
            style={{
              background: "var(--ocean-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 18 }}>{competency?.name || "Unknown competency"}</div>
            {competency?.description && (
              <div style={{ marginTop: 6, color: "var(--ocean-secondary)" }}>{competency.description}</div>
            )}
            <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
                Completed skills: {completedCount}/{skills.length}
              </span>
              {readiness != null && (
                <span style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
                  Readiness: {(readiness * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          <div role="table" aria-label="Skills for competency" style={{ width: "100%", overflowX: "auto" }}>
            <div role="rowgroup">
              <div role="row" style={{ display: "grid", gridTemplateColumns: "1fr 180px 120px", fontWeight: 600, padding: "8px 6px", borderBottom: "1px solid var(--border-color)" }}>
                <div role="columnheader">Skill</div>
                <div role="columnheader">Resources</div>
                <div role="columnheader" style={{ textAlign: "right" }}>Completed</div>
              </div>
            </div>
            <div role="rowgroup">
              {skills.length === 0 ? (
                <div role="row" style={{ padding: "12px 6px", color: "var(--ocean-secondary)" }}>
                  No skills are mapped to this competency yet.
                </div>
              ) : (
                skills.map((s) => {
                  // Handle legacy single link and new resource_links jsonb
                  const legacyLink = (s as any).resource_link as string | undefined;
                  const linksJson = (s as any).resource_links as any | undefined;
                  const links: Array<{ label: string; url: string }> = [];
                  if (legacyLink) links.push({ label: "Resource", url: legacyLink });
                  if (linksJson && Array.isArray(linksJson)) {
                    for (const it of linksJson) {
                      if (it && typeof it === "object" && it.url) {
                        links.push({ label: it.label || "Link", url: String(it.url) });
                      }
                    }
                  } else if (linksJson && typeof linksJson === "object") {
                    for (const [k, v] of Object.entries(linksJson)) {
                      if (typeof v === "string") links.push({ label: k, url: v });
                    }
                  }
                  const completed = Number(progressMap[s.id] ?? 0) >= 100;
                  return (
                    <div key={s.id} role="row" style={{ display: "grid", gridTemplateColumns: "1fr 180px 120px", padding: "10px 6px", borderBottom: "1px solid var(--border-color)" }}>
                      <div role="cell">
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        {s.description && <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>{s.description}</div>}
                      </div>
                      <div role="cell" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {links.length > 0 ? (
                          links.map((lk, idx) => (
                            <a key={idx} className="navlink" href={lk.url} target="_blank" rel="noreferrer">{lk.label}</a>
                          ))
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>—</span>
                        )}
                      </div>
                      <div role="cell" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                        <input
                          type="checkbox"
                          checked={completed}
                          aria-label={checkboxLabel(s)}
                          onChange={() => handleToggle(s.id)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
