// Deterministic "metro map" layout of the plan (pure; drawn by components/map/MetroMap.tsx).
// - Every station gets its own column, in scheduled order (start date, then topological order), so labels
//   never collide horizontally. Steps done in one shared visit get adjacent columns on the same row and a
//   shared pill.
// - Row 0 is the main line: the slowest chain, labels above it. Every other step sits on a branch row
//   below (labels below), placed greedily on the first row that is free from its earliest prerequisite's
//   column to its own, so the branch's run along that row passes no other station.
// - Routes are octilinear (horizontal + 45°). For each edge a few candidate routes are tried and the first
//   that passes no other station is used.
import { shortLabel } from "@/lib/agent/stepTaxonomy";
import type { Graph, GraphEdge, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step } from "@/lib/types";

export type Point = { x: number; y: number };
export type MetroStation = {
  id: string;
  col: number;
  row: number;
  x: number;
  y: number;
  kind: "station" | "interchange";
  main: boolean;
  /** Estimated date or online: drawn hollow. */
  hollow: boolean;
  estimate: boolean;
  done: boolean;
  conflict: boolean;
  name: string[];
  office?: string;
  date?: string;
  labelSide: "above" | "below";
};
export type MetroEdge = { id: string; source: string; target: string; points: Point[]; main: boolean };
export type MetroPill = { id: string; x: number; y: number; w: number; h: number };
export type MetroLayout = { stations: MetroStation[]; edges: MetroEdge[]; pills: MetroPill[]; width: number; height: number; hidden: string[] };

export type MetroInput = {
  graph: Graph;
  steps: Record<string, Step>;
  items?: Record<string, ScheduledStep>;
  criticalPath?: string[];
  conflicts?: Conflict[];
  /** Layout width in px; columns shrink to fit (down to MIN_COL, then the map scrolls). */
  width?: number;
};

export const PAD_X = 64;
export const TOP = 96; // room for main-line labels above row 0
export const FIRST_BRANCH = 70; // row 0 -> row 1
export const ROW_GAP = 108; // branch rows (labels below)
export const BOTTOM = 92;
export const MIN_COL = 92;
export const MAX_COL = 132;
const CLEAR = 11; // a route must stay this far from any other station's centre

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Word-wrap to at most two lines of `max` characters (ellipsis if longer). */
export function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2) return lines.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
  const second = lines.slice(1).join(" ");
  return [lines[0], second.length > max ? `${second.slice(0, max - 1)}…` : second];
}

function depthOf(graph: Graph): Map<string, number> {
  const preds = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) preds.get(e.target)?.push(e.source);
  const memo = new Map<string, number>();
  const seen = new Set<string>();
  const d = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const v = Math.max(-1, ...(preds.get(id) ?? []).map(d)) + 1;
    memo.set(id, v);
    return v;
  };
  graph.nodes.forEach((n) => d(n.id));
  return memo;
}

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hits(points: Point[], stations: MetroStation[], except: Set<string>): number {
  let n = 0;
  for (const s of stations) {
    if (except.has(s.id)) continue;
    for (let i = 1; i < points.length; i++) if (segDist(s, points[i - 1], points[i]) < CLEAR) n++;
  }
  return n;
}

/** Octilinear candidate routes from a to b, in order of preference. */
function candidates(a: Point, b: Point): Point[][] {
  const dy = b.y - a.y;
  const dx = b.x - a.x;
  if (dy === 0) return [[a, b]];
  const k = Math.abs(dy);
  const out: Point[][] = [];
  const dir = Math.sign(dx) || 1;
  if (Math.abs(dx) >= k) {
    out.push([a, { x: a.x + dir * k, y: b.y }, b]); // turn at the start, run along b's row
    out.push([a, { x: b.x - dir * k, y: a.y }, b]); // run along a's row, turn at the end
  }
  out.push([a, { x: a.x, y: b.y - Math.sign(dy) * Math.min(k, Math.abs(dx)) }, b]); // down at the start
  out.push([a, { x: a.x, y: b.y }, b]); // vertical, then horizontal
  out.push([a, { x: b.x, y: a.y }, b]); // horizontal, then vertical
  return out.map((p) => p.filter((q, i) => i === 0 || q.x !== p[i - 1].x || q.y !== p[i - 1].y));
}

export function layoutMetro(input: MetroInput): MetroLayout {
  const { graph, steps, items } = input;
  const dated = !!items && Object.keys(items).length > 0;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const anyOfTargets = new Set(graph.edges.filter((e) => e.anyOf).map((e) => e.target));
  const ids = graph.nodes.map((n) => n.id);
  const depth = depthOf(graph);
  const topo = new Map((input.criticalPath ?? []).map((id, i) => [id, i]));

  // Columns: scheduled start, then visit group, then depth, then id (stable).
  const key = (id: string) => (dated ? (items![id]?.startIndex ?? 999) : (depth.get(id) ?? 0));
  const order = [...ids].sort(
    (a, b) =>
      key(a) - key(b) ||
      (items?.[a]?.visitId ?? "~").localeCompare(items?.[b]?.visitId ?? "~") ||
      (depth.get(a) ?? 0) - (depth.get(b) ?? 0) ||
      (topo.get(a) ?? 99) - (topo.get(b) ?? 99) ||
      a.localeCompare(b),
  );
  const col = new Map(order.map((id, i) => [id, i]));
  const n = order.length;
  const width = input.width ?? 1000;
  const colW = Math.max(MIN_COL, Math.min(MAX_COL, n > 1 ? (width - 2 * PAD_X) / (n - 1) : MAX_COL));
  const maxChars = Math.max(8, Math.floor((colW - 10) / 7.8));

  // Rows.
  const main = new Set((input.criticalPath ?? []).filter((id) => byId.has(id)));
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of graph.edges) preds.get(e.target)?.push(e.source);
  const row = new Map<string, number>();
  for (const id of main) row.set(id, 0);
  const firstBranch = main.size ? 1 : 0;
  const lastCol: number[] = [];
  const lastId: string[] = [];
  for (const id of order) {
    if (row.has(id)) continue;
    const c = col.get(id)!;
    const earlier = (preds.get(id) ?? []).filter((p) => (col.get(p) ?? -1) < c);
    const from = earlier.length ? Math.min(...earlier.map((p) => col.get(p)!)) : c;
    // A shared visit stays on its mate's row.
    const v = items?.[id]?.visitId;
    const mate = v ? order.find((o) => o !== id && items?.[o]?.visitId === v && row.has(o)) : undefined;
    let r: number;
    if (mate !== undefined && row.get(mate)! > 0 && (lastId[row.get(mate)!] === mate || (lastCol[row.get(mate)!] ?? -1) < c)) r = row.get(mate)!;
    else {
      r = firstBranch;
      while ((lastCol[r] ?? -1) >= from && !(lastId[r] && earlier.includes(lastId[r]))) r++;
    }
    row.set(id, r);
    lastCol[r] = c;
    lastId[r] = id;
  }
  const rowY = (r: number) => (r === 0 ? TOP : TOP + FIRST_BRANCH + (r - 1) * ROW_GAP);
  const rows = Math.max(0, ...[...row.values()]);

  const conflictIds = new Set((input.conflicts ?? []).map((c) => c.stepId));
  const stations: MetroStation[] = order.map((id) => {
    const node = byId.get(id)!;
    const step = steps[id] ?? node.step;
    const it = items?.[id];
    const interchange = anyOfTargets.has(id) && node.milestone;
    const office = node.authority && !interchange && node.authority !== "any of the options" ? node.authority.replace(/^Your (w)/, (_, c: string) => c.toUpperCase()) : undefined;
    const label = interchange ? `${shortLabel(id) ?? node.title}: either one` : (shortLabel(id) ?? node.title).replace(/ \(already done\)$/, "");
    return {
      id,
      col: col.get(id)!,
      row: row.get(id)!,
      x: PAD_X + col.get(id)! * colW,
      y: rowY(row.get(id)!),
      kind: interchange ? "interchange" : "station",
      main: main.has(id),
      hollow: !interchange && (!!it?.estimated || node.unresolved || node.mode === "online"),
      estimate: !!it?.estimated,
      done: !!step?.done,
      conflict: conflictIds.has(id),
      name: wrap(label, maxChars),
      ...(office ? { office } : {}),
      ...(it ? { date: shortDate(it.startDate) } : {}),
      labelSide: row.get(id) === 0 ? "above" : "below",
    };
  });
  const at = new Map(stations.map((s) => [s.id, s]));

  // Shared visits: a pill around adjacent stations on one row; the requirement between them is not drawn.
  const pills: MetroPill[] = [];
  const pilled = new Map<string, string>();
  const groups = new Map<string, MetroStation[]>();
  for (const s of stations) {
    const v = items?.[s.id]?.visitId;
    if (v) groups.set(v, [...(groups.get(v) ?? []), s]);
  }
  for (const [v, g] of groups) {
    if (g.length < 2 || new Set(g.map((s) => s.row)).size !== 1) continue;
    const xs = g.map((s) => s.x);
    pills.push({ id: v, x: Math.min(...xs) - 16, y: g[0].y - 15, w: Math.max(...xs) - Math.min(...xs) + 32, h: 30 });
    g.forEach((s) => pilled.set(s.id, v));
  }

  // Transitive reduction: an edge u -> v is not drawn when v is also reached from u through other steps
  // (residence permit -> DVV -> ID code -> bank already shows that the bank needs the permit).
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of graph.edges) succ.get(e.source)?.push(e.target);
  const reachableAvoiding = (from: string, to: string, skip: GraphEdge): boolean => {
    const seen = new Set<string>([from]);
    const stack = (succ.get(from) ?? []).filter((t) => !(t === skip.target && from === skip.source));
    while (stack.length) {
      const x = stack.pop()!;
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(succ.get(x) ?? []));
    }
    return false;
  };

  const critPairs = new Set((input.criticalPath ?? []).slice(1).map((id, i) => `${input.criticalPath![i]}->${id}`));
  const hidden: string[] = [];
  const edges: MetroEdge[] = [];
  const draw = (e: GraphEdge) => {
    const a = at.get(e.source);
    const b = at.get(e.target);
    if (!a || !b) return;
    // Met inside a shared visit (the code and the tax card at one Vero desk): the pill shows it.
    const sameVisit = pilled.get(b.id) && (pilled.get(a.id) === pilled.get(b.id) || graph.edges.some((x) => x.target === a.id && pilled.get(x.source) === pilled.get(b.id)));
    if (sameVisit && b.col <= a.col) {
      hidden.push(e.id);
      return;
    }
    if (!e.anyOf && !critPairs.has(`${a.id}->${b.id}`) && reachableAvoiding(a.id, b.id, e)) {
      hidden.push(e.id);
      return;
    }
    // Between two main-line stations that are not neighbours on the line: the line's order already says
    // it (the details panel lists it under "You need first").
    if (a.row === 0 && b.row === 0 && main.has(a.id) && main.has(b.id) && !critPairs.has(`${a.id}->${b.id}`)) {
      hidden.push(e.id);
      return;
    }
    const except = new Set([a.id, b.id]);
    const cands = candidates(a, b);
    const best = cands.find((p) => hits(p, stations, except) === 0) ?? cands.reduce((m, p) => (hits(p, stations, except) < hits(m, stations, except) ? p : m), cands[0]);
    edges.push({ id: e.id, source: e.source, target: e.target, points: best, main: critPairs.has(`${e.source}->${e.target}`) });
  };
  graph.edges.forEach(draw);

  const height = rows === 0 ? TOP + 40 : rowY(rows) + BOTTOM;
  return { stations, edges, pills, width: Math.max(width, 2 * PAD_X + (n - 1) * colW), height, hidden };
}
