// "Day by day": the plan as a person would follow it. One entry per visit (day + place), online steps
// grouped by the day they become possible, quiet lines for waiting, tip reminders, and the finish line.
// Pure; every sentence that states a fact carries a footnote (Seg ref). A step with no verified source
// at all says so instead of pretending.
import type { Citation, Tip } from "@/lib/types";
import type { StreamCalEvent } from "@/lib/types";
import type { Ref, Seg } from "./letter";
import type { RunState } from "./runState";
import { edgeEvidence, stepFacts, unblocks, type Fact } from "./panel";
import { nodeLabel } from "./labels";
import { bookingHref } from "@/lib/calendar/bookingUrl";

export type DayStep = {
  id: string;
  title: string;
  short: string;
  critical: boolean;
  /** One sentence, with a footnote. */
  whyNow: Seg[];
  unlocks: string[];
  /** True when no verified quote backs this step at all. */
  noSource: boolean;
  wait?: Seg[];
};

export type VisitEntry = {
  kind: "visit";
  date: string;
  authority: string;
  address?: { value: string; ref: Ref };
  steps: DayStep[];
  bring: { value: string; ref: Ref }[];
  /** Distinct source pages behind the Bring list and behind the visit details (address, booking). */
  sources: { bring: number; visit: number };
  /** A link when the source gives one; otherwise the source's booking instruction as text. */
  booking?: { url?: string; text: string; ref: Ref };
  calendarUrl?: string;
  /** Tip reminders for this visit (from people who did it). */
  tips: { text: string; ref?: Ref }[];
};
export type OnlineEntry = { kind: "online"; date: string; steps: DayStep[] };
export type ReminderEntry = { kind: "reminder"; date: string; title: string; ref?: Ref };
export type DoneEntry = { kind: "done"; date: string };
export type DayEntry = VisitEntry | OnlineEntry | ReminderEntry | DoneEntry;

const ORDER: Record<DayEntry["kind"], number> = { visit: 0, online: 1, reminder: 2, done: 3 };

export function lowerName(s: string): string {
  return /^[A-Z][a-z]/.test(s) && !/^(DVV|Vero|Kela|Migri|Police|EU|ID|Finnish|Nordic)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "about 3 weeks" / "4 working days" */
export function waitText(days: number): string {
  if (days < 5) return `${days} working day${days === 1 ? "" : "s"}`;
  const w = Math.round(days / 5);
  return `about ${w} week${w === 1 ? "" : "s"}`;
}

function bestWaitTip(tips: Tip[], id: string): Tip | undefined {
  const mine = tips.filter((t) => t.stepId === id);
  return mine.find((t) => t.kind === "wait_time" && t.waitDays !== undefined) ?? mine.find((t) => t.kind === "wait_time") ?? mine[0];
}

export function buildDays(state: RunState, ref: (c: Citation) => Ref): DayEntry[] {
  const sched = state.schedule;
  if (!sched) return [];
  const items = sched.schedule.items;
  const critical = new Set(sched.criticalPath.stepIds);
  const name = (id: string) => nodeLabel(id, state.steps[id]?.title ?? id);
  const actionable = sched.schedule.order.filter((id) => items[id] && state.steps[id] && !state.steps[id].milestone && !state.steps[id].done);
  const events: StreamCalEvent[] = state.calendar?.events ?? [];

  const dayStep = (id: string): DayStep => {
    const step = state.steps[id];
    const item = items[id];
    const facts = stepFacts(step);
    const un = unblocks(state, id);
    const unlocks = [...new Set([...un.direct, ...(un.via?.steps ?? [])])].filter((x) => x !== id && state.steps[x] && !state.steps[x].milestone);
    const whyNow: Seg[] = [];
    // One short sentence (the card's header already says if it is on the slowest chain).
    const cod = facts.costOfDelay.find((f) => f.value.split(/\s+/).length <= 16);
    if (cod) {
      whyNow.push({ t: `If it waits: ${lowerName(cod.value).replace(/\.$/, "")}` }, { ref: ref(cod.citation) }, { t: "." });
    } else if (unlocks.length) {
      const first = unlocks[0];
      const ev = edgeEvidence(state, un.direct.includes(first) ? id : (un.via?.milestone ?? id), first)[0];
      const list = unlocks.slice(0, 3).map((x) => lowerName(name(x)));
      whyNow.push({ t: `It unlocks ${list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0]}` });
      if (ev) whyNow.push({ ref: ref(ev) });
      whyNow.push({ t: "." });
    } else {
      const applies = step.claims?.find((c) => c.kind === "applies")?.citation ?? step.citations[0];
      whyNow.push({ t: "It applies to your situation" });
      if (applies) whyNow.push({ ref: ref(applies) });
      whyNow.push({ t: "." });
    }
    const noSource = !(step.claims?.length || step.citations.length);

    let wait: Seg[] | undefined;
    if (item.waitDays > 0) {
      wait = [{ t: `Then wait ${waitText(item.waitDays)} for ${step.authority.replace(/^Your/, "your")}` }];
      if (item.estimated) wait.push({ t: ". Estimate: no official figure found." });
      else if (item.waitSource === "community") {
        const tip = bestWaitTip(state.tips, id);
        wait.push({ t: ", a community estimate" });
        if (tip) wait.push({ ref: ref(tip.citation) });
        wait.push({ t: "." });
      } else {
        const pt = step.claims?.find((c) => c.kind === "processing_time")?.citation;
        wait.push({ t: ", the official processing time" });
        if (pt) wait.push({ ref: ref(pt) });
        wait.push({ t: "." });
      }
    }
    return { id, title: step.title, short: name(id), critical: critical.has(id), whyNow, unlocks, noSource, wait };
  };

  const entries: DayEntry[] = [];
  const placed = new Set<string>();
  const visitIds = new Set(events.filter((e) => e.kind === "visit").map((e) => e.stepId));

  // Visits: steps with a calendar visit, plus same-visit mates on the same day.
  for (const id of actionable) {
    if (!visitIds.has(id) || placed.has(id)) continue;
    const date = items[id].startDate;
    const v = items[id].visitId;
    const members = [id, ...actionable.filter((x) => x !== id && v && items[x].visitId === v && items[x].startDate === date && !placed.has(x))];
    members.forEach((m) => placed.add(m));
    const facts = members.map((m) => stepFacts(state.steps[m]));
    const pick = (f: Fact | undefined) => (f ? { value: f.value, ref: ref(f.citation) } : undefined);
    const address = pick(facts.flatMap((f) => f.visit).find((f) => f.label === "Where"));
    const bookings = facts.flatMap((f) => f.visit).filter((f) => f.label === "Booking");
    const bookingFact = bookings.find((f) => bookingHref(f.value)) ?? bookings[0];
    const bring = facts
      .flatMap((f) => f.documents)
      .filter((d, i, all) => all.findIndex((x) => x.value === d.value) === i)
      .map((d) => ({ value: d.value, ref: ref(d.citation) }));
    const event = events.find((e) => e.kind === "visit" && members.includes(e.stepId));
    entries.push({
      kind: "visit",
      date,
      authority: state.steps[id].authority,
      ...(address ? { address } : {}),
      steps: members.map(dayStep),
      bring,
      ...(bookingFact
        ? { booking: { ...(bookingHref(bookingFact.value) ? { url: bookingHref(bookingFact.value)! } : {}), text: bookingFact.value, ref: ref(bookingFact.citation) } }
        : {}),
      ...(event ? { calendarUrl: event.googleTemplateUrl } : {}),
      tips: [],
      sources: {
        bring: new Set(bring.map((b) => b.ref.citation.url)).size,
        visit: new Set([address?.ref.citation.url, bookingFact?.citation.url].filter(Boolean)).size,
      },
    });
  }

  // Online (or either) steps, grouped by the first day they are possible.
  const online = new Map<string, string[]>();
  for (const id of actionable) {
    if (placed.has(id)) continue;
    const d = items[id].startDate;
    online.set(d, [...(online.get(d) ?? []), id]);
  }
  for (const [date, ids] of online) entries.push({ kind: "online", date, steps: ids.map(dayStep) });

  // Tip reminders go under the visit for their step; any others stand alone.
  for (const e of events.filter((x) => x.kind === "reminder")) {
    const text = e.title.replace(/^Tip:s*/i, "");
    const r = e.citation ? ref(e.citation) : undefined;
    const visit = entries.find((x): x is VisitEntry => x.kind === "visit" && x.steps.some((st) => st.id === e.stepId));
    if (visit) visit.tips.push({ text, ...(r ? { ref: r } : {}) });
    else entries.push({ kind: "reminder", date: e.date, title: text, ...(r ? { ref: r } : {}) });
  }

  const last = sched.criticalPath.stepIds[sched.criticalPath.stepIds.length - 1];
  if (last && items[last]) entries.push({ kind: "done", date: items[last].doneDate });

  return entries.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind]);
}

/** For tests and the panel: the step objects a day entry covers. */
export function entrySteps(e: DayEntry): DayStep[] {
  return e.kind === "visit" || e.kind === "online" ? e.steps : [];
}

