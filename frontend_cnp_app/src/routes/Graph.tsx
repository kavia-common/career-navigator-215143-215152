import React, { useEffect, useMemo, useState } from "react";
import GraphD3 from "../components/GraphD3";
import type { GapAnalysisResult } from "../lib/types";
import { supabase } from "../lib/supabaseClient";

/**
 * Local static adjacency/nodes seed for MVP graph.
 * Replace with DB-driven lists when role_adjacency and roles are populated.
 */
type RoleNode = { id: string; title?: string; group?: string };
type RoleAdjacencyEdge = { source: string; target: string; weight?: number };

// Roles dictionary for nicer labels
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
  // mirror edges for undirected look
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

const seedNodes: RoleNode[] = Array.from(
  new Set(seedEdges.flatMap((e) => [e.source, e.target]))
).map((id) => ({ id, title: roleTitles[id] ?? id, group: "role" }));

const containerStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 1200,
  margin: "0 auto",
};

const panelStyle: React.CSSProperties = {
  background: "#F9FAFB",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  marginBottom: 12,
};

// PUBLIC_INTERFACE
export function Graph(): JSX.Element {
  /**
   * Graph page integrating D3 graph with filters and readiness coloring via RPC.
   */
  const [targetRoleId, setTargetRoleId] = useState<string>("CTO");
  const [minWeight, setMinWeight] = useState<number>(1);
  const [gap, setGap] = useState<GapAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cool, setCool] = useState(false);

  const nodes = seedNodes;
  const edges = seedEdges;

  const filteredEdges = useMemo(
    () => edges.filter((e) => (e.weight ?? 1) >= minWeight),
    [edges, minWeight]
  );

  const roleOptions = useMemo(
    () =>
      nodes
        .map((n) => ({ id: n.id, title: n.title ?? n.id }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [nodes]
  );

  const loadGap = async () => {
    setLoading(true);
    try {
      // Call Edge Function rpc_gap_analysis. Backend implementation can vary; pass minimal payload.
      const { data, error } = await supabase.functions.invoke("rpc_gap_analysis", {
        body: { target_role_id: targetRoleId },
      });
      if (error) {
        console.warn("rpc_gap_analysis error:", error.message);
        setGap(null);
      } else {
        setGap({
          target_role_id: targetRoleId,
          details: data ?? {},
        });
      }
    } catch (e) {
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
    <div style={containerStyle}>
      <h1 style={{ color: "#111827", marginBottom: 12 }}>Career Navigator - Role Graph</h1>

      <div style={panelStyle}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#374151" }}>Target role</label>
            <select
              value={targetRoleId}
              onChange={(e) => setTargetRoleId(e.target.value)}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #D1D5DB",
                background: "#FFFFFF",
                color: "#111827",
                minWidth: 200,
              }}
            >
              {roleOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#374151" }}>Min edge weight</label>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={minWeight}
              onChange={(e) => setMinWeight(parseInt(e.target.value, 10))}
            />
            <span style={{ marginLeft: 8, color: "#374151" }}>{minWeight}</span>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#374151" }}>Stabilize layout</label>
            <input type="checkbox" checked={cool} onChange={(e) => setCool(e.target.checked)} />
          </div>

          <div>
            <button
              onClick={loadGap}
              disabled={loading}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                background: "#374151",
                color: "#FFFFFF",
                border: "none",
              }}
            >
              {loading ? "Refreshing…" : "Refresh readiness"}
            </button>
          </div>
        </div>
      </div>

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
  );
}

export default Graph;
