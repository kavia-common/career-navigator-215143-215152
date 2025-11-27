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

type DbRole = { code: string; name?: string | null };
type DbAdj = { source: string; target: string; weight?: number | null };

export function Graph(): JSX.Element {
  const [targetRoleId, setTargetRoleId] = useState<string>("");
  const [minWeight, setMinWeight] = useState<number>(1);
  const [gap, setGap] = useState<GapAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cool, setCool] = useState(false);

  const [nodes, setNodes] = useState<RoleNode[]>([]);
  const [edges, setEdges] = useState<RoleAdjacencyEdge[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // fetch roles
        const { data: roles, error: rerr } = await supabase.from("roles").select("code,name");
        if (rerr) throw rerr;
        // fetch adjacency
        const { data: adjs, error: aerr } = await supabase.from("role_adjacency").select("source,target,weight");
        if (aerr) throw aerr;

        if (!active) return;

        const hasDb = Array.isArray(roles) && roles.length > 0;
        if (hasDb) {
          const ns: RoleNode[] = (roles as DbRole[]).map((r) => ({
            id: r.code,
            title: r.name || r.code,
            group: "role",
          }));
          const es: RoleAdjacencyEdge[] = ((adjs as DbAdj[]) || []).map((a) => ({
            source: a.source,
            target: a.target,
            weight: typeof a.weight === "number" ? Math.max(1, Math.round((a.weight || 0) * 5)) : 1,
          }));
          setNodes(ns);
          setEdges(es);
          // default target
          setTargetRoleId(ns[0]?.id || "");
        } else {
          // fallback to minimal static when DB empty
          const fallbackEdges: RoleAdjacencyEdge[] = [
            { source: "CA", target: "CTO", weight: 5 },
            { source: "CIO", target: "CTO", weight: 4 },
          ];
          const roleTitles: Record<string, string> = { CA: "Chief Architect", CTO: "Chief Technology Officer", CIO: "Chief Information Officer" };
          const fallbackNodes: RoleNode[] = Array.from(new Set(fallbackEdges.flatMap((e) => [e.source, e.target]))).map((id) => ({
            id,
            title: roleTitles[id] ?? id,
            group: "role",
          }));
          setNodes(fallbackNodes);
          setEdges(fallbackEdges);
          setTargetRoleId(fallbackNodes[0]?.id || "");
        }
        setRolesLoaded(true);
      } catch {
        // If fetch fails, keep minimal static fallback
        const fallbackEdges: RoleAdjacencyEdge[] = [
          { source: "CA", target: "CTO", weight: 5 },
          { source: "CIO", target: "CTO", weight: 4 },
        ];
        const roleTitles: Record<string, string> = { CA: "Chief Architect", CTO: "Chief Technology Officer", CIO: "Chief Information Officer" };
        const fallbackNodes: RoleNode[] = Array.from(new Set(fallbackEdges.flatMap((e) => [e.source, e.target]))).map((id) => ({
          id,
          title: roleTitles[id] ?? id,
          group: "role",
        }));
        if (active) {
          setNodes(fallbackNodes);
          setEdges(fallbackEdges);
          setTargetRoleId(fallbackNodes[0]?.id || "");
          setRolesLoaded(true);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  const filteredEdges = useMemo(() => edges.filter((e) => (e.weight ?? 1) >= minWeight), [edges, minWeight]);

  const roleOptions = useMemo(
    () => nodes.map((n) => ({ id: n.id, title: n.title ?? n.id })).sort((a, b) => a.title.localeCompare(b.title)),
    [nodes]
  );

  const loadGap = async () => {
    setLoading(true);
    try {
      // For public graph we may not have a profile; call function allowing only target role.
      const { data, error } = await (supabase as any).functions.invoke("rpc_gap_analysis", {
        body: { target_role: targetRoleId },
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("rpc_gap_analysis error:", error.message);
        setGap(null);
      } else {
        const d: GapAnalysisResult = (data as any) || {};
        setGap(d);
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
    if (targetRoleId) loadGap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRoleId]);

  return (
    <section className="container" aria-labelledby="graph-title">
      <h1 id="graph-title">Role Graph</h1>
      {rolesLoaded && nodes.length === 0 && (
        <div role="note" style={{ color: "#9CA3AF", marginTop: 6 }}>
          No roles in catalog yet. Admins: seed roles via Admin console to enable the graph.
        </div>
      )}

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
