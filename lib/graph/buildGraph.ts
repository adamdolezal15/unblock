import type { Step } from "../types";
import type { Graph, GraphEdge, GraphNode } from "./types";

function humanize(id: string): string {
  const s = id.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

function anyOfGroups(step: Step): string[][] {
  return (step.requiresAnyOf ?? []).map((g) => [...new Set(g)]).filter((g) => g.length > 0);
}

/**
 * Steps -> nodes and edges. Duplicate step ids are merged (first definition wins,
 * `requires` and `requiresAnyOf` are unioned). Unknown ids become placeholder nodes flagged `unresolved`.
 * An any-of group with one option is an ordinary requirement.
 */
export function buildGraph(steps: Step[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const requires = new Map<string, string[]>();
  const anyOf = new Map<string, string[][]>();

  for (const step of steps) {
    const groups = anyOfGroups(step);
    const single = groups.filter((g) => g.length === 1).map((g) => g[0]);
    const multi = groups.filter((g) => g.length > 1);
    const existing = requires.get(step.id);
    if (existing) {
      for (const r of [...step.requires, ...single]) if (!existing.includes(r)) existing.push(r);
      anyOf.get(step.id)!.push(...multi);
      continue;
    }
    nodes.set(step.id, {
      id: step.id,
      title: step.title,
      authority: step.authority,
      mode: step.mode,
      costOfDelay: step.costOfDelay,
      unresolved: false,
      milestone: !!step.milestone,
      ...(step.visitId ? { visitId: step.visitId } : {}),
      step,
    });
    requires.set(step.id, [...new Set([...step.requires, ...single])]);
    anyOf.set(step.id, multi);
  }

  const ensure = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, title: humanize(id), authority: "unknown", mode: "either", unresolved: true, milestone: false });
    }
  };

  const edges: GraphEdge[] = [];
  for (const [target, reqs] of requires) {
    for (const source of reqs) {
      ensure(source);
      edges.push({ id: `${source}->${target}`, source, target });
    }
    anyOf.get(target)!.forEach((group, i) => {
      const groupId = `${target}#any${i}`;
      for (const source of group) {
        ensure(source);
        edges.push({ id: `${source}->${target}#any${i}`, source, target, anyOf: groupId });
      }
    });
  }

  return { nodes: [...nodes.values()], edges };
}

/**
 * id -> requirement groups. Every group must be satisfied; a group is satisfied by ANY one of its
 * options. A plain requirement is a group of one.
 */
export function requirementGroups(graph: Graph): Map<string, string[][]> {
  const m = new Map<string, string[][]>(graph.nodes.map((n) => [n.id, []]));
  const anyOf = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!e.anyOf) m.get(e.target)?.push([e.source]);
    else {
      let g = anyOf.get(e.anyOf);
      if (!g) {
        g = [];
        anyOf.set(e.anyOf, g);
        m.get(e.target)?.push(g);
      }
      g.push(e.source);
    }
  }
  return m;
}

/** id -> ids it requires (edge sources, hard and any-of options alike). */
export function requiresMap(graph: Graph): Map<string, string[]> {
  const m = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) m.get(e.target)?.push(e.source);
  return m;
}

/** id -> ids that directly require it (edge targets, hard and any-of alike). */
export function dependentsMap(graph: Graph): Map<string, string[]> {
  const m = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) m.get(e.source)?.push(e.target);
  return m;
}

/**
 * Which nodes can be completed at all, under AND-of-groups / OR-within-group semantics,
 * optionally pretending some nodes can never be done. Least fixpoint, cycle-safe.
 */
export function satisfiable(graph: Graph, without: ReadonlySet<string> = new Set()): Set<string> {
  const groups = requirementGroups(graph);
  const done = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const n of graph.nodes) {
      if (done.has(n.id) || without.has(n.id)) continue;
      if ((groups.get(n.id) ?? []).every((g) => g.some((o) => done.has(o)))) {
        done.add(n.id);
        changed = true;
      }
    }
  }
  return done;
}
