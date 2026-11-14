import { requirementGroups, requiresMap } from "./buildGraph";
import { costOfDelayUrgency, priorityScores } from "./priority";
import type { Deadlock, Graph, TopoResult } from "./types";

/**
 * Kahn topological sort over requirement groups: a step becomes ready when every group has at least
 * one completed option (a plain requirement is a group of one). Among ready steps, higher priority
 * goes first (then urgency, then input order). Never throws: cycles come back as `deadlocks`, and
 * everything that can't be reached because of one is listed in `blocked`.
 */
export function topoOrder(graph: Graph): TopoResult {
  const groups = requirementGroups(graph);
  // option id -> [dependent, group index] pairs it can satisfy
  const satisfies = new Map<string, [string, number][]>(graph.nodes.map((n) => [n.id, []]));
  for (const [target, gs] of groups) gs.forEach((g, gi) => g.forEach((o) => satisfies.get(o)?.push([target, gi])));
  const priority = priorityScores(graph);
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const rank = (id: string): [number, number, number] => [
    priority[id] ?? 0,
    costOfDelayUrgency(nodeById.get(id)?.costOfDelay),
    -(index.get(id) ?? 0),
  ];
  const before = (a: string, b: string) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < 3; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
    return false;
  };

  const remaining = new Map<string, number>();
  const satisfied = new Map<string, Set<number>>();
  for (const [id, gs] of groups) {
    remaining.set(id, gs.length);
    satisfied.set(id, new Set());
  }

  const ready = graph.nodes.filter((n) => remaining.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (ready.length) {
    let best = 0;
    for (let i = 1; i < ready.length; i++) if (before(ready[i], ready[best])) best = i;
    const id = ready.splice(best, 1)[0];
    order.push(id);
    for (const [d, gi] of satisfies.get(id) ?? []) {
      const sat = satisfied.get(d)!;
      if (sat.has(gi)) continue;
      sat.add(gi);
      const left = remaining.get(d)! - 1;
      remaining.set(d, left);
      if (left === 0) ready.push(d);
    }
  }

  const done = new Set(order);
  const blocked = graph.nodes.map((n) => n.id).filter((id) => !done.has(id));
  return { order, blocked, deadlocks: findDeadlocks(graph, new Set(blocked)) };
}

/** One deadlock per strongly connected component that contains a cycle, among the blocked nodes. */
function findDeadlocks(graph: Graph, blocked: Set<string>): Deadlock[] {
  if (blocked.size === 0) return [];
  const req = requiresMap(graph);
  const title = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const ids = graph.nodes.map((n) => n.id).filter((id) => blocked.has(id));

  // Tarjan's SCC over "requires" edges, restricted to blocked nodes.
  let counter = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  const visit = (v: string) => {
    idx.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of req.get(v) ?? []) {
      if (!blocked.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  };
  for (const id of ids) if (!idx.has(id)) visit(id);

  const position = new Map(ids.map((id, i) => [id, i]));
  const deadlocks: Deadlock[] = [];
  for (const scc of sccs) {
    const members = new Set(scc);
    const start = [...scc].sort((a, b) => position.get(a)! - position.get(b)!)[0];
    const selfLoop = (req.get(start) ?? []).includes(start);
    if (scc.length === 1 && !selfLoop) continue;
    const cycle = selfLoop ? [start] : shortestCycle(start, members, req);
    deadlocks.push({ stepIds: cycle, explanation: explain(cycle, title) });
  }
  deadlocks.sort((a, b) => position.get(a.stepIds[0])! - position.get(b.stepIds[0])!);
  return deadlocks;
}

/** BFS along "requires" edges from `start` back to `start`, staying inside the SCC. */
function shortestCycle(start: string, members: Set<string>, req: Map<string, string[]>): string[] {
  const parent = new Map<string, string>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const v = queue.shift()!;
    for (const w of req.get(v) ?? []) {
      if (!members.has(w)) continue;
      if (w === start) {
        const path = [v];
        while (path[0] !== start) path.unshift(parent.get(path[0])!);
        return path;
      }
      if (!seen.has(w)) {
        seen.add(w);
        parent.set(w, v);
        queue.push(w);
      }
    }
  }
  return [start]; // unreachable for a real SCC
}

function explain(cycle: string[], title: Map<string, string>): string {
  const name = (id: string) => title.get(id) ?? id;
  if (cycle.length === 1) {
    return `Deadlock: "${name(cycle[0])}" requires itself. It cannot be started until the requirement is met another way.`;
  }
  const chain = [...cycle, cycle[0]].map((id) => `"${name(id)}"`).join(" requires ");
  return `Deadlock: ${chain}. None of these can be started until one requirement is met another way (for example an in-person alternative or a different document).`;
}
