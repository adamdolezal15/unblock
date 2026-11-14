"use client";
import "reactflow/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Controls, MarkerType, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeMouseHandler, type EdgeMouseHandler } from "reactflow";
import type { Deadlock, Graph, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step } from "@/lib/types";
import { layoutGraph, type Layout } from "@/lib/ui/graphLayout";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./RoutedEdge";
import { Term } from "../Help";

export type Selection = { kind: "step"; id: string } | { kind: "edge"; id: string; source: string; target: string } | null;

type Props = {
  graph: Graph;
  steps: Record<string, Step>;
  items?: Record<string, ScheduledStep>;
  criticalPath?: string[];
  conflicts: Conflict[];
  deadlocks: Deadlock[];
  selection: Selection;
  onSelect: (s: Selection) => void;
};

const ACCENT = "#003580";
const QUIET = "#a29c90";

/** Class-safe token for an id (ids can contain ":" or "#"). */
const tok = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * React Flow nodes and edges, built once per layout. Hover and selection never touch them: they are
 * applied by a small stylesheet (see focusCss), so React Flow does not re-render or re-measure anything.
 */
function toFlow(layout: Layout): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = layout.nodes.map((n) => {
    const interactive = n.type === "step" || n.type === "anyof";
    return {
      id: n.id,
      type: n.type,
      position: { x: n.x, y: n.y },
      data: n.data,
      zIndex: n.zIndex,
      draggable: false,
      connectable: false,
      selectable: false,
      focusable: interactive,
      className: interactive ? `pg-node pg-n-${tok(n.id)}` : "pointer-events-none",
    };
  });
  const edges: Edge[] = layout.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: "out",
    targetHandle: "in",
    type: "routed",
    data: { points: e.points },
    zIndex: e.critical ? 2 : 0,
    interactionWidth: 16,
    className: `pg-edge ${e.critical ? "pg-crit" : "pg-quiet"} ${e.backward ? "pg-back" : ""} pg-s-${tok(e.source)} pg-t-${tok(e.target)} pg-e-${tok(e.id)}`,
    markerEnd: { type: MarkerType.ArrowClosed, color: e.critical ? ACCENT : QUIET, width: e.critical ? 14 : 16, height: e.critical ? 14 : 16 },
  }));
  return { nodes, edges };
}

/** Stylesheet for the focused node (hover, else selection) and the selected node / edge. */
function focusCss(layout: Layout, focus: string | null, selection: Selection): string {
  const rules: string[] = [];
  if (focus) {
    const near = new Set([focus]);
    for (const e of layout.edges) {
      if (e.source === focus) near.add(e.target);
      if (e.target === focus) near.add(e.source);
    }
    const f = tok(focus);
    rules.push(
      `.plan-graph .pg-node{opacity:.4}`,
      [...near].map((id) => `.plan-graph .pg-n-${tok(id)}`).join(",") + `{opacity:1}`,
      `.plan-graph .pg-edge{opacity:.15}`,
      `.plan-graph .pg-s-${f},.plan-graph .pg-t-${f}{opacity:1}`,
      `.plan-graph .pg-quiet.pg-s-${f} .react-flow__edge-path,.plan-graph .pg-quiet.pg-t-${f} .react-flow__edge-path{stroke:#3f444d;stroke-width:2.25px}`,
    );
  }
  if (selection?.kind === "step") rules.push(`.plan-graph .pg-n-${tok(selection.id)} > div{box-shadow:0 0 0 3px rgba(0,53,128,.28)}`);
  if (selection?.kind === "edge") rules.push(`.plan-graph .pg-e-${tok(selection.id)}{opacity:1} .plan-graph .pg-e-${tok(selection.id)} .react-flow__edge-path{stroke:#16181d;stroke-width:3px}`);
  return rules.join("\n");
}

export function PlanGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({ graph, steps, items, criticalPath, conflicts, deadlocks, selection, onSelect }: Props) {
  // Layout depends on run data only (once per graph / schedule / conflict change), never on hover or selection.
  const layout = useMemo(
    () => layoutGraph({ graph, steps, items, criticalPath, conflicts, deadlocks }),
    [graph, steps, items, criticalPath, conflicts, deadlocks],
  );
  const flow = useMemo(() => toFlow(layout), [layout]);
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = hovered ?? (selection?.kind === "step" ? selection.id : null);
  const css = focusCss(layout, focus, selection);

  // Fit when the layout's shape changes (graph arrives, dates arrive) and when the container resizes.
  const { fitView } = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const shape = `${layout.width}x${layout.height}:${layout.nodes.length}:${layout.dated}`;
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ padding: 0.05 }));
    return () => cancelAnimationFrame(id);
  }, [shape, fitView]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let raf = 0;
    let last = `${el.clientWidth}x${el.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const now = `${el.clientWidth}x${el.clientHeight}`;
      if (now === last) return;
      last = now;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitView({ padding: 0.05 }));
    });
    ro.observe(el);
    return () => (ro.disconnect(), cancelAnimationFrame(raf));
  }, [fitView]);

  const isStep = (t?: string) => t === "step" || t === "anyof";
  const onNodeClick: NodeMouseHandler = useCallback((_, n) => isStep(n.type) && onSelect({ kind: "step", id: n.id }), [onSelect]);
  const onEdgeClick: EdgeMouseHandler = useCallback((_, e) => onSelect({ kind: "edge", id: e.id, source: e.source, target: e.target }), [onSelect]);
  const onEnter: NodeMouseHandler = useCallback((_, n) => isStep(n.type) && setHovered(n.id), []);
  const onLeave = useCallback(() => setHovered(null), []);

  return (
    <div ref={box} className="plan-graph h-full w-full">
      <style>{css}</style>
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.6}
        fitView
        fitViewOptions={{ padding: 0.05 }}
        onNodeMouseEnter={onEnter}
        onNodeMouseLeave={onLeave}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
      >
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function GraphLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] text-muted">
      <li className="flex items-center gap-2">
        <span className="inline-block h-[3px] w-6 shrink-0 bg-accent" /> <Term term="slowest" long />
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rotate-45 border-[1.5px] border-ink" /> <Term term="either" />
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3.5 w-5 shrink-0 rounded-[3px] border border-dashed border-ink/40" /> <Term term="oneVisit" />
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-amber-dot" /> <Term term="disagree" long />
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-ink" /> Official source
      </li>
      <li className="flex items-center gap-2">
        <span className="num text-ink">*</span> <Term term="estimate" />
      </li>
    </ul>
  );
}
