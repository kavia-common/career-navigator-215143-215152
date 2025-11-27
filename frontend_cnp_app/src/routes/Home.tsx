import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { getCurrentUserProfile } from "../lib/api";
import "../styles/theme.css";

/**
 * PUBLIC_INTERFACE
 * Home: minimalist welcome with tiny D3 spark and accessible labels.
 */
export function Home(): JSX.Element {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    const w = 220;
    const h = 80;
    svg.attr("viewBox", `0 0 ${w} ${h}`);
    const data = [10, 30, 18, 25, 12];

    const x = d3.scaleBand().domain(data.map((_, i) => i.toString())).range([10, w - 10]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(data) ?? 0]).range([h - 10, 10]);

    svg.append("g")
      .selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (_, i) => (x(i.toString()) ?? 0))
      .attr("y", (d) => y(d))
      .attr("width", x.bandwidth())
      .attr("height", (d) => h - 10 - y(d))
      .attr("fill", "var(--color-primary)")
      .attr("rx", 4);

    getCurrentUserProfile().then((res) => {
      // eslint-disable-next-line no-console
      if (res.error) console.debug("Profile not available (if not logged in):", res.error);
      else console.debug("Profile:", res.data);
    });
  }, []);

  return (
    <section className="container" aria-labelledby="home-title">
      <h1 id="home-title">Welcome to Career Navigator</h1>
      <p className="mb-4" style={{ color: "var(--color-secondary)" }}>
        Sign in to access your dashboard and planning tools.
      </p>
      <div className="card">
        <svg ref={ref} role="img" aria-label="Readiness mini chart" />
      </div>
    </section>
  );
}

export default Home;
