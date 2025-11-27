import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { getCurrentUserProfile } from "../lib/api";

// PUBLIC_INTERFACE
export function Home(): JSX.Element {
  /** Minimal Home route; demonstrates D3 readiness and Supabase call path. */
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    // Draw a tiny D3 bar for readiness signal
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    const w = 220;
    const h = 80;
    svg.attr("viewBox", `0 0 ${w} ${h}`);
    const data = [10, 30, 18, 25, 12];

    const x = d3
      .scaleBand()
      .domain(data.map((_, i) => i.toString()))
      .range([10, w - 10])
      .padding(0.2);

    const y = d3.scaleLinear().domain([0, d3.max(data) ?? 0]).range([h - 10, 10]);

    svg
      .append("g")
      .selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (_, i) => (x(i.toString()) ?? 0))
      .attr("y", (d) => y(d))
      .attr("width", x.bandwidth())
      .attr("height", (d) => h - 10 - y(d))
      .attr("fill", "var(--ocean-primary)")
      .attr("rx", 4);

    // Touch Supabase path (no auth required; safe to ignore errors)
    getCurrentUserProfile().then((res) => {
      // eslint-disable-next-line no-console
      if (res.error) console.debug("Profile not available (expected if not logged in):", res.error);
      else console.debug("Profile:", res.data);
    });
  }, []);

  return (
    <section>
      <h1 className="title">Welcome to Career Navigator</h1>
      <p className="description">
        A minimalist starting point. TypeScript, Supabase, D3, routing, XLSX, and PDF are installed.
      </p>
      <svg ref={ref} role="img" aria-label="Readiness mini chart" />
    </section>
  );
}
