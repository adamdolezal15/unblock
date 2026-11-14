// What the side panel shows for a step, a milestone or an edge. Pure; every fact carries the citation
// it came from. Nothing here is phrased as a fact unless a verified claim, tip or conflict backs it.
import type { Citation, Conflict, Step, Tip, VerifiedClaim } from "@/lib/types";
import type { RunState } from "./runState";

export type Fact = { label: string; value: string; citation: Citation };

/** Steps this one unblocks: direct dependents, and the dependents of any milestone it provides. */
export function unblocks(state: RunState, id: string): { direct: string[]; via?: { milestone: string; steps: string[] } } {
  const edges = state.graph?.graph.edges ?? [];
  const direct = edges.filter((e) => e.source === id && !e.anyOf && !state.steps[e.target]?.milestone).map((e) => e.target);
  const ms = edges.find((e) => e.source === id && e.anyOf)?.target ?? edges.find((e) => e.source === id && state.steps[e.target]?.milestone)?.target;
  if (!ms) return { direct };
  const steps = edges.filter((e) => e.source === ms && !e.anyOf).map((e) => e.target);
  return { direct: direct.filter((d) => d !== ms), via: { milestone: ms, steps } };
}

/** Steps this one needs first (from the graph), with the requirement quote when one exists. */
export function needs(state: RunState, id: string): { id: string; citation?: Citation }[] {
  const edges = state.graph?.graph.edges ?? [];
  const step = state.steps[id];
  return edges
    .filter((e) => e.target === id && !e.anyOf)
    .map((e) => ({ id: e.source, citation: requiresClaim(step, e.source)?.citation }));
}

function requiresClaim(step: Step | undefined, source: string): VerifiedClaim | undefined {
  return step?.claims?.find((c) => c.kind === "requires" && c.value === source);
}

const FACT_LABEL: Partial<Record<VerifiedClaim["kind"], string>> = {
  processing_time: "How long it takes",
  mode: "Online or in person",
  cost_of_delay: "If it waits",
  address: "Where",
  hours: "Opening hours",
  booking_url: "Booking",
};

/** Visit pack and other facts, each with its own quote. */
export function stepFacts(step: Step): { documents: Fact[]; visit: Fact[]; other: Fact[]; costOfDelay: Fact[] } {
  const claims = step.claims ?? [];
  const fact = (c: VerifiedClaim): Fact => ({ label: FACT_LABEL[c.kind] ?? c.kind, value: c.value, citation: c.citation });
  const dedupe = (fs: Fact[]) => fs.filter((f, i) => fs.findIndex((g) => g.value === f.value) === i);
  return {
    documents: dedupe(claims.filter((c) => c.kind === "document").map(fact)),
    visit: dedupe(claims.filter((c) => c.kind === "address" || c.kind === "hours" || c.kind === "booking_url").map(fact)),
    other: dedupe(claims.filter((c) => c.kind === "processing_time" || c.kind === "mode").map(fact)),
    costOfDelay: dedupe(claims.filter((c) => c.kind === "cost_of_delay").map(fact)),
  };
}

export function appliesCitation(step: Step): Citation | undefined {
  return step.claims?.find((c) => c.kind === "applies")?.citation ?? (step.confirmation?.by === "required_by" ? step.confirmation.citations[0] : step.citations[0]);
}

export function tipsFor(tips: Tip[], id: string): Tip[] {
  return tips.filter((t) => t.stepId === id);
}

export function conflictsFor(conflicts: Conflict[], id: string): Conflict[] {
  return conflicts.filter((c) => c.stepId === id);
}

/** Merged visit: the other steps done at the same desk, with the same_visit quote when there is one. */
export function visitMates(state: RunState, id: string): { id: string; citation?: Citation }[] {
  const items = state.schedule?.schedule.items;
  const v = items?.[id]?.visitId;
  if (!items || !v) return [];
  return Object.values(items)
    .filter((i) => i.visitId === v && i.stepId !== id)
    .map((i) => {
      const claim =
        state.steps[id]?.claims?.find((c) => c.kind === "same_visit" && c.value === i.stepId) ??
        state.steps[i.stepId]?.claims?.find((c) => c.kind === "same_visit" && c.value === id);
      return { id: i.stepId, citation: claim?.citation };
    });
}

/** Options of an any-of milestone with the quote saying each one provides it. */
export function milestoneOptions(state: RunState, milestone: string): { id: string; citation?: Citation }[] {
  const edges = state.graph?.graph.edges ?? [];
  const ms = state.steps[milestone];
  return edges
    .filter((e) => e.anyOf && e.target === milestone)
    .map((e) => ({
      id: e.source,
      citation:
        ms?.claims?.find((c) => c.kind === "provides" && c.stepId === e.source)?.citation ??
        state.steps[e.source]?.claims?.find((c) => c.kind === "provides" && c.value === milestone)?.citation,
    }));
}

/**
 * The quotes that justify one edge "target needs source". Any-of edges: the quote that the option
 * provides the milestone. Never falls back to unrelated text: an empty list means no quote links them.
 */
export function edgeEvidence(state: RunState, source: string, target: string): Citation[] {
  const t = state.steps[target];
  const s = state.steps[source];
  const out: Citation[] = [];
  const req = requiresClaim(t, source);
  if (req) out.push(req.citation);
  if (t?.milestone) {
    const p =
      t.claims?.find((c) => c.kind === "provides" && c.stepId === source)?.citation ?? s?.claims?.find((c) => c.kind === "provides" && c.value === target)?.citation;
    if (p) out.push(p);
  }
  // A step confirmed only because the target requires it carries that requirement as its confirmation.
  if (!out.length && s?.confirmation?.by === "required_by" && s.confirmation.stepIds.includes(target)) out.push(...s.confirmation.citations);
  return out.filter((c, i) => out.findIndex((d) => d.url === c.url && d.quote === c.quote) === i);
}
