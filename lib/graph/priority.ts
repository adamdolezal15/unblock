import { dependentsMap } from "./buildGraph";
import type { Graph } from "./types";

/**
 * Urgency of a free-text cost of delay, 1 (none stated) to 5 (legal trouble / can't work).
 * Heuristic keyword scoring; the text comes from cited sources, not from us.
 */
export function costOfDelayUrgency(costOfDelay?: string): number {
  if (!costOfDelay || !costOfDelay.trim()) return 1;
  const t = costOfDelay.toLowerCase();
  if (/(illegal|unlawful|deport|fine[sd]?\b|penalt|cannot work|can't work|not allowed to work|lose|overstay|expire)/.test(t)) return 5;
  if (/(%|€|\beur\b|euro|tax|withh|salary|wage|pay|cost|money|benefit)/.test(t)) return 4;
  if (/(cannot|can't|unable|blocked|no access|without|delay|wait)/.test(t)) return 3;
  return 2;
}

/** Number of steps that transitively require each step. Safe on cyclic graphs. */
export function transitiveDependents(graph: Graph): Map<string, number> {
  const deps = dependentsMap(graph);
  const out = new Map<string, number>();
  for (const node of graph.nodes) {
    const seen = new Set<string>();
    const stack = [...(deps.get(node.id) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === node.id || seen.has(id)) continue;
      seen.add(id);
      stack.push(...(deps.get(id) ?? []));
    }
    out.set(node.id, seen.size);
  }
  return out;
}

/** Priority per step = transitive (blocked) dependents × urgency of its cost of delay. */
export function priorityScores(graph: Graph): Record<string, number> {
  const dependents = transitiveDependents(graph);
  const scores: Record<string, number> = {};
  for (const n of graph.nodes) scores[n.id] = (dependents.get(n.id) ?? 0) * costOfDelayUrgency(n.costOfDelay);
  return scores;
}

/**
 * The step with the most transitive dependents. Ties: in_person first, then higher
 * cost-of-delay urgency, then input order. Null when nothing depends on anything.
 */
export function criticalNode(graph: Graph): string | null {
  const dependents = transitiveDependents(graph);
  let best: { id: string; key: number[] } | null = null;
  for (const n of graph.nodes) {
    const key = [dependents.get(n.id) ?? 0, n.mode === "in_person" ? 1 : 0, costOfDelayUrgency(n.costOfDelay)];
    if (!best || compareDesc(key, best.key) < 0) best = { id: n.id, key };
  }
  return best && best.key[0] > 0 ? best.id : null;
}

/** Negative when `a` ranks before `b` (lexicographically larger). */
function compareDesc(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}
