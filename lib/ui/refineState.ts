// "Make it more accurate" applied to the run state the views read: the same RunState, with the answers
// reflected in steps, graph, schedule, calendar and the summary counts. Pure; nothing leaves the browser.
import { refine, serializeRefinements, type RefineInput, type RefineKey } from "@/lib/refine/refine";
import type { RunState } from "./runState";

/** What re-planning needs from a finished run; null while the run has no schedule yet. */
export function refineInput(state: RunState): RefineInput | null {
  const profile = state.profile?.profile;
  const startDate = state.schedule?.schedule.origin ?? state.schedule?.schedule.startDate;
  if (state.phase !== "done" || !profile || !startDate || !state.stepOrder.length) return null;
  return { profile, steps: state.stepOrder.map((id) => state.steps[id]).filter(Boolean), tips: state.tips, startDate };
}

/** The /api/calendar.ics link for these answers (the server repeats the same pure re-plan). */
export const icsUrlWith = (icsUrl: string, keys: readonly RefineKey[]) => (keys.length ? `${icsUrl}&r=${serializeRefinements(keys)}` : icsUrl);

export function refineState(state: RunState, keys: readonly RefineKey[], input: RefineInput | null = refineInput(state)): RunState {
  if (!keys.length || !input || !state.schedule || !state.calendar) return state;
  const r = refine(input, keys);
  const steps = Object.fromEntries(r.steps.map((s) => [s.id, s]));
  const known = new Set(Object.keys(steps));
  const stepOrder = state.stepOrder.filter((id) => known.has(id));
  return {
    ...state,
    steps,
    stepOrder,
    graph: r.graph,
    schedule: { schedule: r.plan.schedule, criticalPath: r.plan.path, visitChoices: r.plan.visitChoices, baseline: r.plan.baseline },
    calendar: { events: r.plan.events, icsUrl: icsUrlWith(state.calendar.icsUrl, keys) },
    tips: state.tips.filter((t) => known.has(t.stepId)),
    conflicts: state.conflicts.filter((c) => known.has(c.stepId)),
    summary: state.summary ? { ...state.summary, ...r.counts } : state.summary,
  };
}
