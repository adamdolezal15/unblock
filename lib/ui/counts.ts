// The numbers the page shows about a plan, from one place, in one wording. The header, the closing sentence,
// the activity log and the sources list all read them here, so they cannot disagree:
//   steps / visits / online : planCounts() over the steps as shown (refinements applied), the same call the
//                             pipeline's summary and its "Scheduled N steps" line use
//   quotes / dropped / sources : the run summary (final verified quotes, dropped claims, distinct source URLs)
//   duration                : RunSummary.liveMs (a replay shows the original live run; unknown -> omitted)
import { planCounts } from "@/lib/refine/plan";
import type { RunActivity } from "@/lib/types";
import { fmtSeconds, plural } from "./format";
import type { RunState } from "./runState";

export type PlanNumbers = {
  steps: number;
  visits: number;
  online: number;
  /** null until the run summary arrives. */
  quotes: number | null;
  dropped: number | null;
  sources: number | null;
  official: number | null;
  durationMs: number | null;
};

export function planNumbers(state: Pick<RunState, "steps" | "schedule" | "summary">): PlanNumbers {
  const c = planCounts(Object.values(state.steps), state.schedule?.schedule, state.schedule?.criticalPath, []);
  const s = state.summary;
  return {
    steps: c.steps,
    visits: c.inPersonVisits,
    online: c.online,
    quotes: s ? s.verifiedQuotes : null,
    dropped: s ? s.droppedClaims : null,
    sources: s ? Object.values(s.sourcesByTrust).reduce((a, b) => a + b, 0) : null,
    official: s ? s.sourcesByTrust.official ?? 0 : null,
    durationMs: s?.liveMs ?? null,
  };
}

/** The one wording for each number, used everywhere it appears. */
export const say = {
  steps: (n: number) => plural(n, "step"),
  visits: (n: number) => plural(n, "visit"),
  online: (n: number) => `${n} online`,
  quotes: (n: number) => plural(n, "verified quote"),
  dropped: (n: number) => plural(n, "claim") + " dropped",
  sources: (n: number) => plural(n, "source"),
  duration: (ms: number) => fmtSeconds(ms),
};

/** "9 steps · 5 visits · 90 verified quotes · 5 claims dropped · 40 sources": the run's counts in one line. */
export function countsLine(n: PlanNumbers): string {
  return [
    say.steps(n.steps),
    say.visits(n.visits),
    ...(n.quotes !== null ? [say.quotes(n.quotes)] : []),
    ...(n.dropped !== null ? [say.dropped(n.dropped)] : []),
    ...(n.sources !== null ? [say.sources(n.sources)] : []),
  ].join(" · ");
}

/** The activity log's last line: what each actor did, then the plan's counts in the shared wording. */
export function activityLine(a: RunActivity, n: PlanNumbers): string {
  return `Exa: ${plural(a.searches, "search", "searches")}, ${plural(a.pagesRead, "page")} read · Claude: ${plural(a.extractions, "extraction")} · ${countsLine(n)}`;
}

/** "Researched live with Exa: 12 searches, 30 pages read, 9 sources" (the header's small line). */
export function exaLine(s: { activity: RunActivity }, n: PlanNumbers): string {
  return `Researched live with Exa: ${plural(s.activity.searches, "search", "searches")}, ${plural(s.activity.pagesRead, "page")} read${n.sources !== null ? `, ${say.sources(n.sources)}` : ""}`;
}
