// Scheduling for a set of steps, as one pure call: schedule, critical path, visit choices, the usual-order
// baseline, calendar events and the counts of the summary. The pipeline (lib/agent/run.ts) and "Make it more
// accurate" (lib/refine/refine.ts, in the browser) both go through it, so a refined plan cannot drift from a run.
// No Exa, no LLM, no I/O: safe to bundle for the client.
import { estimatesWithTips } from "../agent/estimates";
import { STEP_TAXONOMY } from "../agent/stepTaxonomy";
import { eventsFromSchedule, googleTemplateUrl } from "../calendar";
import { buildGraph, criticalPath, describeVisitAlternative, schedule } from "../graph";
import { usualOrder, type Baseline } from "../graph/baseline";
import type { CriticalPath, Schedule } from "../graph/types";
import type { VisitChoice } from "../graph/schedule";
import { normalizeUrl } from "../agent/normalizeUrl";
import type { Citation, Conflict, Profile, RunSummary, Step, StreamCalEvent, Tip, Trust } from "../types";

/** Short lowercase name for visit-choice text ("bank account", "DVV registration"). */
export function shortName(id: string): string {
  const label = STEP_TAXONOMY.find((d) => d.id === id)?.label ?? id.replace(/_/g, " ");
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

export type SchedulePlan = {
  schedule: Schedule;
  path: CriticalPath;
  visitChoices: (VisitChoice & { description: string })[];
  baseline?: Baseline;
  events: StreamCalEvent[];
};

/** `steps` carry their communityTips (calendar reminders); `today` is YYYY-MM-DD (Helsinki), default today. */
export function schedulePlan(steps: Step[], tips: Tip[], profile: Pick<Profile, "arrivalDate">, today?: string): SchedulePlan {
  const graph = buildGraph(steps);
  const opts = { estimates: estimatesWithTips(steps, tips), ...(today ? { today } : {}) };
  const sched = schedule(graph, profile, opts);
  const baseline = usualOrder(steps, profile, opts);
  return {
    schedule: sched,
    path: criticalPath(graph, sched),
    visitChoices: sched.visitChoices.map((c) => ({ ...c, description: describeVisitAlternative(c, shortName) })),
    ...(baseline ? { baseline } : {}),
    events: eventsFromSchedule(steps, sched).map((e) => ({ ...e, googleTemplateUrl: googleTemplateUrl(e) })),
  };
}

export type PlanCounts = Pick<
  RunSummary,
  "steps" | "alreadyDone" | "optional" | "online" | "inPersonVisits" | "inCalendar" | "reminders" | "criticalPath"
>;

const TRUSTS: Trust[] = ["official", "provider", "university", "news", "community"];

/**
 * The summary's quote and source counts for the steps, tips and conflicts a plan shows: distinct verified quotes
 * (url + quote) and distinct source URLs by trust tier. The letter's sources list registers the same citations.
 */
export function citationCounts(steps: Step[], tips: Pick<Tip, "citation">[], conflicts: Pick<Conflict, "a" | "b">[]): Pick<RunSummary, "sourcesByTrust" | "verifiedQuotes"> {
  const citations: Citation[] = [
    ...steps.flatMap((x) => [...x.citations, ...(x.claims ?? []).map((c) => c.citation)]),
    ...tips.map((t) => t.citation),
    ...conflicts.flatMap((c) => [c.a, c.b]),
  ];
  const urlTrust = new Map<string, Trust>();
  const quotes = new Set<string>();
  for (const c of citations) {
    urlTrust.set(normalizeUrl(c.url), c.trust);
    quotes.add(`${normalizeUrl(c.url)}|${c.quote}`);
  }
  const sourcesByTrust = Object.fromEntries(TRUSTS.map((t) => [t, 0])) as Record<Trust, number>;
  for (const t of urlTrust.values()) sourcesByTrust[t]++;
  return { sourcesByTrust, verifiedQuotes: quotes.size };
}

/** The summary's numbers for a plan. Optional steps (Step.necessity) are listed apart and never counted as part of it. */
export function planCounts(steps: Step[], sched: Schedule | undefined, path: CriticalPath | undefined, events: { kind: string }[]): PlanCounts {
  // The steps shown in the plan: no milestones, nothing already done, nothing optional.
  const real = steps.filter((x) => !x.milestone && !x.done && x.necessity !== "optional");
  const visits = new Set<string>();
  for (const x of real) {
    const item = sched?.items[x.id];
    if (x.mode === "in_person" && item) visits.add(item.visitId ?? x.id);
  }
  const last = path?.stepIds[path.stepIds.length - 1];
  return {
    steps: real.length,
    alreadyDone: steps.filter((x) => x.done).length,
    optional: steps.filter((x) => x.necessity === "optional").length,
    online: real.filter((x) => x.mode === "online" || x.mode === "either").length,
    inPersonVisits: visits.size,
    inCalendar: events.filter((e) => e.kind === "visit").length,
    reminders: events.filter((e) => e.kind === "reminder").length,
    criticalPath: {
      stepIds: path?.stepIds ?? [],
      workingDays: path?.totalDays ?? 0,
      calendarDays: path?.calendarDays ?? 0,
      endDate: last && sched ? sched.items[last].doneDate : null,
    },
  };
}
