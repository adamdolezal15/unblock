"use client";
import "reactflow/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Controls, MarkerType, ReactFlowProvider, useReactFlow, type Edge, type Node } from "reactflow";
import type { Deadlock, Graph, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step } from "@/lib/types";
import { layoutGraph, type LayoutEdge } from "@/lib/ui/graphLayout";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./RoutedEdge";

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

const INK = "#16181d";
const ACCENT = "#003580";
const QUIET = "#c9c3b7";
const NEAR = "#50555f";

/** Critical edges strong; others thin and light. With a focused node: its edges darken, the rest fade. */
function toEdge(e: LayoutEdge, selected: boolean, focus: string | null): Edge {
  const touches = focus !== null && (e.source === focus || e.target === focus);
  const faded = focus !== null && !touches && !selected;
  const color = selected ? INK : e.critical ? ACCENT : touches ? NEAR : QUIET;
  const width = e.critical ? 3 : selected || touches ? 2 : 1.25;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: "out",
    targetHandle: "in",
    type: "routed",
    data: { points: e.points },
    selected,
    zIndex: selected || touches ? 3 : e.critical ? 2 : 0,
    interactionWidth: 16,
    style: {
      stroke: color,
      strokeWidth: width,
      opacity: faded ? (e.critical ? 0.35 : 0.2) : 1,
      transition: "opacity 150ms, stroke 150ms",
      ...(e.backward ? { strokeDasharray: "6 5" } : {}),
    },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: e.critical ? 14 : 16, height: e.critical ? 14 : 16 },
  };
}

export function PlanGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({ graph, steps, items, criticalPath, conflicts, deadlocks, selection, onSelect }: Props) {
  const layout = useMemo(
    () => layoutGraph({ graph, steps, items, criticalPath, conflicts, deadlocks }),
    [graph, steps, items, criticalPath, conflicts, deadlocks],
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const selectedNode = selection?.kind === "step" ? selection.id : null;
  const selectedEdge = selection?.kind === "edge" ? selection.id : null;
  const focus = hovered ?? selectedNode;

  const neighbours = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of layout.edges) {
      if (e.source === focus) s.add(e.target);
      if (e.target === focus) s.add(e.source);
    }
    return s;
  }, [focus, layout]);

  const nodes: Node[] = useMemo(
    () =>
      layout.nodes.map((n) => {
        const interactive = n.type === "step" || n.type === "anyof";
        return {
          id: n.id,
          type: n.type,
          position: { x: n.x, y: n.y },
          data: interactive ? { ...n.data, faded: !!neighbours && !neighbours.has(n.id) } : n.data,
          zIndex: n.zIndex,
          draggable: false,
          connectable: false,
          selectable: interactive,
          focusable: interactive,
          selected: n.id === selectedNode,
          ...(interactive ? {} : { className: "pointer-events-none" }),
        };
      }),
    [layout, selectedNode, neighbours],
  );
  const edges = useMemo(() => layout.edges.map((e) => toEdge(e, e.id === selectedEdge, focus)), [layout, selectedEdge, focus]);

  // Refit whenever the shape changes (graph arrives, dates arrive) or the container resizes (panel opens).
  const { fitView } = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const shape = `${layout.width}x${layout.height}:${layout.nodes.length}:${layout.dated}`;
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ padding: 0.05, duration: 250 }));
    return () => cancelAnimationFrame(id);
  }, [shape, fitView]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitView({ padding: 0.05 }));
    });
    ro.observe(el);
    return () => (ro.disconnect(), cancelAnimationFrame(raf));
  }, [fitView]);

  const interactive = (t?: string) => t === "step" || t === "anyof";
  return (
    <div ref={box} className="plan-graph h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.6}
        fitView
        fitViewOptions={{ padding: 0.05 }}
        onNodeMouseEnter={(_, n) => interactive(n.type) && setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeClick={(_, n) => interactive(n.type) && onSelect({ kind: "step", id: n.id })}
        onEdgeClick={(_, e) => onSelect({ kind: "edge", id: e.id, source: e.source, target: e.target })}
        onPaneClick={() => onSelect(null)}
      >
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function GraphLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-muted">
      <li className="flex items-center gap-2">
        <span className="inline-block h-[3px] w-6 bg-accent" /> Critical path
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rotate-45 border-[1.5px] border-ink" /> Any one is enough
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3.5 w-5 rounded-[3px] border border-dashed border-ink/40" /> One visit
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-amber-dot" /> Sources disagree
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-ink" /> Official source
      </li>
      <li>
        <span className="num text-ink">*</span> Estimated date
      </li>
    </ul>
  );
}
