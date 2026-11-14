// What finishing a step unblocks. One definition for the day cards, the side panel and the calendar "Why" line,
// so they always list the same steps.
import type { Graph, GraphEdge } from "./types";

/** Direct dependents, plus the dependents of the milestone this step is an option of ("via"). */
export function unblockedBy(
  edges: GraphEdge[],
  isMilestone: (id: string) => boolean,
  id: string,
): { direct: string[]; via?: { milestone: string; steps: string[] } } {
  const direct = edges.filter((e) => e.source === id && !e.anyOf && !isMilestone(e.target)).map((e) => e.target);
  const ms = edges.find((e) => e.source === id && e.anyOf)?.target ?? edges.find((e) => e.source === id && isMilestone(e.target))?.target;
  if (!ms) return { direct };
  const steps = edges.filter((e) => e.source === ms && !e.anyOf).map((e) => e.target);
  return { direct: direct.filter((d) => d !== ms), via: { milestone: ms, steps } };
}

/** The steps (never milestones) that finishing `id` unblocks, directly or through a milestone it provides. */
export function unlockedSteps(graph: Graph, id: string): string[] {
  const node = new Map(graph.nodes.map((n) => [n.id, n]));
  const un = unblockedBy(graph.edges, (x) => !!node.get(x)?.milestone, id);
  return [...new Set([...un.direct, ...(un.via?.steps ?? [])])].filter((x) => x !== id && node.get(x) && !node.get(x)!.milestone && !node.get(x)!.unresolved);
}
