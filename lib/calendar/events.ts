import type { Step } from "../types";
import { bookingHref } from "./bookingUrl";
import type { Schedule } from "../graph/types";
import type { CalEvent } from "./types";
import { visitPackText } from "./visitPack";

const VISIT_TIME = "10:00";
const VISIT_MINUTES = 60;
const DEFAULT_REMINDER_TIME = "09:00";
const REMINDER_MINUTES = 15;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One visit event per scheduled in_person step, plus a reminder per community tip of
 * kind "trick" on such a step. Steps the schedule could not place (deadlocks) are skipped.
 */
export function eventsFromSchedule(steps: Step[], sched: Schedule): CalEvent[] {
  const events: CalEvent[] = [];
  for (const step of steps) {
    const item = sched.items[step.id];
    if (step.mode !== "in_person" || !item) continue;

    const unblocks = steps.filter((s) => s.requires.includes(step.id));
    events.push({
      uid: `${step.id}@unblock`,
      kind: "visit",
      stepId: step.id,
      title: `${step.title} (${step.authority})`,
      date: item.startDate,
      startTime: VISIT_TIME,
      durationMinutes: VISIT_MINUTES,
      details: visitPackText(step, { unblocks, estimated: item.estimated }),
      location: step.visitPack?.address,
      ...(bookingHref(step.visitPack?.bookingUrl) ? { url: bookingHref(step.visitPack?.bookingUrl)! } : {}),
      estimated: item.estimated,
    });

    (step.communityTips ?? []).forEach((tip, i) => {
      if (tip.kind !== "trick") return;
      const text = tip.text ?? tip.quote;
      const time = tip.remindAt && HHMM.test(tip.remindAt) ? tip.remindAt : DEFAULT_REMINDER_TIME;
      events.push({
        uid: `${step.id}-trick-${i}@unblock`,
        kind: "reminder",
        stepId: step.id,
        title: `Tip: ${text}`,
        date: item.startDate,
        startTime: time,
        durationMinutes: REMINDER_MINUTES,
        details: [
          `Tip for: ${step.title}`,
          `Community tip: "${tip.quote}"`,
          `Source (${tip.trust}): ${tip.url}`,
          "Community advice, not official. Verify with the authority.",
        ].join("\n"),
        estimated: item.estimated,
        citation: tip,
      });
    });
  }
  return events.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
