import type { Profile } from "../types";
import { requiresMap } from "./buildGraph";
import { calendarDaysBetween, helsinkiDate, toHelsinkiDate, workingDayCalendar } from "./dates";
import { priorityScores } from "./priority";
import { topoOrder } from "./topoOrder";
import type { CriticalPath, Graph, Schedule, ScheduleOptions, ScheduledStep } from "./types";

/** Fallback when no community estimate exists: a day of effort, a working week of processing. */
export const DEFAULT_ESTIMATE = { durationDays: 1, waitDays: 5 } as const;

function clean(n: number | undefined): number | undefined {
  return n === undefined || !Number.isFinite(n) ? undefined : Math.max(0, Math.ceil(n));
}

/**
 * Assigns working-day dates. Starts at max(arrival, today) in Helsinki, skipping weekends
 * and `holidays`. Each step starts once all its prerequisites are ready; independent steps
 * run in parallel. A step occupies `durationDays` working days, then `waitDays` pass before
 * its dependents can start. Steps in or behind a deadlock are not scheduled.
 */
export function schedule(graph: Graph, profile: Pick<Profile, "arrivalDate">, opts: ScheduleOptions = {}): Schedule {
  const today = opts.today ?? helsinkiDate(new Date());
  const arrival = profile.arrivalDate ? toHelsinkiDate(profile.arrivalDate) : today;
  const holidays = new Set(opts.holidays ?? []);
  const dateAt = workingDayCalendar(arrival > today ? arrival : today, holidays);
  const defaults = opts.defaults ?? DEFAULT_ESTIMATE;

  const { order, blocked, deadlocks } = topoOrder(graph);
  const req = requiresMap(graph);
  const items: Record<string, ScheduledStep> = {};

  for (const id of order) {
    const known = opts.estimates?.[id] ?? {};
    const dur = clean(known.durationDays);
    const wait = clean(known.waitDays);
    const durationDays = dur ?? defaults.durationDays;
    const waitDays = wait ?? defaults.waitDays;

    let startIndex = 0;
    for (const r of req.get(id) ?? []) startIndex = Math.max(startIndex, items[r].readyIndex);
    const readyIndex = startIndex + durationDays + waitDays;

    items[id] = {
      stepId: id,
      startDate: dateAt(startIndex),
      endDate: dateAt(startIndex + Math.max(durationDays, 1) - 1),
      doneDate: dateAt(Math.max(startIndex, readyIndex - 1)),
      readyDate: dateAt(readyIndex),
      startIndex,
      readyIndex,
      durationDays,
      waitDays,
      estimated: dur === undefined || wait === undefined,
    };
  }

  return { startDate: dateAt(0), items, order, blocked, deadlocks };
}

/**
 * The chain of binding prerequisites ending at the step that finishes last.
 * Walks back from the last-finishing step, each time taking the prerequisite whose
 * readiness set the current step's start (ties: higher priority, then earlier in order).
 */
export function criticalPath(graph: Graph, sched: Schedule): CriticalPath {
  const ids = sched.order.filter((id) => sched.items[id]);
  if (ids.length === 0) return { stepIds: [], totalDays: 0, calendarDays: 0 };

  const priority = priorityScores(graph);
  const pos = new Map(ids.map((id, i) => [id, i]));
  const better = (a: string, b: string) =>
    (priority[a] ?? 0) !== (priority[b] ?? 0) ? (priority[a] ?? 0) > (priority[b] ?? 0) : pos.get(a)! < pos.get(b)!;

  let last = ids[0];
  for (const id of ids) {
    const r = sched.items[id].readyIndex;
    const lr = sched.items[last].readyIndex;
    if (r > lr || (r === lr && better(id, last))) last = id;
  }

  const req = requiresMap(graph);
  const path = [last];
  let cur = last;
  for (;;) {
    let next: string | null = null;
    for (const r of req.get(cur) ?? []) {
      const item = sched.items[r];
      if (!item || item.readyIndex !== sched.items[cur].startIndex) continue;
      if (next === null || better(r, next)) next = r;
    }
    if (next === null) break;
    path.unshift(next);
    cur = next;
  }

  const end = sched.items[last];
  return {
    stepIds: path,
    totalDays: end.readyIndex,
    calendarDays: calendarDaysBetween(sched.startDate, end.doneDate) + 1,
  };
}
