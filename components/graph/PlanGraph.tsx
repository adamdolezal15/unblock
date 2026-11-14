"use client";
import "reactflow/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import ReactFlow, { Controls, MarkerType, ReactFlowProvider, useReactFlow, type Edge, type Node } from "reactflow";
import type { Deadlock, Graph, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step } from "@/lib/types";
import { layoutGraph, type LayoutEdge } from "@/lib/ui/graphLayout";
import { nodeTypes } from "./nodes";

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
const EDGE = "#7d828b";

function toEdge(e: LayoutEdge, selected: boolean): Edge {
  const color = selected ? INK : e.critical ? ACCENT : EDGE;
  const width = e.critical ? 3 : selected ? 2.25 : 1.5;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.backward ? "back-out" : "out",
    targetHandle: e.backward ? "back-in" : "in",
    type: e.backward ? "default" : "smoothstep",
    pathOptions: e.backward ? undefined : { borderRadius: 10, offset: 14 },
    selected,
    zIndex: e.critical ? 2 : selected ? 3 : 0,
    interactionWidth: 18,
    style: { stroke: color, strokeWidth: width, ...(e.backward ? { strokeDasharray: "6 5" } : {}) },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    ...(e.label
      ? {
          label: e.label,
          labelStyle: { fill: "#50555f", fontSize: 14, fontWeight: 500 },
          labelBgStyle: { fill: "#f7f5f0" },
          labelBgPadding: [4, 2] as [number, number],
        }
      : {}),
  } as Edge;
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
  const selectedNode = selection?.kind === "step" ? selection.id : null;
  const selectedEdge = selection?.kind === "edge" ? selection.id : null;

  const nodes: Node[] = useMemo(
    () =>
      layout.nodes.map((n) => {
        const interactive = n.type === "step" || n.type === "anyof";
        return {
          id: n.id,
          type: n.type,
          position: { x: n.x, y: n.y },
          data: n.data,
          zIndex: n.zIndex,
          draggable: false,
          connectable: false,
          selectable: interactive,
          focusable: interactive,
          selected: n.id === selectedNode,
          ...(interactive ? {} : { className: "pointer-events-none" }),
        };
      }),
    [layout, selectedNode],
  );
  const edges = useMemo(() => layout.edges.map((e) => toEdge(e, e.id === selectedEdge)), [layout, selectedEdge]);

  // Refit whenever the shape changes (graph arrives, dates arrive) or the container resizes (panel opens).
  const { fitView } = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const shape = `${layout.width}x${layout.height}:${layout.nodes.length}:${layout.dated}`;
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ padding: 0.06, duration: 250 }));
    return () => cancelAnimationFrame(id);
  }, [shape, fitView]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitView({ padding: 0.06 }));
    });
    ro.observe(el);
    return () => (ro.disconnect(), cancelAnimationFrame(raf));
  }, [fitView]);

  return (
    <div ref={box} className="plan-graph h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
        fitViewOptions={{ padding: 0.06 }}
        onNodeClick={(_, n) => (n.type === "step" || n.type === "anyof") && onSelect({ kind: "step", id: n.id })}
        onEdgeClick={(_, e) => onSelect({ kind: "edge", id: e.id, source: e.source, target: e.target })}
        onPaneClick={() => onSelect(null)}
        proOptions={{ hideAttribution: false }}
      >
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function GraphLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-[3px] w-6 bg-accent" /> Critical path
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rotate-45 border-[1.5px] border-ink" /> Any one is enough
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block w-6 border-t-2 border-dashed border-faint" /> Same visit
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full bg-amber-dot" /> Sources disagree
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full bg-ink" /> Official source
      </li>
    </ul>
  );
}
