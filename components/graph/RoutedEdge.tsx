"use client";
import { BaseEdge, type EdgeProps } from "reactflow";
import type { Point } from "@/lib/ui/graphLayout";

export type RoutedEdgeData = { points: Point[] };

/** Orthogonal polyline with rounded corners (route computed in lib/ui/graphLayout). */
export function pathFor(points: Point[], radius = 8): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [p, c, n] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(radius, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(n.x - c.x, n.y - c.y) / 2);
    const a = { x: c.x - Math.sign(c.x - p.x) * r, y: c.y - Math.sign(c.y - p.y) * r };
    const b = { x: c.x + Math.sign(n.x - c.x) * r, y: c.y + Math.sign(n.y - c.y) * r };
    d += ` L ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

export function RoutedEdge({ data, markerEnd, style, interactionWidth }: EdgeProps<RoutedEdgeData>) {
  if (!data?.points?.length) return null;
  return <BaseEdge path={pathFor(data.points)} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />;
}

export const edgeTypes = { routed: RoutedEdge };
