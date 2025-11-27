import React from "react";
import { deriveGraph } from "../lib/logic/adjacency";

// PUBLIC_INTERFACE
export function Graph(): JSX.Element {
  /** Placeholder for interactive career graph (D3 to be added later). */
  const graph = deriveGraph(
    [
      { code: "CA", name: "Chief Architect" },
      { code: "CTO", name: "CTO (AI & Tech)" },
      { code: "CIO", name: "CIO" },
    ],
    [
      { source: "CA", target: "CTO", weight: 0.8 },
      { source: "CA", target: "CIO", weight: 0.5 },
      { source: "CTO", target: "CIO", weight: 0.6 },
    ],
    120
  );

  return (
    <section>
      <h1 className="title">Career Graph</h1>
      <p className="description">Visualize role adjacencies and competency pathways.</p>
      <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
        Nodes: {graph.nodes.length} • Links: {graph.links.length}
      </div>
    </section>
  );
}
