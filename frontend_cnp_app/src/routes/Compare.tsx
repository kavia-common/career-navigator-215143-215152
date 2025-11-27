import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchGapAnalysis, fetchRoleCompetencies } from '../lib/api';
import { RoleCompetency, GapAnalysisResult, LearningItem } from '../lib/types';
import '../styles/theme.css';
import '../App.css';

/**
 * PUBLIC_INTERFACE
 * Compare page enables selecting a source (current) role and a target role,
 * computing competency overlaps and gaps, color-coding each competency row,
 * and surfacing recommended learning items to address gaps.
 *
 * Data sources:
 * - Supabase tables (roles, role_competencies, competencies, learning_items)
 * - rpc_gap_analysis for consistency with backend gap logic
 */
const Compare: React.FC = () => {
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [sourceRoleId, setSourceRoleId] = useState<string>('');
  const [targetRoleId, setTargetRoleId] = useState<string>('');
  const [sourceComps, setSourceComps] = useState<RoleCompetency[]>([]);
  const [targetComps, setTargetComps] = useState<RoleCompetency[]>([]);
  const [gap, setGap] = useState<GapAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  // Fetch roles list
  useEffect(() => {
    let mounted = true;
    const loadRoles = async () => {
      try {
        setErr('');
        const { data, error } = await supabase
          .from('roles')
          .select('id, name')
          .order('name', { ascending: true });
        if (error) throw error;
        if (mounted) setRoles(data || []);
      } catch (e: any) {
        if (mounted) setErr(e?.message || 'Failed to load roles');
      }
    };
    loadRoles();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch competencies for selected roles, and gap analysis
  useEffect(() => {
    const valid = sourceRoleId && targetRoleId && sourceRoleId !== targetRoleId;
    if (!valid) {
      setSourceComps([]);
      setTargetComps([]);
      setGap(null);
      return;
    }

    let active = true;
    const run = async () => {
      try {
        setLoading(true);
        setErr('');
        // Fetch per-role competencies (deterministic baseline)
        const [srcRes, tgtRes] = await Promise.all([
          fetchRoleCompetencies(sourceRoleId),
          fetchRoleCompetencies(targetRoleId),
        ]);
        if (!active) return;

        const src = srcRes.error ? [] : (srcRes.data || []);
        const tgt = tgtRes.error ? [] : (tgtRes.data || []);
        setSourceComps(src as RoleCompetency[]);
        setTargetComps(tgt as RoleCompetency[]);

        // Call rpc for authoritative gap aggregation (if available)
        let rpc: GapAnalysisResult | null = null;
        try {
          const gapRes = await fetchGapAnalysis(sourceRoleId, targetRoleId);
          if (!gapRes.error) {
            rpc = (gapRes.data as any) || null;
          }
        } catch (rpcErr) {
          // Non-fatal; fall back to deterministic local computation
          // eslint-disable-next-line no-console
          console.warn('rpc_gap_analysis failed, using local logic', rpcErr);
        }

        if (!active) return;
        if (rpc) {
          setGap(rpc);
        } else {
          // Local logic: compute overlap, deficits and suggested items
          const targetMap = new Map(tgt.map(c => [c.competency_id, c]));
          const sourceMap = new Map(src.map(c => [c.competency_id, c]));

          const overlap = src
            .filter(s => {
              const t = targetMap.get(s.competency_id);
              return !!t && (Number((s as any).proficiency ?? s.target ?? 0) >= Number((t as any).proficiency ?? t.target ?? 0));
            })
            .map(s => ({
              competency_id: s.competency_id,
              name: (s as any).competency_name ?? "",
              source_level: Number((s as any).proficiency ?? s.target ?? 0),
              target_level: Number((targetMap.get(s.competency_id) as any)?.proficiency ?? targetMap.get(s.competency_id)?.target ?? 0),
            }));

          const deficits = Array.from(targetMap.values())
            .map(t => {
              const s = sourceMap.get(t.competency_id);
              const sLevel = Number((s as any)?.proficiency ?? s?.target ?? 0);
              const tLevel = Number((t as any)?.proficiency ?? t?.target ?? 0);
              const delta = Math.max(0, tLevel - sLevel);
              return {
                competency_id: t.competency_id,
                name: (t as any).competency_name ?? "",
                source_level: sLevel,
                target_level: tLevel,
                delta,
              };
            })
            .filter(d => d.delta > 0)
            .sort((a, b) => b.delta - a.delta);

          // A simple heuristic: higher delta => higher priority
          const summary = {
            overlap_count: overlap.length,
            deficit_count: deficits.length,
            total_target: tgt.length,
          };

          const localGap: GapAnalysisResult = {
            overlaps: overlap,
            deficits,
            recommendations: [], // Filled further below using learning items query
            summary,
          };
          setGap(localGap);
        }
      } catch (e: any) {
        setErr(e?.message || 'Failed to compute comparison');
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [sourceRoleId, targetRoleId]);

  // Fetch recommended learning items tied to target role competencies with gaps
  useEffect(() => {
    const hasGaps = !!gap && gap.deficits && gap.deficits.length > 0;
    if (!hasGaps) return;

    let mounted = true;
    const run = async () => {
      try {
        setErr(prev => prev); // preserve any existing error
        const deficitIds = (gap && Array.isArray(gap.deficits) ? gap.deficits : []).map(d => d.competency_id);
        // Example schema:
        // learning_items table has columns: id, title, url, type, competency_id, difficulty, provider
        const { data, error } = await supabase
          .from('learning_items')
          .select('id, title, url, type, competency_id, difficulty, provider')
          .in('competency_id', deficitIds)
          .limit(100);
        if (error) throw error;

        // Rank items by deficit delta and some simple preferences (e.g., difficulty asc)
        const deltaByComp = new Map(
          (gap && Array.isArray(gap.deficits) ? gap.deficits : []).map(d => [d.competency_id, d.delta] as const)
        );
        const ranked = (data || [])
          .map((item) => ({
            ...item,
            score: (deltaByComp.get(item.competency_id) || 0) * 10 - difficultyScore(item.difficulty),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 30)
          .map<LearningItem>(i => ({
            id: i.id,
            title: i.title,
            url: i.url,
            type: i.type,
            competency_id: i.competency_id,
            difficulty: i.difficulty,
            provider: i.provider,
          }));

        if (!mounted) return;
        setGap(prev => prev ? { ...prev, recommendations: ranked } : prev);
      } catch (e: any) {
        // Non-fatal
        // eslint-disable-next-line no-console
        console.warn('Failed to load learning items', e);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [gap?.deficits?.length]);

  const mergedRows = useMemo(() => {
    // Merge on target competencies to display required set, plus show source level
    const targetMap = new Map(targetComps.map(c => [c.competency_id, c]));
    const sourceMap = new Map(sourceComps.map(c => [c.competency_id, c]));
    const rows = Array.from(targetMap.values()).map(t => {
      const s = sourceMap.get(t.competency_id);
      const sLevel = Number((s as any)?.proficiency ?? s?.target ?? 0);
      const tLevel = Number((t as any)?.proficiency ?? t?.target ?? 0);
      const delta = Math.max(0, tLevel - sLevel);
      return {
        competency_id: t.competency_id,
        name: (t as any).competency_name,
        source_level: sLevel,
        target_level: tLevel,
        delta,
      };
    });

    // Determine color code:
    // - Green: source >= target
    // - Amber: delta 1
    // - Red: delta >= 2
    return rows
      .map(r => {
        const status: 'green' | 'amber' | 'red' =
          r.source_level >= r.target_level ? 'green' : r.delta === 1 ? 'amber' : 'red';
        return { ...r, status };
      })
      .sort((a, b) => {
        // Sort by severity then by delta desc
        const sev = (s: 'green' | 'amber' | 'red') => (s === 'red' ? 2 : s === 'amber' ? 1 : 0);
        const d = sev(b.status) - sev(a.status);
        if (d !== 0) return d;
        return b.delta - a.delta;
      });
  }, [sourceComps, targetComps]);

  const summaryText = useMemo(() => {
    if (!gap) return '';
    const { overlap_count, deficit_count, total_target } = gap.summary || { overlap_count: 0, deficit_count: 0, total_target: 0 };
    return `Overlap ${overlap_count}/${total_target}, Gaps ${deficit_count}/${total_target}`;
  }, [gap]);

  return (
    <div className="app-surface" style={{ padding: '24px' }}>
      <h1 className="app-title" style={{ marginBottom: 8 }}>Compare Roles</h1>
      <p className="app-subtitle" style={{ color: '#6b7280', marginBottom: 24 }}>
        Select your current role and a target role to see overlaps, competency gaps, and recommended learning resources.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
        <div>
          <label htmlFor="sourceRole" className="app-label">Source (Current) Role</label>
          <select
            id="sourceRole"
            value={sourceRoleId}
            onChange={(e) => setSourceRoleId(e.target.value)}
            className="app-input"
            style={{ minWidth: 280 }}
          >
            <option value="">Select current role...</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="targetRole" className="app-label">Target Role</label>
          <select
            id="targetRole"
            value={targetRoleId}
            onChange={(e) => setTargetRoleId(e.target.value)}
            className="app-input"
            style={{ minWidth: 280 }}
          >
            <option value="">Select target role...</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {err && (
        <div className="app-error" style={{ marginBottom: 16 }}>
          {err}
        </div>
      )}

      {(loading) && (
        <div style={{ marginBottom: 16, color: '#6b7280' }}>Loading comparison...</div>
      )}

      {gap && (
        <div style={{ marginBottom: 24 }}>
          <strong>Summary:</strong> <span style={{ color: '#6b7280' }}>{summaryText}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
        <div>
          <h2 className="app-section-title" style={{ marginBottom: 12 }}>Competencies</h2>
          <div className="app-card">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Competency</th>
                  <th>Source</th>
                  <th>Target</th>
                  <th>Delta</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mergedRows.map(row => (
                  <tr key={row.competency_id}>
                    <td style={{ textAlign: 'left' }}>{row.name}</td>
                    <td>{fmtLevel(row.source_level)}</td>
                    <td>{fmtLevel(row.target_level)}</td>
                    <td>{row.delta}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
                {mergedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#6b7280' }}>
                      Select roles to view comparison
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="app-section-title" style={{ marginBottom: 12 }}>Recommended Learning</h2>
          <div className="app-card" style={{ maxHeight: 560, overflowY: 'auto' }}>
            {gap?.recommendations?.length ? (
              <ul className="app-list">
                {gap.recommendations.map((item, idx) => {
                  const isLearning = typeof (item as any).title === 'string' || typeof (item as any).url === 'string';
                  const key = (item as any).id ?? `${idx}-${(item as any).competency_id ?? 'txt'}`;
                  if (isLearning) {
                    const li = item as LearningItem & {
                      type?: string | null;
                      competency_id?: string;
                      difficulty?: string | null;
                      provider?: string | null;
                    };
                    return (
                      <li key={key} className="app-list-item">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <a href={li.url || '#'} target="_blank" rel="noreferrer" className="app-link">
                              {li.title || 'Resource'}
                            </a>
                            <span className="badge" style={{ background: '#e5e7eb', color: '#374151' }}>
                              {li.type || 'Resource'}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>
                            Competency: {competencyNameForId(li.competency_id as any, targetComps) || 'N/A'} • Difficulty: {li.difficulty || 'N/A'} {li.provider ? `• ${li.provider}` : ''}
                          </div>
                        </div>
                      </li>
                    );
                  }
                  // Text-only suggestion
                  const txt = item as { text: string; competency_id?: string };
                  return (
                    <li key={key} className="app-list-item">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span className="app-link">{txt.text}</span>
                          <span className="badge" style={{ background: '#e5e7eb', color: '#374151' }}>
                            Suggestion
                          </span>
                        </div>
                        {txt.competency_id && (
                          <div style={{ fontSize: 12, color: '#6b7280' }}>
                            Competency: {competencyNameForId(txt.competency_id, targetComps) || 'N/A'}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div style={{ color: '#6b7280' }}>No recommendations yet. Select roles to compute gaps.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function difficultyScore(d?: string | null) {
  // Map textual difficulties to a simple numeric "cost" so that lower is better
  const v = (d || '').toLowerCase();
  if (v.includes('beginner') || v.includes('intro')) return 0;
  if (v.includes('intermediate') || v.includes('medium')) return 1;
  if (v.includes('advanced') || v.includes('expert')) return 2;
  return 1; // default medium
}

function fmtLevel(n?: number | null) {
  const v = typeof n === 'number' ? n : 0;
  switch (v) {
    case 0:
      return 'F';
    case 1:
      return 'P';
    case 2:
      return 'A';
    case 3:
      return 'Au';
    default:
      return String(v);
  }
}

function competencyNameForId(id: string, _comps: RoleCompetency[]) {
  // RoleCompetency does not include a name in our types; return the ID as a fallback label.
  return id || "";
}

const StatusPill: React.FC<{ status: 'green' | 'amber' | 'red' }> = ({ status }) => {
  const map = {
    green: { bg: '#DCFCE7', fg: '#065F46', label: 'Good' },
    amber: { bg: '#FEF3C7', fg: '#92400E', label: 'Minor Gap' },
    red: { bg: '#FEE2E2', fg: '#991B1B', label: 'Gap' },
  } as const;
  const s = map[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 600,
      }}
      aria-label={`Status ${s.label}`}
      title={s.label}
    >
      {s.label}
    </span>
  );
};

export default Compare;
