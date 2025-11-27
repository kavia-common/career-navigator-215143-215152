import React from "react";

// PUBLIC_INTERFACE
export function Admin(): JSX.Element {
  /** Admin surface (stub). Access controlled by AuthGuard adminOnly. */
  return (
    <section>
      <h1 className="title">Admin</h1>
      <p className="description">Administration console (access restricted).</p>
    </section>
  );
}
