import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GapAnalysisResult, ReadinessBand, RoleAdjacencyEdge, RoleNode } from '../lib/types';
import { getRoleAdjacency } from '../lib/logic/adjacency';
import { computeGapReadiness } from '../lib/logic/gap';

/**
 * PUBLIC_INTERFACE
 * GraphD3Props describes the inputs needed to render the D3 force-directed adjacency graph.
 */
export interface GraphD3Props {
  /** The role to evaluate readiness against (target role). */
  targetRoleId: string;
  /** List of all role nodes available to render. If not provided, we infer from edges. */
  nodes?: RoleNode[];
  /** Weighted adjacency edges describing role relations. */
  edges?: RoleAdjacencyEdge[];
  /** Latest gap-analysis result for the active user/profile used to color readiness. */
  gapAnalysis?: GapAnalysisResult | null;
  /** Called when user selects a role node */
  onSelectRole?: (roleId: string) => void;
  /** Optional filter function to show/hide edges */
  edgeFilter?: (e: RoleAdjacencyEdge) => boolean;
  /** Optional filter function to show/hide nodes */
  nodeFilter?: (n: RoleNode) => boolean;
  /** Width/height for the SVG viewport */
  width?: number;
  height?: number;
  /** If true, layout is stabilized and simulation is cooled. */
  cool?: boolean;
}

/**
 * PUBLIC_INTERFACE
 * GraphD3 renders a force-directed graph of roles and their adjacencies and
 * colors nodes by readiness (from rpc_gap_analysis) for the selected target role.
 * - Deterministic initial node positions via stable hash (roleId + targetRoleId).
 * - Live re-render on gapAnalysis or profile changes.
 * - Edge thickness reflects adjacency weight.
 * - Minimalist theme-aligned styling.
 */
export const GraphD3: React.FC<GraphD3Props> = ({
  targetRoleId,
  nodes,
  edges,
  gapAnalysis,
  onSelectRole,
  edgeFilter,
  nodeFilter,
  width = 960,
  height = 640,
  cool = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);

  // Fallback to compute adjacency if not provided
  const computedEdges = useMemo<RoleAdjacencyEdge[]>(() => {
    const baseEdges = edges ?? getRoleAdjacency().map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));
    return edgeFilter ? baseEdges.filter(edgeFilter) : baseEdges;
  }, [edges, edgeFilter]);

  const nodeIdSetFromEdges = useMemo(() => {
    const s = new Set<string>();
    computedEdges.forEach(e => {
      s.add(e.source);
      s.add(e.target);
    });
    return s;
  }, [computedEdges]);

  const computedNodes = useMemo<RoleNode[]>(() => {
    if (nodes && nodes.length) {
      return nodeFilter ? nodes.filter(nodeFilter) : nodes;
    }
    // Infer nodes from edges if nodes not provided
    const inferred: RoleNode[] = Array.from(nodeIdSetFromEdges).map(id => ({
      id,
      title: id,
      group: 'role',
    }));
    return nodeFilter ? inferred.filter(nodeFilter) : inferred;
  }, [nodes, nodeFilter, nodeIdSetFromEdges]);

  // Build readiness map for coloring: roleId -> readiness band (e.g., 'ready', 'near', 'far')
  const readinessMap = useMemo(() => {
    if (!gapAnalysis) return new Map<string, ReadinessBand>();
    return computeGapReadiness(gapAnalysis, targetRoleId);
  }, [gapAnalysis, targetRoleId]);

  // Deterministic initial positions using a hash of roleId and targetRoleId
  const initialPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const prng = (seed: number) => {
      let t = seed | 0;
      return () => {
        // xorshift-like simple PRNG (deterministic)
        t ^= t << 13;
        t ^= t >>> 17;
        t ^= t << 5;
        return (t >>> 0) / 0xFFFFFFFF;
      };
    };
    const strHash = (s: string) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
      }
      return h >>> 0;
    };

    const seed = strHash(`graph-seed:${targetRoleId}:${computedNodes.length}:${computedEdges.length}`);
    const rand = prng(seed);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;

    computedNodes.forEach((n, idx) => {
      const r1 = rand();
      const r2 = rand();
      const angle = (2 * Math.PI * (idx + r1)) / Math.max(1, computedNodes.length);
      const jitter = (r2 - 0.5) * (radius * 0.15);
      const x = cx + Math.cos(angle) * radius + jitter;
      const y = cy + Math.sin(angle) * radius + jitter;
      map.set(n.id, { x, y });
    });
    // Place target role closer to center
    map.set(targetRoleId, { x: cx, y: cy });
    return map;
  }, [targetRoleId, computedNodes, computedEdges, width, height]);

  // Scales
  const weightExtent = useMemo(() => {
    const weights = computedEdges.map(e => e.weight ?? 1);
    const min = Math.min(...weights, 1);
    const max = Math.max(...weights, 1);
    return [min, max] as [number, number];
  }, [computedEdges]);

  const linkWidth = useMemo(() => {
    const [min, max] = weightExtent;
    return d3.scaleLinear().domain([min, max]).range([0.6, 4.5]).nice();
  }, [weightExtent]);

  const colorForReadiness = (band: ReadinessBand | undefined) => {
    // Ocean Professional theme alignment
    // success: #10B981, secondary: #9CA3AF, error: #EF4444
    switch (band) {
      case 'ready':
        return '#10B981';
      case 'near':
        return '#9CA3AF';
      case 'far':
        return '#EF4444';
      default:
        return '#374151'; // primary for unknown
    }
  };

  const outlineForNode = (id: string) => {
    if (id === targetRoleId) return '#111827';
    return '#FFFFFF';
  };

  // Render effect
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous SVG if any
    if (svgRef.current) {
      svgRef.current.remove();
      svgRef.current = null;
    }

    const margin = { top: 8, right: 8, bottom: 8, left: 8 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', '#FFFFFF')
      .style('border-radius', '8px')
      .style('box-shadow', '0 1px 2px rgba(0,0,0,0.05)');

    svgRef.current = svg.node() as SVGSVGElement;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Zoom & pan
    const zoomed = (event: any) => {
      g.attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`);
    };
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.4, 3]).on('zoom', zoomed);
    svg.call(zoom as any);

    // Build data copies with positions
    type SimNode = d3.SimulationNodeDatum & RoleNode & { fx?: number | null; fy?: number | null };
    type SimEdge = d3.SimulationLinkDatum<SimNode> & { weight?: number };

    const nodeIndex: Record<string, SimNode> = {};
    const nodesData: SimNode[] = computedNodes.map((n) => {
      const p = initialPos.get(n.id);
      const nn: SimNode = { ...n, x: p?.x, y: p?.y };
      nodeIndex[n.id] = nn;
      return nn;
    });

    // Create simulation edges with d3 node references
    const edgesData: SimEdge[] = computedEdges
      .filter(e => nodeIndex[e.source] && nodeIndex[e.target])
      .map(e => ({ source: nodeIndex[e.source], target: nodeIndex[e.target], weight: e.weight }));

    // Force simulation
    const distanceScale = d3.scaleLinear().domain([weightExtent[0], weightExtent[1]]).range([180, 60]);
    const simulation = d3.forceSimulation<SimNode>(nodesData)
      .force('link', d3.forceLink<SimNode, SimEdge>(edgesData).id(d => d.id).distance((l) => {
        const wgt = (l.weight ?? 1);
        return distanceScale(wgt);
      }))
      .force('charge', d3.forceManyBody().strength(-160))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(24))
      .alpha(1);

    if (cool) {
      simulation.alphaDecay(0.08);
    } else {
      simulation.alphaDecay(0.02);
    }

    // Define marker for arrows (optional future use)
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 12)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#9CA3AF');

    // Links
    const link = g.append('g')
      .attr('stroke', '#E5E7EB')
      .attr('stroke-opacity', 0.9)
      .selectAll('line')
      .data(edgesData)
      .join('line')
      .attr('stroke-width', d => linkWidth(d.weight ?? 1));

    // Nodes
    const node = g.append('g')
      .selectAll('g.node')
      .data(nodesData)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (_, d) => {
        onSelectRole?.(d.id);
      })
      .on('mouseover', (_, d) => setHoveredRole(d.id))
      .on('mouseout', () => setHoveredRole(null));

    // Apply drag with a safe cast to avoid d3 type generic mismatch in TS
    (node as unknown as d3.Selection<SVGGElement, SimNode, any, any>).call(
      d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x!;
          d.fy = d.y!;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    node.append('circle')
      .attr('r', (d) => (d.id === targetRoleId ? 12 : 9))
      .attr('fill', d => colorForReadiness(readinessMap.get(d.id)))
      .attr('stroke', d => outlineForNode(d.id))
      .attr('stroke-width', d => (d.id === targetRoleId ? 2.5 : 1.5))
      .attr('opacity', d => (hoveredRole && hoveredRole !== d.id ? 0.9 : 1));

    node.append('text')
      .text(d => d.title ?? d.id)
      .attr('x', 14)
      .attr('y', 4)
      .attr('font-size', 12)
      .attr('font-family', 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial')
      .attr('fill', '#374151');

    // Tick handler
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
      svg.remove();
    };
  }, [
    width,
    height,
    computedNodes,
    computedEdges,
    initialPos,
    linkWidth,
    readinessMap,
    targetRoleId,
    onSelectRole,
    cool,
  ]);

  // Legend + simple header overlay
  return (
    <div style={{ width, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <strong style={{ color: '#111827' }}>Role adjacency by readiness</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LegendItem color="#10B981" label="Ready" />
          <LegendItem color="#9CA3AF" label="Near" />
          <LegendItem color="#EF4444" label="Far" />
          <LegendItem color="#374151" label="Unknown" />
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
};

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 12,
          background: color,
          display: 'inline-block',
          border: '1px solid #D1D5DB',
        }}
      />
      <span style={{ color: '#374151', fontSize: 12 }}>{label}</span>
    </div>
  );
};

export default GraphD3;
