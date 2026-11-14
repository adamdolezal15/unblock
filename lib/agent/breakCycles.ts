// Requirement cycles. Sources often state soft links ("the identity code is needed for various services")
// next to hard gates ("can be registered only after your studies have started"). Several soft links can
// close a loop, and then nothing in the loop (or behind it) can ever be scheduled: an empty plan.
// General rule: while the graph has a deadlock, drop the requirement in the cycle with the weakest
// evidence (its quote reads least like a gate). Structural edges (a milestone met by a provider) are only
// dropped when nothing else is left. Each dropped link is recorded on the step (`relaxedRequires`); its
// verified claim stays, so nothing cited is lost. Pure: no network, no model.
import { buildGraph } from "../graph/buildGraph";
import { topoOrder } from "../graph/topoOrder";
import type { Step } from "../types";

const GATE =
  /\bonly (after|once|when|if)\b|\bmust (first|have|be|already)\b|\bbefore (you can|applying|registering)\b|\b(is|are) required\b|\brequires?\b|\bcannot\b|\bcan(not| ?n'?t)? be (issued|granted|registered|opened)\b[^.]*\b(if|when|after|once)\b|\bprovided (that|you)\b|\bto be granted\b|\bcertificate of\b|\byou need\b/i;
const SOFT =
  /\busually\b|\bneeded for (various|other|many)\b|\bcompulsory to have\b|\brecommend|\bshould\b|\bin case\b|\bhelps?\b|\buseful\b|\bfor example\b|\beg\.|\be\.g\.|\bmay\b/i;

/** 0 (soft) .. 3 (hard gate) for "step requires dep", from the verified quote behind that link. */
export function requirementStrength(step: Step, dep: string): number {
  if (step.milestone) return 4; // "met by any provider": structure, not a reading of a sentence
  const quotes = (step.claims ?? []).filter((c) => c.kind === "requires" && c.value === dep).map((c) => c.citation.quote);
  if (!quotes.length) return 2; // derived link (no quote of its own): middle
  return Math.max(...quotes.map((q) => (GATE.test(q) ? 3 : 2) - (SOFT.test(q) ? 2 : 0)));
}

export type Relaxed = { stepId: string; requires: string; strength: number };

export function breakCycles(steps: Step[]): { steps: Step[]; relaxed: Relaxed[] } {
  let out = steps;
  const relaxed: Relaxed[] = [];
  for (let guard = 0; guard < 50; guard++) {
    const { deadlocks } = topoOrder(buildGraph(out));
    if (!deadlocks.length) break;
    const byId = new Map(out.map((s) => [s.id, s]));
    const cycle = deadlocks[0].stepIds;
    // Edges of the cycle: cycle[i] requires cycle[i+1], the last requires the first.
    let weakest: Relaxed | null = null;
    cycle.forEach((id, i) => {
      const dep = cycle[(i + 1) % cycle.length];
      const step = byId.get(id);
      if (!step) return;
      const strength = requirementStrength(step, dep);
      if (!weakest || strength < weakest.strength) weakest = { stepId: id, requires: dep, strength };
    });
    if (!weakest) break;
    const w: Relaxed = weakest;
    relaxed.push(w);
    out = out.map((s) =>
      s.id !== w.stepId
        ? s
        : {
            ...s,
            requires: s.requires.filter((r) => r !== w.requires),
            ...(s.requiresAnyOf
              ? { requiresAnyOf: s.requiresAnyOf.map((g) => g.filter((r) => r !== w.requires)).filter((g) => g.length) }
              : {}),
            relaxedRequires: [...new Set([...(s.relaxedRequires ?? []), w.requires])],
          },
    );
  }
  return { steps: out, relaxed };
}
