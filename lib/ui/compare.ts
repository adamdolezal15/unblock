// Your order vs "the usual order" (identity code only via DVV, nothing merged; lib/graph/baseline).
// Says something only when your order is actually better, and says what it costs (extra visits).
import type { Citation } from "@/lib/types";
import { countVisits } from "@/lib/graph/baseline";
import type { Ref, Seg } from "./letter";
import { longDate } from "./letter";
import { milestoneOptions } from "./panel";
import type { RunState } from "./runState";
import { workingDaysBetween } from "@/lib/graph/dates";
import { finnishHolidaysBetween } from "@/lib/graph/holidays";

/** A gain is only worth saying when it is at least this many working days. */
export const MIN_GAIN_WORKING_DAYS = 3;
const wdays = (from: string, to: string) =>
  workingDaysBetween(from, to, new Set(finnishHolidaysBetween(Number(from.slice(0, 4)), Number(to.slice(0, 4)) + 1).map((h) => h.date)));

export function daysBetween(a: string, b: string): number {
  const t = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export type Shortcut = { id: string; text: Seg[] };
/** gain: the headline number ("15 days" + "sooner than the usual order"); null when your order matches the usual order. */
export type Comparison = { sentence: Seg[]; shortcuts: Shortcut[]; gain: { days: number; caption: string } | null };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function compareWithUsual(state: RunState, ref: (c: Citation) => Ref): Comparison | null {
  const sched = state.schedule;
  const bl = sched?.baseline;
  if (!sched || !bl || !bl.endDate) return null;
  const items = sched.schedule.items;
  const last = sched.criticalPath.stepIds[sched.criticalPath.stepIds.length - 1];
  const ours = last ? items[last]?.doneDate : undefined;
  if (!ours) return null;

  const steps = Object.values(state.steps);
  const ourVisits = countVisits(steps, items);
  const gainEnd = daysBetween(ours, bl.endDate);

  // The step(s) that create the gain: the alternative routes the usual order skips.
  const ms = "personal_identity_code";
  const options = milestoneOptions(state, ms);
  const shortcuts: Shortcut[] = bl.skipped
    .filter((id) => items[id])
    .map((id) => {
      const msReady = items[ms]?.readyDate;
      const usualReady = bl.readyDates[ms];
      const n = msReady && usualReady ? daysBetween(msReady, usualReady) : 0;
      const cite = options.find((o) => o.id === id)?.citation;
      const text: Seg[] = [{ t: n > 0 ? `Gets you the personal identity code ${plural(n, "day")} before DVV would` : "A second route to the personal identity code" }];
      if (cite) text.push({ ref: ref(cite) });
      text.push({ t: "." });
      return { id, text };
    });
  const why = shortcuts.flatMap((s) => s.text.filter((x) => "ref" in x)).slice(0, 1);

  if (gainEnd < 0) return null;
  // Always the same yardstick, the usual order: a real gain says how much sooner, anything less says it matches.
  // (No other metric, e.g. "sooner for one step", and no shortcut tag when there is no gain to explain.)
  if (gainEnd === 0 || wdays(ours, bl.endDate) < MIN_GAIN_WORKING_DAYS) {
    return { sentence: [{ t: "Your order matches the usual order." }], shortcuts: [], gain: null };
  }
  const dv = ourVisits - bl.visits;
  const cost = dv < 0 ? ` and ${plural(-dv, "fewer visit")}` : dv > 0 ? `, for ${plural(dv, "extra visit")}` : "";
  return {
    sentence: [
      { t: `The usual order (DVV first) gets you set up by ${longDate(bl.endDate)}. Your order: ${longDate(ours)}, ${plural(gainEnd, "day")} sooner${cost}.` },
      ...why,
    ],
    shortcuts,
    gain: { days: gainEnd, caption: "sooner than the usual order" },
  };
}
