import React from "react";
import { computeGapAnalysis } from "../lib/logic/gap";

// PUBLIC_INTERFACE
export function Dashboard(): JSX.Element {
  /** Auth-required default landing: a simple welcome panel. */
  const sample = computeGapAnalysis(
    [
      { role_code: "T", competency_id: "c1", target: 80 },
      { role_code: "T", competency_id: "c2", target: 40 },
    ],
    [
      { profile_id: "p1", competency_id: "c1", level: 50 },
      { profile_id: "p1", competency_id: "c2", level: 30 },
    ]
  );

  return (
    <section>
      <h1 className="title">Dashboard</h1>
      <p className="description">Welcome back. Use the left navigation to explore your career journey.</p>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--ocean-secondary)" }}>
        Readiness: {(sample.readiness * 100).toFixed(0)}% • Overlap: {(sample.overlap * 100).toFixed(0)}%
      </div>
    </section>
  );
}
