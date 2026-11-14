import type { Step } from "../types";
import type { Graph, GraphEdge, GraphNode } from "./types";

function humanize(id: string): string {
  const s = id.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

/**
 * Steps -> nodes and edges. Duplicate step ids are merged (first definition wins,
 * `requires` are unioned). Unknown `requires` ids become placeholder nodes flagged `unresolved`.
 */
export function buildGraph(steps: Step[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const requires = new Map<string, string[]>();

  for (const step of steps) {
    const existing = requires.get(step.id);
    if (existing) {
      for (const r of step.requires) if (!existing.includes(r)) existing.push(r);
      continue;
    }
    nodes.set(step.id, {
      id: step.id,
      title: step.title,
      authority: step.authority,
      mode: step.mode,
      costOfDelay: step.costOfDelay,
      unresolved: false,
      step,
    });
    requires.set(step.id, [...new Set(step.requires)]);
  }

  const edges: GraphEdge[] = [];
  for (const [target, reqs] of requires) {
    for (const source of reqs) {
      if (!nodes.has(source)) {
        nodes.set(source, {
          id: source,
          title: humanize(source),
          authority: "unknown",
          mode: "either",
          unresolved: true,
        });
      }
      edges.push({ id: `${source}->${target}`, source, target });
    }
  }

  return { nodes: [...nodes.values()], edges };
}

/** id -> ids it requires (edge sources). */
export function requiresMap(graph: Graph): Map<string, string[]> {
  const m = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) m.get(e.target)?.push(e.source);
  return m;
}

/** id -> ids that directly require it (edge targets). */
export function dependentsMap(graph: Graph): Map<string, string[]> {
  const m = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) m.get(e.source)?.push(e.target);
  return m;
}
