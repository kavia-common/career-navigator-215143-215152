import React, { useEffect, useMemo, useState } from "react";
import GraphD3 from "../components/GraphD3";
import type { GapAnalysisResult } from "../lib/types";
import { supabase } from "../lib/supabaseClient";
import "../styles/theme.css";
import "../styles/graph.css";

/**
 * PUBLIC_INTERFACE
 * Graph page integrating D3 graph with filters and readiness RPC; minimalist layout and ARIA landmarks.
 */
type RoleNode = { id: string; title?: string; group?: string };
type RoleAdjacencyEdge = { source: string; target: string; weight?: number };

const roleTitles: Record<string, string> = {
  CA: "Chief Architect",
  CTO: "Chief Technology Officer",
  CIO: "Chief Information Officer",
  CDAO: "Chief Data & Analytics Officer",
  CInO: "Chief Innovation Officer",
  CPTO: "Chief Product & Technology Officer",
  CTrO: "Chief Transformation Officer",
  FCTO: "Functional CTO",
  Infra: "Infrastructure Leader",
  Ops: "Operations Leader",
  PMO: "PMO Leader",
  DigProd: "Digital Product Leader",
};

const seedEdges: RoleAdjacencyEdge[] = [
  { source: "CA", target: "CTO", weight: 5 },
  { source: "CIO", target: "CTO", weight: 4 },
  { source: "CDAO", target: "CTO", weight: 3 },
  { source: "CInO", target: "CTO", weight: 3 },
  { source: "CPTO", target: "CTO", weight: 4 },
  { source: "CTrO", target: "CTO", weight: 2 },
  { source: "FCTO", target: "CTO", weight: 2 },
  { source: "Infra", target: "CTO", weight: 3 },
  { source: "Ops", target: "CTO", weight: 3 },
  { source: "PMO", target: "CTO", weight: 2 },
  { source: "DigProd", target: "CTO", weight: 4 },
  { source: "CTO", target: "CA", weight: 5 },
  { source: "CTO", target: "CIO", weight: 4 },
  { source: "CTO", target: "CDAO", weight: 3 },
  { source: "CTO", target: "CInO", weight: 3 },
  { source: "CTO", target: "CPTO", weight: 4 },
  { source: "CTO", target: "CTrO", weight: 2 },
  { source: "CTO", target: "FCTO", weight: 2 },
  { source: "CTO", target: "Infra", weight: 3 },
  { source: "CTO", target: "Ops", weight: 3 },
  { source: "CTO", target: "PMO", weight: 2 },
  { source: "CTO", target: "DigProd", weight: 4 },
];

const seedNodes: RoleNode[] = Array.from(new Set(seedEdges.flatMap((e) => [e.source, e.target]))).map((id) => ({
  id,
  title: roleTitles[id] ?? id,
  group: "role",
}));

export function Graph(): JSX.Element {
  const [targetRoleId, setTargetRoleId] = useState<string>("CTO");
  const [minWeight, setMinWeight] = useState<number>(1);
  const [gap, setGap] = useState<GapAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cool, setCool] = useState(false);

  const nodes = seedNodes;
  const edges = seedEdges;

  const filteredEdges = useMemo(() => edges.filter((e) => (e.weight ?? 1) >= minWeight), [edges, minWeight]);

  const roleOptions = useMemo(
    () => nodes.map((n) => ({ id: n.id, title: n.title ?? n.id })).sort((a, b) => a.title.localeCompare(b.title)),
    [nodes]
  );

  const loadGap = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rpc_gap_analysis", {
        body: { target_role_id: targetRoleId },
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("rpc_gap_analysis error:", error.message);
        setGap(null);
      } else {
        setGap({ target_role_id: targetRoleId, details: data ?? {} });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("rpc_gap_analysis failed", e);
      setGap(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRoleId]);

  return (
    <section className="container" aria-labelledby="graph-title">
      <h1 id="graph-title">Role Graph</h1>

      <div className="card mt-4">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label htmlFor="targetRole" style={{ display: "block", fontSize: 12, color: "#374151" }}>Target role</label>
            <select
              id="targetRole"
              value={targetRoleId}
              onChange={(e) => setTargetRoleId(e.target.value)}
              className="input"
              style={{ minWidth: 200 }}
            >
              {roleOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="minWeight" style={{ display: "block", fontSize: 12, color: "#374151" }}>Min edge weight</label>
            <input id="minWeight" type="range" min="1" max="5" step="1" value={minWeight} onChange={(e) => setMinWeight(parseInt(e.target.value, 10))} />
            <span style={{ marginLeft: 8, color: "#374151" }}>{minWeight}</span>
          </div>

          <div>
            <label htmlFor="cool" style={{ display: "block", fontSize: 12, color: "#374151" }}>Stabilize layout</label>
            <input id="cool" type="checkbox" checked={cool} onChange={(e) => setCool(e.target.checked)} />
          </div>

          <div>
            <button onClick={loadGap} disabled={loading} className="btn btn-primary">
              {loading ? "Refreshing…" : "Refresh readiness"}
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-4" role="region" aria-label="Interactive role graph">
        <div className="graph-container">
          <GraphD3
            targetRoleId={targetRoleId}
            nodes={nodes}
            edges={filteredEdges}
            gapAnalysis={gap || undefined}
            onSelectRole={(id) => setTargetRoleId(id)}
            width={1100}
            height={720}
            cool={cool}
          />
        </div>
      </div>
    </section>
  );
}

export default Graph;
