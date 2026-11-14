import type { Profile } from "../types";
import { requirementGroups, satisfiable } from "./buildGraph";
import { addCalendarDays, calendarDaysBetween, helsinkiDate, isWorkingDay, toHelsinkiDate, workingDayCalendar } from "./dates";
import { finnishHolidaysBetween } from "./holidays";
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
 *
 * Same visit: nodes sharing a `visitId` are done together at one service desk. A requirement that a
 * visit-mate meets (directly, or through a milestone that a visit-mate provides) does not wait for that
 * mate's processing time, and all members start on the same day: the latest day any of them could start.
 */
export function schedule(graph: Graph, profile: Pick<Profile, "arrivalDate">, opts: ScheduleOptions = {}): Schedule {
  const today = opts.today ?? helsinkiDate(new Date());
  const arrival = profile.arrivalDate ? toHelsinkiDate(profile.arrivalDate) : today;
  const origin = arrival > today ? arrival : today;
  const startYear = Number(origin.slice(0, 4));
  const holidayList = (opts.holidays ?? finnishHolidaysBetween(startYear, startYear + 2)).map((h) =>
    typeof h === "string" ? { date: h, name: "holiday" } : h,
  );
  const holidayName = new Map(holidayList.map((h) => [h.date, h.name]));
  const holidays = new Set(holidayName.keys());
  const dateAt = workingDayCalendar(origin, holidays);
  /** First weekday holiday skipped right before working day `index` (what pushed a step to that day). */
  const movedBy = (index: number): { from: string; holiday: string } | undefined => {
    const target = dateAt(index);
    for (let d = index === 0 ? origin : addCalendarDays(dateAt(index - 1), 1); d < target; d = addCalendarDays(d, 1)) {
      if (holidays.has(d) && isWorkingDay(d)) return { from: d, holiday: holidayName.get(d)! };
    }
    return undefined;
  };
  const defaults = opts.defaults ?? DEFAULT_ESTIMATE;

  const { order, blocked, deadlocks } = topoOrder(graph);
  const groups = scheduleGroups(graph);
  const milestone = new Set(graph.nodes.filter((n) => n.milestone).map((n) => n.id));
  const visits = visitMembers(graph);
  const visitOf = new Map(graph.nodes.filter((n) => n.visitId).map((n) => [n.id, n.visitId!]));
  const pos = new Map(order.map((id, i) => [id, i]));
  const satisfies = new Map<string, [string, number][]>(graph.nodes.map((n) => [n.id, []]));
  for (const [target, gs] of groups) gs.forEach((g, gi) => g.forEach((o) => satisfies.get(o)?.push([target, gi])));

  const run = (floors: Map<string, number>): Record<string, ScheduledStep> => {
  const groupReady = new Map<string, number[]>();
  const remaining = new Map<string, number>();
  for (const [id, gs] of groups) {
    groupReady.set(id, gs.map(() => Infinity));
    remaining.set(id, gs.length);
  }

  const items: Record<string, ScheduledStep> = {};
  const queue: ScheduledStep[] = [];
  const plan = (id: string, earliest: number) => {
    const startIndex = Math.max(earliest, floors.get(id) ?? 0);
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
      ...(movedBy(startIndex) ? { movedBy: movedBy(startIndex) } : {}),
      ...(visitOf.has(id) ? { visitId: visitOf.get(id) } : {}),
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
  return items;
  };

  // Align each visit to its latest member's start; repeat until no start moves (floors only grow).
  let floors = new Map<string, number>();
  let items = run(floors);
  for (let i = 0; i <= graph.nodes.length; i++) {
    const next = new Map(floors);
    let changed = false;
    for (const members of visits.values()) {
      const scheduled = members.filter((m) => items[m]);
      const start = Math.max(0, ...scheduled.map((m) => items[m].startIndex));
      for (const m of scheduled) {
        if (items[m].startIndex < start) {
          next.set(m, start);
          changed = true;
        }
      }
    }
    if (!changed) break;
    floors = next;
    items = run(floors);
  }

  // Keep items keyed in topological order (stable for consumers), not finalisation order.
  const ordered: Record<string, ScheduledStep> = {};
  for (const id of order) if (items[id]) ordered[id] = items[id];
  return { startDate: dateAt(0), items: ordered, order, blocked, deadlocks };
}

/** visitId -> member node ids. */
export function visitMembers(graph: Graph): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const n of graph.nodes) if (n.visitId) m.set(n.visitId, [...(m.get(n.visitId) ?? []), n.id]);
  return m;
}

/**
 * Requirement groups as the scheduler sees them: a group that a satisfiable visit-mate meets (directly,
 * or as an option of a milestone in the group) is met inside the visit and is dropped.
 */
export function scheduleGroups(graph: Graph): Map<string, string[][]> {
  const groups = requirementGroups(graph);
  const visitOf = new Map(graph.nodes.filter((n) => n.visitId).map((n) => [n.id, n.visitId!]));
  if (visitOf.size === 0) return groups;
  const milestone = new Set(graph.nodes.filter((n) => n.milestone).map((n) => n.id));
  const can = satisfiable(graph);
  const mate = (v: string, o: string) => visitOf.get(o) === v && can.has(o);
  const metInVisit = (v: string, o: string) =>
    mate(v, o) || (milestone.has(o) && (groups.get(o) ?? []).some((g) => g.some((o2) => mate(v, o2))));
  const out = new Map<string, string[][]>();
  for (const [id, gs] of groups) {
    const v = visitOf.get(id);
    out.set(id, v ? gs.filter((g) => !g.some((o) => metInVisit(v, o))) : gs);
  }
  return out;
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

  const groups = scheduleGroups(graph);
  // A visit starts when its latest-blocked member could, so look at every member's requirements.
  const mates = (id: string) => {
    const v = sched.items[id]?.visitId;
    return v ? ids.filter((o) => sched.items[o].visitId === v && sched.items[o].startIndex === sched.items[id].startIndex) : [id];
  };
  const path = [last];
  let cur = last;
  for (;;) {
    let next: string | null = null;
    for (const g of mates(cur).flatMap((m) => groups.get(m) ?? [])) {
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
