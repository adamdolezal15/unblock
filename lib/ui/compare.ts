// Your order vs "the usual order" (identity code only via DVV, nothing merged; lib/graph/baseline).
// Says something only when your order is actually better, and says what it costs (extra visits).
import type { Citation } from "@/lib/types";
import { countVisits } from "@/lib/graph/baseline";
import type { Ref, Seg } from "./letter";
import { longDate } from "./letter";
import { milestoneOptions } from "./panel";
import type { RunState } from "./runState";
import { nodeLabel } from "./labels";
import { lowerName } from "./days";

export function daysBetween(a: string, b: string): number {
  const t = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export type Shortcut = { id: string; text: Seg[] };
/** gain: the headline number for a tile ("15 days" + "sooner than the usual order"). */
export type Comparison = { sentence: Seg[]; shortcuts: Shortcut[]; gain: { days: number; caption: string } };

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
  const name = (id: string) => lowerName(nodeLabel(id, state.steps[id]?.title ?? id));

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

  if (gainEnd > 0) {
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
  if (gainEnd < 0) return null;

  // Same finish: name the steps you reach sooner, biggest gain first.
  const gains = Object.keys(items)
    .filter((id) => bl.startDates[id] && state.steps[id] && !state.steps[id].milestone)
    .map((id) => ({ id, n: daysBetween(items[id].startDate, bl.startDates[id]) }))
    .filter((g) => g.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2);
  if (!gains.length) return null;
  const list = gains.map((g) => `the ${name(g.id)} ${plural(g.n, "day")} sooner`);
  return {
    sentence: [{ t: `The usual order (DVV first) also finishes on ${longDate(bl.endDate)}, but in your order you can start ${list.join(" and ")}.` }, ...why],
    shortcuts,
    gain: { days: gains[0].n, caption: `sooner for the ${name(gains[0].id)}` },
  };
}
