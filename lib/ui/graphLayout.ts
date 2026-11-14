// Pure layout for the plan graph (React Flow positions and edge routes, no React here).
// X = scheduled start: one column per distinct start (working-day index), labelled with the real date;
//     before the schedule arrives, topological depth stands in. An "any of" diamond gets its own narrow
//     column right after its earliest-ready option.
// Y = one lane per authority (lanes ordered by when they first appear). Steps in the same lane and
//     column stack; members of one merged visit stack together inside a "one visit" frame.
// Edges are routed orthogonally so they never cross a node: vertical segments only in the empty gaps
// between columns, horizontal runs only in the free strip at the top of a lane (a "channel").
// A requirement satisfied inside a framed visit (tax card needs the ID code; both happen at the same
// Vero visit) is not drawn as an edge: the frame shows it, the panel lists it.
import { shortLabel } from "@/lib/agent/stepTaxonomy";
import type { Deadlock, Graph, GraphEdge, GraphNode, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step, Trust } from "@/lib/types";

export const NODE_W = 184;
export const NODE_H = 52; // one-line label; two-line labels get NODE_H_2
export const NODE_H_2 = 70;
export const COL_W = 224; // step column pitch (gap = COL_W - NODE_W)
export const DIAMOND_COL_W = 76;
export const DIAMOND = 26;
export const LANE_LABEL_W = 136;
export const LANE_PAD = 16;
export const STACK_GAP = 10;
export const TICK_H = 34;
const CHANNEL = 6; // channel y offset inside a lane's top padding
const ONE_LINE_CHARS = 19;

export type StepNodeData = {
  kind: "step";
  id: string;
  label: string;
  title: string;
  authority: string;
  mode: Step["mode"];
  height: number;
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
export type Point = { x: number; y: number };
export type LayoutEdge = {
  id: string;
  source: string;
  target: string;
  critical: boolean;
  /** Target starts before the source's column (rare; drawn dashed). */
  backward: boolean;
  /** Part of an any-of group (option -> diamond). */
  anyOf: boolean;
  /** Orthogonal route, source handle to target handle. */
  points: Point[];
};
export type Layout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Requirement edges not drawn because a "one visit" frame shows them (graph edge ids). */
  hiddenEdges: string[];
  width: number;
  height: number;
  dated: boolean;
};

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

/** Short node label: taxonomy short label, else the title. */
export function nodeLabel(id: string, title: string): string {
  return shortLabel(id) ?? title.replace(/ \(already done\)$/, "");
}

export function nodeHeight(label: string): number {
  return label.length > ONE_LINE_CHARS ? NODE_H_2 : NODE_H;
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
  const diamondOf = new Map<string, string>();
  const diamonds = new Map<string, { label: string; options: string[] }>();
  for (const [gid, g] of groups) {
    const t = byId.get(g.target);
    const did = t?.milestone ? g.target : `anyof:${gid}`;
    diamondOf.set(gid, did);
    const prev = diamonds.get(did);
    diamonds.set(did, { label: t?.milestone ? nodeLabel(t.id, t.title) : "", options: [...(prev?.options ?? []), ...g.options] });
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
  const slotIndex = new Map(slots.map((s, i) => [s, i]));
  const hasStep = (s: number) => stepIds.some((id) => slot.get(id) === s);
  const colX = new Map<number, number>();
  const colRight = new Map<number, number>();
  let x = 0;
  for (const s of slots) {
    colX.set(s, x);
    const w = hasStep(s) ? NODE_W : DIAMOND;
    colRight.set(s, x + w);
    x += hasStep(s) ? COL_W : DIAMOND_COL_W;
  }
  const contentW = Math.max(...[...colRight.values()], NODE_W);

  // Node labels and heights.
  const label = new Map<string, string>();
  for (const id of stepIds) {
    const n = byId.get(id)!;
    label.set(id, nodeLabel(id, steps[id]?.title ?? n.title));
  }
  const hOf = (id: string) => (diamonds.has(id) ? DIAMOND : nodeHeight(label.get(id) ?? ""));

  // Lanes.
  const laneOf = (n: GraphNode) => (n.step?.done || steps[n.id]?.done ? "Already done" : n.unresolved ? "Not found" : n.authority || "Other");
  const laneFirst = new Map<string, number>();
  for (const id of [...stepIds].sort((a, b) => slot.get(a)! - slot.get(b)!)) {
    const lane = laneOf(byId.get(id)!);
    if (!laneFirst.has(lane)) laneFirst.set(lane, laneFirst.size);
  }
  const lanes = [...laneFirst.keys()];
  const laneIdx = new Map(lanes.map((l, i) => [l, i]));
  const cells = new Map<string, string[]>(); // lane|slot -> ids
  for (const id of stepIds) {
    const key = `${laneOf(byId.get(id)!)}|${slot.get(id)}`;
    cells.set(key, [...(cells.get(key) ?? []), id]);
  }
  for (const ids of cells.values()) ids.sort((a, b) => (items?.[a]?.visitId ?? "~").localeCompare(items?.[b]?.visitId ?? "~") || a.localeCompare(b));
  const cellHeight = (ids: string[]) => ids.reduce((h, id) => h + hOf(id), 0) + (ids.length - 1) * STACK_GAP;
  const laneTop = new Map<string, number>();
  const laneH = new Map<string, number>();
  let y = TICK_H;
  for (const lane of lanes) {
    const inLane = [...cells.entries()].filter(([k]) => k.slice(0, k.lastIndexOf("|")) === lane).map(([, v]) => cellHeight(v));
    const h = LANE_PAD * 2 + Math.max(NODE_H, ...inLane);
    laneTop.set(lane, y);
    laneH.set(lane, h);
    y += h;
  }
  const height = y;

  const pos = new Map<string, Point>();
  for (const [key, ids] of cells) {
    const lane = key.slice(0, key.lastIndexOf("|"));
    const s = Number(key.slice(key.lastIndexOf("|") + 1));
    let cy = laneTop.get(lane)! + LANE_PAD;
    for (const id of ids) {
      pos.set(id, { x: colX.get(s)!, y: cy });
      cy += hOf(id) + STACK_GAP;
    }
  }
  for (const [did, d] of diamonds) {
    const ys = d.options.map((o) => pos.get(o) && pos.get(o)!.y + hOf(o) / 2).filter((v): v is number => v !== undefined);
    const cy = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : TICK_H + NODE_H / 2;
    pos.set(did, { x: colX.get(slot.get(did)!)!, y: cy - DIAMOND / 2 });
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
  const framed = new Set<string>();
  const visits = new Map<string, string[]>();
  for (const id of stepIds) {
    const v = visitOf(id);
    if (v) visits.set(v, [...(visits.get(v) ?? []), id]);
  }
  for (const [v, ids] of visits) {
    if (ids.length < 2) continue;
    const ps = ids.map((id) => pos.get(id)!);
    if (new Set(ps.map((p) => p.x)).size !== 1) continue;
    framed.add(v);
    const top = Math.min(...ps.map((p) => p.y));
    const bottom = Math.max(...ids.map((id) => pos.get(id)!.y + hOf(id)));
    nodes.push({ id: `frame:${v}`, type: "frame", x: ps[0].x - 5, y: top - 5, zIndex: -1, data: { kind: "frame", label: "Do both in one visit", width: NODE_W + 10, height: bottom - top + 10 } });
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
        label: label.get(id)!,
        title: step?.title ?? n.title,
        authority: n.authority,
        mode: n.mode,
        height: hOf(id),
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

  // Edge routing.
  const laneTops = lanes.map((l) => laneTop.get(l)!);
  const channelFor = (id: string): number => {
    const n = byId.get(id);
    if (n && !diamonds.has(id)) return laneTop.get(laneOf(n))! + CHANNEL;
    const cy = pos.get(id)!.y + DIAMOND / 2;
    const nearest = laneTops.reduce((a, b) => (Math.abs(b - cy) < Math.abs(a - cy) ? b : a), laneTops[0] ?? TICK_H);
    return nearest + CHANNEL;
  };
  const laneNo = (id: string) => {
    const n = byId.get(id);
    return n && !diamonds.has(id) ? (laneIdx.get(laneOf(n)) ?? 0) : 0;
  };
  // Spread parallel verticals in one gap a little (by the lane the edge is heading to / coming from).
  const spread = (k: number) => ((k % 3) - 1) * 5;
  const gapAfter = (s: number) => {
    const i = slotIndex.get(s)!;
    const next = slots[i + 1];
    return next === undefined ? colRight.get(s)! + 16 : (colRight.get(s)! + colX.get(next)!) / 2;
  };
  const gapBefore = (s: number) => {
    const i = slotIndex.get(s)!;
    const prev = slots[i - 1];
    return prev === undefined ? colX.get(s)! - 16 : (colRight.get(prev)! + colX.get(s)!) / 2;
  };
  const route = (src: string, tgt: string): Point[] => {
    const sp = pos.get(src)!;
    const tp = pos.get(tgt)!;
    const sw = diamonds.has(src) ? DIAMOND : NODE_W;
    const s0 = { x: sp.x + sw, y: sp.y + hOf(src) / 2 };
    const t0 = { x: tp.x, y: tp.y + hOf(tgt) / 2 };
    const ss = slot.get(src)!;
    const ts = slot.get(tgt)!;
    const adjacent = slotIndex.get(ts)! === slotIndex.get(ss)! + 1;
    if (adjacent) {
      const g = gapAfter(ss) + spread(laneNo(tgt));
      if (Math.abs(s0.y - t0.y) < 1) return [s0, t0];
      return [s0, { x: g, y: s0.y }, { x: g, y: t0.y }, t0];
    }
    const g1 = gapAfter(ss) + spread(laneNo(tgt));
    const g2 = gapBefore(ts) + spread(laneNo(src));
    const ch = channelFor(tgt);
    return [s0, { x: g1, y: s0.y }, { x: g1, y: ch }, { x: g2, y: ch }, { x: g2, y: t0.y }, t0];
  };

  const hiddenEdges: string[] = [];
  const out: LayoutEdge[] = [];
  for (const e of edges) {
    const optionVisits = diamonds.get(e.source)?.options.map(visitOf) ?? [visitOf(e.source)];
    const v = visitOf(e.target);
    if (v && framed.has(v) && optionVisits.includes(v) && slot.get(e.target)! <= slot.get(e.source)!) {
      hiddenEdges.push(e.id);
      continue;
    }
    out.push({
      id: e.id,
      source: e.source,
      target: e.target,
      critical: critPairs.has(`${e.source}->${e.target}`),
      backward: slot.get(e.target)! <= slot.get(e.source)!,
      anyOf: !!e.anyOf,
      points: route(e.source, e.target),
    });
  }

  return { nodes, edges: out, hiddenEdges, width: contentW + LANE_LABEL_W, height, dated };
}
