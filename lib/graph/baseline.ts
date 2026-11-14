// "The usual order": what a newcomer following the generic advice gets. Same steps, same verified waits,
// same scheduler; but the personal identity code only through DVV registration (the alternatives,
// e.g. a Vero tax office, are not used) and no merged visits. The UI compares it with the real plan
// and only mentions it when the real plan is actually better.
import type { Profile, Step } from "../types";
import { buildGraph } from "./buildGraph";
import { criticalPath, schedule } from "./schedule";
import type { ScheduleOptions } from "./types";

export const BASELINE_ROUTE = "dvv_registration";
const MILESTONE = "personal_identity_code";

export type Baseline = {
  /** Done date of the last step on the baseline's critical path. */
  endDate: string | null;
  /** Distinct in-person visits (nothing merged). */
  visits: number;
  startDates: Record<string, string>;
  readyDates: Record<string, string>;
  /** Steps the usual order does not do at all (the alternative routes it ignores). */
  skipped: string[];
};

/** Distinct in-person visits in a schedule, counted like RunSummary.inPersonVisits. */
export function countVisits(steps: Step[], items: Record<string, { visitId?: string }>): number {
  const visits = new Set<string>();
  for (const s of steps) if (s.mode === "in_person" && !s.milestone && !s.done && items[s.id]) visits.add(items[s.id].visitId ?? s.id);
  return visits.size;
}

/** null when there is no alternative route to compare (the code already comes only from DVV, or no DVV step). */
export function usualOrder(steps: Step[], profile: Pick<Profile, "arrivalDate">, opts: ScheduleOptions = {}): Baseline | null {
  const ms = steps.find((s) => s.id === MILESTONE);
  const groups = ms?.requiresAnyOf ?? [];
  if (!ms || !groups.some((g) => g.includes(BASELINE_ROUTE) && g.length > 1)) return null;
  if (!steps.some((s) => s.id === BASELINE_ROUTE)) return null;

  const alternatives = new Set(groups.flat().filter((id) => id !== BASELINE_ROUTE));
  // Only drop an alternative nothing else needs directly.
  const neededElsewhere = new Set(steps.filter((s) => s.id !== MILESTONE).flatMap((s) => [...s.requires, ...(s.requiresAnyOf ?? []).flat()]));
  const skipped = [...alternatives].filter((id) => !neededElsewhere.has(id) && steps.some((s) => s.id === id));

  const usual: Step[] = steps
    .filter((s) => !skipped.includes(s.id))
    .map((s) => {
      const { visitId: _visit, ...rest } = s;
      void _visit;
      if (s.id !== MILESTONE) return rest;
      return { ...rest, requires: [...new Set([...s.requires, BASELINE_ROUTE])], requiresAnyOf: undefined };
    });

  const graph = buildGraph(usual);
  const sched = schedule(graph, profile, opts);
  const path = criticalPath(graph, sched);
  const last = path.stepIds[path.stepIds.length - 1];
  const startDates: Record<string, string> = {};
  const readyDates: Record<string, string> = {};
  for (const [id, it] of Object.entries(sched.items)) {
    startDates[id] = it.startDate;
    readyDates[id] = it.readyDate;
  }
  return {
    endDate: last ? (sched.items[last]?.doneDate ?? null) : null,
    visits: countVisits(usual, sched.items),
    startDates,
    readyDates,
    skipped,
  };
}
