import { requirementGroups } from "./buildGraph";
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

/**
 * For each node, the set of nodes it NECESSARILY depends on: a plain requirement and everything
 * behind it, plus whatever ALL options of an any-of group have in common. Least fixpoint; cycle-safe.
 */
export function necessaryPrerequisites(graph: Graph): Map<string, Set<string>> {
  const groups = requirementGroups(graph);
  const nec = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set<string>()]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const n of graph.nodes) {
      const cur = nec.get(n.id)!;
      for (const g of groups.get(n.id) ?? []) {
        // intersection over options of ({option} ∪ nec(option))
        let common: string[] | null = null;
        for (const o of g) {
          const via = new Set<string>([o, ...(nec.get(o) ?? [])]);
          common = common === null ? [...via] : common.filter((x) => via.has(x));
        }
        for (const x of common ?? []) {
          if (!cur.has(x)) {
            cur.add(x);
            changed = true;
          }
        }
      }
    }
  }
  return nec;
}

/**
 * Number of (non-milestone) steps that cannot happen without each step. An option in an any-of group
 * blocks nothing on its own, because another option can replace it. Safe on cyclic graphs.
 */
export function transitiveDependents(graph: Graph): Map<string, number> {
  const nec = necessaryPrerequisites(graph);
  const out = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  for (const d of graph.nodes) {
    if (d.milestone) continue;
    for (const x of nec.get(d.id)!) if (x !== d.id) out.set(x, (out.get(x) ?? 0) + 1);
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
    if (n.milestone) continue; // a state like "has an ID code" is not something you can go and do
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
