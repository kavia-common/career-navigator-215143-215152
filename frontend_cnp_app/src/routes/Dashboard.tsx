import React from "react";

// PUBLIC_INTERFACE
export function Dashboard(): JSX.Element {
  /** Auth-required default landing: a simple welcome panel. */
  return (
    <section>
      <h1 className="title">Dashboard</h1>
      <p className="description">Welcome back. Use the left navigation to explore your career journey.</p>
    </section>
  );
}
