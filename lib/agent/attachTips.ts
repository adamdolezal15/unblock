// Pure (no Exa / LLM): also used in the browser when a plan is recomputed.
import type { CommunityTip, Step, Tip } from "../types";

/** Steps with their verified tips as `communityTips` (calendar reminders read `trick` tips from there). */
export function attachTips(steps: Step[], tips: Tip[]): Step[] {
  return steps.map((s) => {
    const mine = tips.filter((t) => t.stepId === s.id);
    if (!mine.length) return s;
    const communityTips: CommunityTip[] = mine.map((t) => ({ ...t.citation, kind: t.kind, text: t.tip }));
    return { ...s, communityTips };
  });
}
