// Pure layout for the plan graph (React Flow positions, no React here).
// X = scheduled start: one column per distinct start (working-day index), labelled with the real date;
//     before the schedule arrives, topological depth stands in. An "any of" diamond gets its own narrow
//     column right after its earliest-ready option.
// Y = one lane per authority (lanes ordered by when they first appear). Steps in the same lane and
//     column stack; members of one merged visit stack together inside a "one visit" frame.
// Edges keep the graph's ids (so a click can look up the quote behind them). An edge that points back
// in time (target starts before its prerequisite's column, e.g. a tax card done in the same visit that
// issues the identity code) is drawn as a dashed back-curve, labelled "same visit" when that is why.
import type { Deadlock, Graph, GraphEdge, GraphNode, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step, Trust } from "@/lib/types";

export const NODE_W = 196;
export const NODE_H = 60;
export const COL_W = 228; // step column pitch
export const DIAMOND_COL_W = 92;
export const DIAMOND = 26;
export const LANE_LABEL_W = 136;
export const LANE_PAD = 10;
export const STACK_GAP = 8;
export const TICK_H = 34;

export type StepNodeData = {
  kind: "step";
  id: string;
  title: string;
  authority: string;
  mode: Step["mode"];
  critical: boolean;
  done: boolean;
  unresolved: boolean;
  deadlocked: boolean;
  conflict: boolean;
  trust?: Trust;
  startDate?: string;
  estimated: boolean;
};
export type DiamondNodeData = { kind: "anyof"; id: string; label: string; critical: boolean; options: string[] };
export type LaneNodeData = { kind: "lane"; label: string; width: number; height: number; shade: boolean };
export type TickNodeData = { kind: "tick"; label: string; height: number };
export type FrameNodeData = { kind: "frame"; label: string; width: number; height: number };
export type LayoutNodeData = StepNodeData | DiamondNodeData | LaneNodeData | TickNodeData | FrameNodeData;

export type LayoutNode = { id: string; type: LayoutNodeData["kind"]; x: number; y: number; data: LayoutNodeData; zIndex: number };
export type LayoutEdge = {
  id: string;
  source: string;
  target: string;
  critical: boolean;
  /** Drawn as a dashed back-curve (target is placed left of the source). */
  backward: boolean;
  label?: string;
  /** Part of an any-of group (option -> diamond). */
  anyOf: boolean;
};
export type Layout = { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number; dated: boolean };

export type LayoutInput = {
  graph: Graph;
  steps: Record<string, Step>;
  items?: Record<string, ScheduledStep>;
  criticalPath?: string[];
  conflicts?: Conflict[];
  deadlocks?: Deadlock[];
};

const TRUST_ORDER: Trust[] = ["official", "provider", "university", "news", "community"];

export function bestTrust(step?: Step): Trust | undefined {
  if (!step) return undefined;
  const have = new Set(step.citations.map((c) => c.trust));
  return TRUST_ORDER.find((t) => have.has(t));
}

/** Longest-path depth from the roots (cycle-safe). */
function depths(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const preds = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) preds.get(e.target)?.push(e.source);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(-1, ...(preds.get(id) ?? []).map(depth)) + 1;
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };
  nodes.forEach((n) => depth(n.id));
  return memo;
}

export function layoutGraph(input: LayoutInput): Layout {
  const { graph, steps, items } = input;
  const dated = !!items && Object.keys(items).length > 0;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // Any-of groups: a milestone target becomes the diamond itself; any other target gets a virtual diamond.
  const groups = new Map<string, { target: string; options: string[] }>();
  for (const e of graph.edges) {
    if (!e.anyOf) continue;
    const g = groups.get(e.anyOf) ?? { target: e.target, options: [] };
    g.options.push(e.source);
    groups.set(e.anyOf, g);
  }
  const diamondOf = new Map<string, string>(); // group id -> diamond node id
  const diamonds = new Map<string, { label: string; options: string[] }>();
  for (const [gid, g] of groups) {
    const t = byId.get(g.target);
    const did = t?.milestone ? g.target : `anyof:${gid}`;
    diamondOf.set(gid, did);
    const prev = diamonds.get(did);
    diamonds.set(did, { label: t?.milestone ? t.title : "any of", options: [...(prev?.options ?? []), ...g.options] });
  }
  const edges: GraphEdge[] = [];
  for (const e of graph.edges) {
    if (e.anyOf && diamondOf.get(e.anyOf) !== e.target) {
      const did = diamondOf.get(e.anyOf)!;
      edges.push({ ...e, target: did });
      if (!edges.some((x) => x.source === did && x.target === e.target)) edges.push({ id: `${did}->${e.target}`, source: did, target: e.target });
    } else edges.push(e);
  }
  const allNodes: GraphNode[] = [
    ...graph.nodes,
    ...[...diamonds.keys()]
      .filter((id) => !byId.has(id))
      .map((id) => ({ id, title: "any of", authority: "", mode: "either" as const, unresolved: false, milestone: true })),
  ];

  // Slots (x order). Steps: scheduled start index; fallback: after their latest prerequisite / depth.
  const depth = depths(allNodes, edges);
  const preds = new Map<string, string[]>();
  for (const e of edges) preds.set(e.target, [...(preds.get(e.target) ?? []), e.source]);
  const slot = new Map<string, number>();
  const stepIds = allNodes.filter((n) => !diamonds.has(n.id)).map((n) => n.id);
  for (const id of stepIds) {
    const it = items?.[id];
    if (dated && it) slot.set(id, it.startIndex);
    else if (!dated) slot.set(id, depth.get(id) ?? 0);
  }
  for (const id of stepIds) {
    if (slot.has(id)) continue;
    const before = (preds.get(id) ?? []).map((p) => slot.get(p) ?? 0);
    slot.set(id, Math.max(-1, ...before) + 1);
  }
  for (const [did, d] of diamonds) {
    // When the earliest option is ready, but never left of an option's start (no backward option edges).
    const ready = d.options.map((o) => (dated ? (items?.[o]?.readyIndex ?? (slot.get(o) ?? 0) + 1) : (slot.get(o) ?? 0) + 1));
    const starts = d.options.map((o) => slot.get(o) ?? 0);
    slot.set(did, Math.max(Math.min(...ready) - 0.5, Math.max(...starts) + 0.5));
  }

  // Columns with variable width (diamond-only columns are narrow).
  const slots = [...new Set(slot.values())].sort((a, b) => a - b);
  const colX = new Map<number, number>();
  let x = 0;
  for (const s of slots) {
    colX.set(s, x);
    const hasStep = stepIds.some((id) => slot.get(id) === s);
    x += hasStep ? COL_W : DIAMOND_COL_W;
  }
  const contentW = Math.max(x - (COL_W - NODE_W), NODE_W);

  // Lanes.
  const laneOf = (n: GraphNode) => (n.step?.done || steps[n.id]?.done ? "Already done" : n.unresolved ? "Not found" : n.authority || "Other");
  const laneFirst = new Map<string, number>();
  for (const id of [...stepIds].sort((a, b) => slot.get(a)! - slot.get(b)!)) {
    const lane = laneOf(byId.get(id)!);
    if (!laneFirst.has(lane)) laneFirst.set(lane, laneFirst.size);
  }
  const lanes = [...laneFirst.keys()];
  const cells = new Map<string, string[]>(); // lane|slot -> ids
  for (const id of stepIds) {
    const key = `${laneOf(byId.get(id)!)}|${slot.get(id)}`;
    cells.set(key, [...(cells.get(key) ?? []), id]);
  }
  for (const ids of cells.values()) ids.sort((a, b) => (items?.[a]?.visitId ?? "~").localeCompare(items?.[b]?.visitId ?? "~") || a.localeCompare(b));
  const laneTop = new Map<string, number>();
  const laneH = new Map<string, number>();
  let y = TICK_H;
  for (const lane of lanes) {
    const stack = Math.max(1, ...[...cells.entries()].filter(([k]) => k.startsWith(`${lane}|`)).map(([, v]) => v.length));
    const h = LANE_PAD * 2 + stack * NODE_H + (stack - 1) * STACK_GAP;
    laneTop.set(lane, y);
    laneH.set(lane, h);
    y += h;
  }
  const height = y;

  const pos = new Map<string, { x: number; y: number }>();
  for (const [key, ids] of cells) {
    const [lane, s] = [key.slice(0, key.lastIndexOf("|")), Number(key.slice(key.lastIndexOf("|") + 1))];
    ids.forEach((id, i) => pos.set(id, { x: colX.get(s)!, y: laneTop.get(lane)! + LANE_PAD + i * (NODE_H + STACK_GAP) }));
  }
  for (const [did, d] of diamonds) {
    const ys = d.options.map((o) => pos.get(o)).filter(Boolean).map((p) => p!.y + NODE_H / 2);
    const cy = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : TICK_H + NODE_H / 2;
    const s = slot.get(did)!;
    const colW = stepIds.some((id) => slot.get(id) === s) ? NODE_W : DIAMOND_COL_W - (COL_W - NODE_W);
    pos.set(did, { x: colX.get(s)! + colW / 2 - DIAMOND / 2, y: cy - DIAMOND / 2 });
  }

  // Critical path: consecutive pairs.
  const path = input.criticalPath ?? [];
  const onPath = new Set(path);
  const critPairs = new Set(path.slice(1).map((id, i) => `${path[i]}->${id}`));
  const conflictSteps = new Set((input.conflicts ?? []).map((c) => c.stepId));
  const deadlocked = new Set((input.deadlocks ?? []).flatMap((d) => d.stepIds));
  const visitOf = (id: string) => items?.[id]?.visitId;

  const nodes: LayoutNode[] = [];
  lanes.forEach((lane, i) =>
    nodes.push({
      id: `lane:${lane}`,
      type: "lane",
      x: -LANE_LABEL_W,
      y: laneTop.get(lane)!,
      zIndex: -2,
      data: { kind: "lane", label: lane, width: LANE_LABEL_W + contentW + 24, height: laneH.get(lane)!, shade: i % 2 === 1 },
    }),
  );
  if (dated) {
    for (const s of slots) {
      const ids = stepIds.filter((id) => slot.get(id) === s && items?.[id]);
      if (!ids.length) continue;
      const date = ids.map((id) => items![id].startDate).sort()[0];
      nodes.push({ id: `tick:${s}`, type: "tick", x: colX.get(s)!, y: 0, zIndex: -1, data: { kind: "tick", label: date, height } });
    }
  }
  // One frame per merged visit whose members share a cell.
  const visits = new Map<string, string[]>();
  for (const id of stepIds) {
    const v = visitOf(id);
    if (v) visits.set(v, [...(visits.get(v) ?? []), id]);
  }
  for (const [v, ids] of visits) {
    if (ids.length < 2) continue;
    const ps = ids.map((id) => pos.get(id)!);
    if (new Set(ps.map((p) => p.x)).size !== 1) continue;
    const top = Math.min(...ps.map((p) => p.y));
    const bottom = Math.max(...ps.map((p) => p.y)) + NODE_H;
    nodes.push({ id: `frame:${v}`, type: "frame", x: ps[0].x - 5, y: top - 5, zIndex: -1, data: { kind: "frame", label: "one visit", width: NODE_W + 10, height: bottom - top + 10 } });
  }
  for (const id of stepIds) {
    const n = byId.get(id)!;
    const step = steps[id] ?? n.step;
    const it = items?.[id];
    nodes.push({
      id,
      type: "step",
      ...pos.get(id)!,
      zIndex: 1,
      data: {
        kind: "step",
        id,
        title: step?.title ?? n.title,
        authority: n.authority,
        mode: n.mode,
        critical: onPath.has(id),
        done: !!(step?.done || n.step?.done),
        unresolved: n.unresolved,
        deadlocked: deadlocked.has(id),
        conflict: conflictSteps.has(id),
        trust: bestTrust(step),
        startDate: it?.startDate,
        estimated: !!it?.estimated,
      },
    });
  }
  for (const [did, d] of diamonds) {
    nodes.push({ id: did, type: "anyof", ...pos.get(did)!, zIndex: 1, data: { kind: "anyof", id: did, label: d.label, critical: onPath.has(did), options: d.options } });
  }

  const xOf = (id: string) => pos.get(id)?.x ?? 0;
  const out: LayoutEdge[] = edges.map((e) => {
    const backward = xOf(e.target) <= xOf(e.source);
    const optionVisits = diamonds.get(e.source)?.options.map(visitOf) ?? [visitOf(e.source)];
    const sameVisit = backward && !!visitOf(e.target) && optionVisits.includes(visitOf(e.target));
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      critical: critPairs.has(`${e.source}->${e.target}`),
      backward,
      anyOf: !!e.anyOf,
      ...(sameVisit ? { label: "same visit" } : {}),
    };
  });

  return { nodes, edges: out, width: contentW + LANE_LABEL_W, height, dated };
}
