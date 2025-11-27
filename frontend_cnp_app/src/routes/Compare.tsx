import React from "react";
import { compareRoles } from "../lib/logic/compare";

// PUBLIC_INTERFACE
export function Compare(): JSX.Element {
  /** Compare roles, competencies, and evidence. */
  // simple demo to validate module wiring
  const demo = compareRoles(
    [
      { role_code: "A", competency_id: "c1", target: 80 },
      { role_code: "A", competency_id: "c2", target: 50 },
    ],
    [
      { role_code: "B", competency_id: "c1", target: 60 },
      { role_code: "B", competency_id: "c2", target: 60 },
      { role_code: "B", competency_id: "c3", target: 20 },
    ]
  );

  return (
    <section>
      <h1 className="title">Compare</h1>
      <p className="description">Compare roles, competencies, and gaps side-by-side.</p>
      <div style={{ fontSize: 12, color: "var(--ocean-secondary)" }}>
        Overlap: {(demo.overlapPercent * 100).toFixed(0)}%
      </div>
    </section>
  );
}
