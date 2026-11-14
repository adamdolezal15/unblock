import type { Profile } from "../types";
import { requirementGroups } from "./buildGraph";
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
 * and `holidays`. Each step starts once every requirement group is ready; an any-of group is ready
 * when its EARLIEST-finishing option is. Independent steps run in parallel. A step occupies
 * `durationDays` working days, then `waitDays` pass before its dependents can start. Milestones
 * (states, not actions) take 0 + 0 unless estimated. Steps in or behind a deadlock are not scheduled.
 *
 * Earliest times are computed in time order (Knuth's AND/OR generalisation of Dijkstra): nodes are
 * finalised by increasing ready day, so the first option to finalise is the earliest for its group.
 */
export function schedule(graph: Graph, profile: Pick<Profile, "arrivalDate">, opts: ScheduleOptions = {}): Schedule {
  const today = opts.today ?? helsinkiDate(new Date());
  const arrival = profile.arrivalDate ? toHelsinkiDate(profile.arrivalDate) : today;
  const holidays = new Set(opts.holidays ?? []);
  const dateAt = workingDayCalendar(arrival > today ? arrival : today, holidays);
  const defaults = opts.defaults ?? DEFAULT_ESTIMATE;

  const { order, blocked, deadlocks } = topoOrder(graph);
  const groups = requirementGroups(graph);
  const milestone = new Set(graph.nodes.filter((n) => n.milestone).map((n) => n.id));
  const pos = new Map(order.map((id, i) => [id, i]));
  const satisfies = new Map<string, [string, number][]>(graph.nodes.map((n) => [n.id, []]));
  for (const [target, gs] of groups) gs.forEach((g, gi) => g.forEach((o) => satisfies.get(o)?.push([target, gi])));

  const groupReady = new Map<string, number[]>();
  const remaining = new Map<string, number>();
  for (const [id, gs] of groups) {
    groupReady.set(id, gs.map(() => Infinity));
    remaining.set(id, gs.length);
  }

  const items: Record<string, ScheduledStep> = {};
  const queue: ScheduledStep[] = [];
  const plan = (id: string, startIndex: number) => {
    const known = opts.estimates?.[id] ?? {};
    const dur = clean(known.durationDays);
    const wait = clean(known.waitDays);
    const isMilestone = milestone.has(id);
    const durationDays = dur ?? (isMilestone ? 0 : defaults.durationDays);
    const waitDays = wait ?? (isMilestone ? 0 : defaults.waitDays);
    const readyIndex = startIndex + durationDays + waitDays;
    queue.push({
      stepId: id,
      startDate: dateAt(startIndex),
      endDate: dateAt(startIndex + Math.max(durationDays, 1) - 1),
      doneDate: dateAt(Math.max(startIndex, readyIndex - 1)),
      readyDate: dateAt(readyIndex),
      startIndex,
      readyIndex,
      durationDays,
      waitDays,
      estimated: !isMilestone && (dur === undefined || wait === undefined),
    });
  };
  for (const id of order) if (remaining.get(id) === 0) plan(id, 0);

  while (queue.length) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i];
      const b = queue[best];
      if (a.readyIndex < b.readyIndex || (a.readyIndex === b.readyIndex && pos.get(a.stepId)! < pos.get(b.stepId)!)) best = i;
    }
    const item = queue.splice(best, 1)[0];
    items[item.stepId] = item;
    for (const [d, gi] of satisfies.get(item.stepId) ?? []) {
      const gr = groupReady.get(d)!;
      if (gr[gi] !== Infinity || items[d]) continue;
      gr[gi] = item.readyIndex; // first to finalise = earliest option
      const left = remaining.get(d)! - 1;
      remaining.set(d, left);
      if (left === 0) plan(d, Math.max(...gr));
    }
  }

  // Keep items keyed in topological order (stable for consumers), not finalisation order.
  const ordered: Record<string, ScheduledStep> = {};
  for (const id of order) if (items[id]) ordered[id] = items[id];
  return { startDate: dateAt(0), items: ordered, order, blocked, deadlocks };
}

/**
 * The chain of binding prerequisites ending at the step that finishes last.
 * Walks back from the last-finishing step, each time taking the prerequisite whose
 * readiness set the current step's start (ties: higher priority, then earlier in order).
 * For an any-of group only the option that satisfied it (the earliest-ready one) can bind.
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

  const groups = requirementGroups(graph);
  const path = [last];
  let cur = last;
  for (;;) {
    let next: string | null = null;
    for (const g of groups.get(cur) ?? []) {
      // the option that actually satisfied this group: the earliest-ready scheduled one
      let chosen: string | null = null;
      for (const o of g) {
        const it = sched.items[o];
        if (!it) continue;
        if (chosen === null || it.readyIndex < sched.items[chosen].readyIndex) chosen = o;
      }
      if (chosen === null || sched.items[chosen].readyIndex !== sched.items[cur].startIndex) continue;
      if (next === null || better(chosen, next)) next = chosen;
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
