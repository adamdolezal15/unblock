// Deterministic "metro map" layout of the plan (pure; drawn by components/map/MetroMap.tsx).
// - Every station gets its own column, in scheduled order (start date, then topological order), so labels
//   never collide horizontally. Steps done in one shared visit get adjacent columns on the same row and a
//   shared pill.
// - Row 0 is the main line: the slowest chain, labels above it. Every other step sits on a branch row
//   below (labels below), placed greedily on the first row that is free from its earliest prerequisite's
//   column to its own.
// - Routes are horizontal and vertical only (the renderer rounds the corners): along the source's row, over
//   in the gap between two columns, along the target's row. The branch rows are then reordered, and each
//   edge's gap chosen, so no route passes a station and as few routes as possible cross.
// - Names are never truncated: wrapped to two lines, and the columns widen to fit them.
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
  /** Not needed by this person (Step.necessity): a hollow station labelled "Optional", never on the main line. */
  optional: boolean;
  done: boolean;
  conflict: boolean;
  name: string[];
  office?: string[];
  date?: string;
  /** One line shown on hover: what this step needs and what it unlocks. */
  hint: string;
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
export const TOP = 96; // room for main-line labels above row 0 (grows with taller labels)
export const FIRST_BRANCH = 70; // row 0 -> row 1
export const ROW_GAP = 108; // branch rows (labels below; grows with taller labels)
export const BOTTOM = 92;
export const MIN_COL = 100;
export const MAX_COL = 132;
export const LINE_H = 16; // label line height, shared with the renderer
const CLEAR = 11; // a route must stay this far from any other station's centre
const CHAR_W = 8.2; // bold 14px label, per character
const EXHAUSTIVE_ROWS = 5; // up to this many branch rows every ordering is tried

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Word-wrap to at most two lines, never truncated: greedy at `max` characters, and if that needs more than
 *  two lines, the split that makes the longer of the two lines shortest. */
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
  if (lines.length <= 2) return lines;
  let best: string[] = [words.join(" ")];
  let bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const m = Math.max(a.length, b.length);
    if (m < bestLen) {
      bestLen = m;
      best = [a, b];
    }
  }
  return best;
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

type At = { id: string; x: number; y: number };

export function hits(points: Point[], stations: At[], except: Set<string>): number {
  let n = 0;
  for (const s of stations) {
    if (except.has(s.id)) continue;
    for (let i = 1; i < points.length; i++) if (segDist(s, points[i - 1], points[i]) < CLEAR) n++;
  }
  return n;
}

/** How often two horizontal/vertical routes cross or run along each other. `shared` are the stations the two
 *  routes have in common: meeting there, or running together out of / into it, is not a crossing. */
export function crossings(p: Point[], q: Point[], shared: Point[] = [], mainY?: number): number {
  let n = 0;
  const near = (x: number, y: number) => shared.some((s) => Math.abs(s.x - x) < 1.5 && Math.abs(s.y - y) < 1.5);
  for (let i = 1; i < p.length; i++) {
    for (let j = 1; j < q.length; j++) {
      const a = p[i - 1];
      const b = p[i];
      const c = q[j - 1];
      const d = q[j];
      const ah = a.y === b.y;
      const ch = c.y === d.y;
      if (ah !== ch) {
        const h = ah ? [a, b] : [c, d];
        const v = ah ? [c, d] : [a, b];
        const x = v[0].x;
        const y = h[0].y;
        // Strictly inside both: a crossing. Touching at an end: a junction, fine between routes that share a station.
        const m = shared.length ? 0.5 : -0.5;
        const inH = x > Math.min(h[0].x, h[1].x) + m && x < Math.max(h[0].x, h[1].x) - m;
        const inV = y > Math.min(v[0].y, v[1].y) + m && y < Math.max(v[0].y, v[1].y) - m;
        if (inH && inV && !near(x, y) && !(y === mainY && !(y > Math.min(v[0].y, v[1].y) + 0.5 && y < Math.max(v[0].y, v[1].y) - 0.5))) n++; // ending on the blue line merges into it
      } else if (shared.length === 0) {
        const alongX = ah ? a.y === c.y : a.x === c.x;
        if (!alongX || (ah && a.y === mainY)) continue; // running together along the blue line is hidden by it
        const k = ah ? "x" : "y";
        const lo = Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k]));
        const hi = Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k]));
        if (hi - lo > 1) n++;
      }
    }
  }
  return n;
}

/** Horizontal/vertical candidate routes from a to b: along a's row, over in a gap between columns, along b's row. */
function candidates(a: Point, b: Point, ca: number, cb: number, colW: number): Point[][] {
  if (a.y === b.y) return [[a, b]];
  const out: Point[][] = [];
  for (let k = Math.max(ca, cb) - 1; k >= Math.min(ca, cb); k--) {
    const x = PAD_X + (k + 0.5) * colW;
    out.push([a, { x, y: a.y }, { x, y: b.y }, b]);
  }
  return out;
}

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (!rest.length) out.push(cur);
    for (let i = 0; i < rest.length; i++) rec([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;
}

type Wanted = { e: GraphEdge; a: string; b: string; main: boolean };

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
  const fitW = Math.max(MIN_COL, Math.min(MAX_COL, n > 1 ? (width - 2 * PAD_X) / (n - 1) : MAX_COL));
  const maxChars = Math.max(8, Math.floor((fitW - 10) / CHAR_W));

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
  const rows = Math.max(0, ...[...row.values()]);

  // Labels: names, then office, date, estimate. Every name wraps to two lines at most; columns widen to fit.
  const conflictIds = new Set((input.conflicts ?? []).map((c) => c.stepId));
  const nameOf = (id: string) => {
    const node = byId.get(id)!;
    return (shortLabel(id) ?? node.title).replace(/ \(already done\)$/, "");
  };
  const hintOf = (id: string): string => {
    const need = new Set<string>();
    const either = new Set<string>();
    const unlock = new Set<string>();
    for (const e of graph.edges) {
      if (e.target === id && e.source !== id) (e.anyOf ? either : need).add(nameOf(e.source));
      if (e.source === id && e.target !== id) unlock.add(nameOf(e.target));
    }
    const needs = [...(need.size ? [[...need].join(", ")] : []), ...(either.size ? [`either ${[...either].join(" or ")}`] : [])].join(", ");
    return `Needs: ${needs || "nothing first"}. Unlocks: ${unlock.size ? [...unlock].join(", ") : "nothing, this is the end of the line"}.`;
  };
  type Draft = Omit<MetroStation, "x" | "y">;
  const drafts: Draft[] = order.map((id) => {
    const node = byId.get(id)!;
    const step = steps[id] ?? node.step;
    const it = items?.[id];
    const interchange = anyOfTargets.has(id) && node.milestone;
    const office = node.authority && !interchange && node.authority !== "any of the options" ? node.authority.replace(/^Your (w)/, (_, c: string) => c.toUpperCase()) : undefined;
    const label = interchange ? `${nameOf(id)}: either one` : nameOf(id);
    return {
      id,
      col: col.get(id)!,
      row: row.get(id)!,
      kind: interchange ? "interchange" : "station",
      main: main.has(id),
      hollow: !interchange && (!!it?.estimated || node.unresolved || node.mode === "online" || step?.necessity === "optional"),
      estimate: !!it?.estimated,
      optional: step?.necessity === "optional" && !step.done,
      done: !!step?.done,
      conflict: conflictIds.has(id),
      name: wrap(label, maxChars),
      ...(office ? { office: wrap(office, maxChars) } : {}),
      ...(it ? { date: shortDate(it.startDate) } : {}),
      hint: hintOf(id),
      labelSide: row.get(id) === 0 ? "above" : "below",
    };
  });
  const need = Math.max(0, ...drafts.flatMap((d) => [...d.name.map((t) => t.length * CHAR_W), ...(d.office ?? []).map((t) => t.length * 7.4)])) + 14;
  const colW = Math.max(fitW, need);
  const lineCount = (d: Draft) => d.name.length + (d.office?.length ?? 0) + (d.date ? 1 : 0) + (d.estimate ? 1 : 0) + (d.optional ? 1 : 0);
  const above = Math.max(1, ...drafts.filter((d) => d.labelSide === "above").map(lineCount));
  const below = Math.max(1, ...drafts.filter((d) => d.labelSide === "below").map(lineCount));
  const top = Math.max(TOP, 18 + (above - 1) * LINE_H + 30);
  const rowGap = Math.max(ROW_GAP, 28 + (below - 1) * LINE_H + 14 + 40);
  const rowY = (rank: number) => (rank === 0 ? top : top + FIRST_BRANCH + (rank - 1) * rowGap);
  const xOf = (id: string) => PAD_X + col.get(id)! * colW;

  // Which requirements are drawn at all.
  const rowOf = (id: string) => row.get(id)!;
  const groups = new Map<string, Draft[]>();
  for (const d of drafts) {
    const v = items?.[d.id]?.visitId;
    if (v) groups.set(v, [...(groups.get(v) ?? []), d]);
  }
  // Shared visits: a pill around adjacent stations on one row; the requirement between them is not drawn.
  const pilledGroups: [string, Draft[]][] = [...groups].filter(([, g]) => g.length >= 2 && new Set(g.map((s) => s.row)).size === 1);
  const pilled = new Map<string, string>();
  for (const [v, g] of pilledGroups) g.forEach((s) => pilled.set(s.id, v));

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
  const wanted: Wanted[] = [];
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const a = e.source;
    const b = e.target;
    // Met inside a shared visit (the code and the tax card at one Vero desk): the pill shows it.
    const sameVisit = pilled.get(b) && (pilled.get(a) === pilled.get(b) || graph.edges.some((x) => x.target === a && pilled.get(x.source) === pilled.get(b)));
    if (sameVisit && col.get(b)! <= col.get(a)!) {
      hidden.push(e.id);
      continue;
    }
    if (!e.anyOf && !critPairs.has(`${a}->${b}`) && reachableAvoiding(a, b, e)) {
      hidden.push(e.id);
      continue;
    }
    // Between two main-line stations that are not neighbours on the line: the line's order already says
    // it (the details panel lists it under "You need first").
    if (rowOf(a) === 0 && rowOf(b) === 0 && main.has(a) && main.has(b) && !critPairs.has(`${a}->${b}`)) {
      hidden.push(e.id);
      continue;
    }
    wanted.push({ e, a, b, main: critPairs.has(`${a}->${b}`) });
  }

  // Routing for one ordering of the branch rows. `rank[r]` is the vertical slot of logical row r.
  type Routed = { routes: Point[][]; cost: number };
  const route = (rank: number[]): Routed => {
    const mainY = main.size ? rowY(0) : undefined;
    const pos: At[] = drafts.map((d) => ({ id: d.id, x: xOf(d.id), y: rowY(rank[d.row]) }));
    const p = new Map(pos.map((s) => [s.id, s]));
    const cands = wanted.map((w) => candidates(p.get(w.a)!, p.get(w.b)!, col.get(w.a)!, col.get(w.b)!, colW));
    const hitCost = cands.map((cs, i) => cs.map((c) => hits(c, pos, new Set([wanted[i].a, wanted[i].b])) * 1000));
    const sharedPts = (i: number, j: number): Point[] => {
      const si = [wanted[i].a, wanted[i].b];
      return [wanted[j].a, wanted[j].b].filter((x) => si.includes(x)).map((x) => p.get(x)!);
    };
    const pick = new Array<number>(wanted.length).fill(0);
    const placed = new Array<boolean>(wanted.length).fill(false);
    const score = (i: number, c: number) => {
      let s = hitCost[i][c] + c * 0.001;
      for (let j = 0; j < wanted.length; j++) if (j !== i && placed[j]) s += crossings(cands[i][c], cands[j][pick[j]], sharedPts(i, j), mainY) * 10;
      return s;
    };
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < wanted.length; i++) {
        placed[i] = false;
        let best = 0;
        let bestScore = Infinity;
        for (let c = 0; c < cands[i].length; c++) {
          const s = score(i, c);
          if (s < bestScore) {
            bestScore = s;
            best = c;
          }
        }
        pick[i] = best;
        placed[i] = true;
      }
    }
    let cost = 0;
    for (let i = 0; i < wanted.length; i++) {
      cost += hitCost[i][pick[i]];
      for (let j = i + 1; j < wanted.length; j++) cost += crossings(cands[i][pick[i]], cands[j][pick[j]], sharedPts(i, j), mainY) * 10;
      cost += pick[i] * 0.001;
    }
    return { routes: wanted.map((_, i) => cands[i][pick[i]]), cost };
  };

  // Reorder the branch rows: every ordering when there are few, otherwise swap rows while it helps.
  const identity = Array.from({ length: rows + 1 }, (_, r) => r);
  const rankFrom = (perm: number[]) => [0, ...perm.map((x) => x + 1)];
  let bestRank = identity;
  let best = route(identity);
  if (rows >= 2 && wanted.length) {
    if (rows <= EXHAUSTIVE_ROWS) {
      for (const perm of permutations(rows)) {
        const rank = rankFrom(perm);
        const r = route(rank);
        if (r.cost < best.cost - 1e-9) {
          best = r;
          bestRank = rank;
        }
      }
    } else {
      for (let round = 0; round < 24; round++) {
        let improved = false;
        for (let i = 1; i <= rows; i++) {
          for (let j = i + 1; j <= rows; j++) {
            const rank = [...bestRank];
            [rank[i], rank[j]] = [rank[j], rank[i]];
            const r = route(rank);
            if (r.cost < best.cost - 1e-9) {
              best = r;
              bestRank = rank;
              improved = true;
            }
          }
        }
        if (!improved) break;
      }
    }
  }

  const stations: MetroStation[] = drafts.map((d) => ({ ...d, x: xOf(d.id), y: rowY(bestRank[d.row]) }));
  const at = new Map(stations.map((s) => [s.id, s]));
  const edges: MetroEdge[] = wanted.map((w, i) => ({ id: w.e.id, source: w.a, target: w.b, points: best.routes[i], main: w.main }));

  const pills: MetroPill[] = pilledGroups.map(([v, g]) => {
    const xs = g.map((s) => at.get(s.id)!.x);
    const y = at.get(g[0].id)!.y;
    return { id: v, x: Math.min(...xs) - 16, y: y - 15, w: Math.max(...xs) - Math.min(...xs) + 32, h: 30 };
  });

  const height = rows === 0 ? top + 40 : rowY(rows) + Math.max(BOTTOM, 28 + (below - 1) * LINE_H + 34);
  return { stations, edges, pills, width: Math.max(width, 2 * PAD_X + (n - 1) * colW), height, hidden };
}
