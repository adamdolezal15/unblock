// "Day by day": the plan as a person would follow it. One entry per visit (day + place), online steps
// grouped by the day they become possible, quiet lines for waiting, tip reminders, and the finish line.
// Pure; every sentence that states a fact carries a footnote (Seg ref). A step with no verified source
// at all says so instead of pretending.
import type { Citation, Step, Tip } from "@/lib/types";
import type { StreamCalEvent } from "@/lib/types";
import type { Ref, Seg } from "./letter";
import type { RunState } from "./runState";
import { unlockedSteps } from "@/lib/graph/unlocks";
import { edgeEvidence, needs, stepFacts, unblocks, type Fact } from "./panel";
import { nodeLabel } from "./labels";
import { bookingHref } from "@/lib/calendar/bookingUrl";
import { venueMonth } from "@/lib/agent/valueFormats";
import { formLine, type FormLine } from "./forms";

export type DayStep = {
  id: string;
  authority: string;
  title: string;
  short: string;
  critical: boolean;
  /** One sentence, with a footnote. */
  whyNow: Seg[];
  unlocks: string[];
  /** Official forms this step asks for, each with its footnote. */
  forms: FormLine[];
  /** True when no verified quote backs this step at all. */
  noSource: boolean;
  wait?: Seg[];
  /** Applied for before travelling (a non-EU residence permit). */
  beforeArrival?: boolean;
  /** Set on optional steps: the one-line reason ("Not needed for a stay under 12 months."). */
  optional?: string;
};

export type VisitEntry = {
  kind: "visit";
  date: string;
  authority: string;
  address?: { value: string; ref: Ref };
  steps: DayStep[];
  bring: { value: string; ref: Ref }[];
  /** Official forms for this visit (its steps' forms, once each). */
  forms: FormLine[];
  /** Distinct source pages behind the Bring list and behind the visit details (address, booking). */
  sources: { bring: number; visit: number };
  /** A link when the source gives one; otherwise the source's booking instruction as text. */
  booking?: { url?: string; text: string; ref: Ref };
  calendarUrl?: string;
  /** A university event where this can be done instead of the office; `when` only if its cited date fits the arrival. */
  venue?: { name: string; ref: Ref; when?: { value: string; ref: Ref } };
  /** Tip reminders for this visit (from people who did it). */
  tips: { text: string; ref?: Ref }[];
};
export type OnlineEntry = { kind: "online"; date: string; steps: DayStep[] };
export type ReminderEntry = { kind: "reminder"; date: string; title: string; ref?: Ref };
export type DoneEntry = { kind: "done"; date: string };
/** Steps this person can skip, on the day they would do them: labelled "Optional", never part of the dates. */
export type OptionalEntry = { kind: "optional"; date: string; steps: DayStep[] };
export type DayEntry = VisitEntry | OnlineEntry | ReminderEntry | DoneEntry | OptionalEntry;

const ORDER: Record<DayEntry["kind"], number> = { visit: 0, online: 1, optional: 2, reminder: 3, done: 4 };

/** Why a step is optional, in one line: a short study stay, or the person's own answer (lib/refine). */
export function optionalReason(step: Pick<Step, "optionalReason">): string {
  return step.optionalReason === "your_choice" ? "You said you don't need it." : "Not needed for a stay under 12 months.";
}

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

/** The source behind a step's wait: a community tip, or the cited processing time. Undefined for a default estimate. */
export function waitCitation(state: RunState, id: string): Citation | undefined {
  const item = state.schedule?.schedule.items[id];
  if (!item || item.waitDays <= 0 || item.estimated) return undefined;
  if (item.waitSource === "community") return bestWaitTip(state.tips, id)?.citation;
  return state.steps[id]?.claims?.find((c) => c.kind === "processing_time")?.citation;
}

export function buildDays(state: RunState, ref: (c: Citation) => Ref): DayEntry[] {
  return plan(state, ref).entries;
}

/** Optional steps (Step.necessity) for the "Optional, if useful for you" section: never in the days above. */
export function buildOptional(state: RunState, ref: (c: Citation) => Ref): DayStep[] {
  return plan(state, ref).optional;
}

export const OPTIONAL_TITLE = "Optional, if useful for you";

function plan(state: RunState, ref: (c: Citation) => Ref): { entries: DayEntry[]; optional: DayStep[] } {
  const sched = state.schedule;
  if (!sched) return { entries: [], optional: [] };
  const items = sched.schedule.items;
  const critical = new Set(sched.criticalPath.stepIds);
  const name = (id: string) => nodeLabel(id, state.steps[id]?.title ?? id);
  const isOptional = (id: string) => state.steps[id]?.necessity === "optional";
  const actionable = sched.schedule.order.filter(
    (id) => items[id] && state.steps[id] && !state.steps[id].milestone && !state.steps[id].done && !isOptional(id),
  );
  const optionalIds = state.stepOrder.filter((id) => isOptional(id) && !state.steps[id].done);
  const events: StreamCalEvent[] = state.calendar?.events ?? [];

  const dayStep = (id: string): DayStep => {
    const step = state.steps[id];
    const item = items[id];
    const facts = stepFacts(step);
    const un = unblocks(state, id);
    // The same list the calendar's "Why" line uses (lib/graph/unlocks).
    const unlocks = (state.graph ? unlockedSteps(state.graph.graph, id) : []).filter((x) => state.steps[x]);
    // One short sentence (the card's header already says if it is on the slowest chain). Candidates in order of
    // usefulness; the first one that carries a source wins, so a card never states a reason without its footnote.
    const skip = (c: Fact): Seg[] => [{ t: `If you skip it: ${lowerName(c.value).replace(/\.$/, "")}` }, { ref: ref(c.citation) }, { t: "." }];
    const words = (f: Fact) => f.value.split(/\s+/).length;
    const candidates: Seg[][] = [];
    const short = facts.costOfDelay.find((f) => words(f) <= 16);
    if (short) candidates.push(skip(short));
    if (unlocks.length) {
      const first = unlocks[0];
      const ev = edgeEvidence(state, un.direct.includes(first) ? id : (un.via?.milestone ?? id), first)[0];
      const list = unlocks.slice(0, 3).map((x) => lowerName(name(x)));
      candidates.push([
        { t: `It unlocks ${list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0]}` },
        ...(ev ? [{ ref: ref(ev) }] : []),
        { t: "." },
      ]);
    }
    if (step.confirmation?.by === "required_by") {
      // Its verified why is the sentence that asks for it.
      const by = step.confirmation.stepIds.filter((x) => state.steps[x] && !state.steps[x].milestone).slice(0, 2).map((x) => lowerName(name(x)));
      if (by.length) candidates.push([{ t: `Needed for ${by.join(" and ")}` }, { ref: ref(step.confirmation.citations[0]) }, { t: "." }]);
    }
    const long = facts.costOfDelay.find((f) => words(f) <= 30);
    if (long && long !== short) candidates.push(skip(long));
    // A leaf step with nothing else to say: what it needs first, with the sentence that says so.
    const need = needs(state, id).find((n) => n.citation && state.steps[n.id]);
    if (need) candidates.push([{ t: `It needs ${lowerName(name(need.id)).replace(/^(?!your |the )/, "the ")} first` }, { ref: ref(need.citation!) }, { t: "." }]);
    // Last resort with a source: how it is done, from the verified mode sentence.
    const mode = step.claims?.find((c) => c.kind === "mode" && c.value === step.mode);
    if (mode) candidates.push([{ t: step.mode === "online" ? "Done online" : step.mode === "in_person" ? "Done in person" : "Done online or in person" }, { ref: ref(mode.citation) }, { t: "." }]);
    const whyNow: Seg[] = candidates.find((c) => c.some((s) => "ref" in s)) ?? candidates[0] ?? [];
    const noSource = !(step.claims?.length || step.citations.length);

    let wait: Seg[] | undefined;
    if (item && item.waitDays > 0) {
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
    return {
      id,
      authority: step.authority,
      title: step.title,
      short: name(id),
      critical: critical.has(id),
      whyNow,
      forms: (step.forms ?? []).map((f) => formLine(f, ref)),
      unlocks,
      noSource,
      wait,
      ...(step.beforeArrival ? { beforeArrival: true } : {}),
      ...(isOptional(id) ? { optional: optionalReason(step) } : {}),
    };
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
    const venue = venueOf(facts.flatMap((f) => f.venue), state.profile?.profile.arrivalDate, ref);
    entries.push({
      kind: "visit",
      date,
      authority: state.steps[id].authority,
      ...(address ? { address } : {}),
      steps: members.map(dayStep),
      bring,
      forms: members.flatMap((m) => state.steps[m].forms ?? []).filter((f, i, all) => all.findIndex((x) => x.id === f.id) === i).map((f) => formLine(f, ref)),
      ...(bookingFact
        ? { booking: { ...(bookingHref(bookingFact.value) ? { url: bookingHref(bookingFact.value)! } : {}), text: bookingFact.value, ref: ref(bookingFact.citation) } }
        : {}),
      ...(event ? { calendarUrl: event.googleTemplateUrl } : {}),
      ...(venue ? { venue } : {}),
      tips: [],
      sources: {
        bring: new Set([...bring.map((b) => b.ref.citation.url), ...members.flatMap((m) => (state.steps[m].forms ?? []).map((f) => f.citation.url))]).size,
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

  // Optional steps stand on the day they would be done, labelled; they do not move the finish line.
  const optionalByDay = new Map<string, string[]>();
  for (const id of optionalIds) {
    if (!items[id]) continue;
    const d = items[id].startDate;
    optionalByDay.set(d, [...(optionalByDay.get(d) ?? []), id]);
  }
  for (const [date, ids] of optionalByDay) entries.push({ kind: "optional", date, steps: ids.map(dayStep) });

  // Tip reminders go under the visit for their step; any others stand alone.
  for (const e of events.filter((x) => x.kind === "reminder")) {
    const text = e.title.replace(/^Tip:\s*/i, "");
    const r = e.citation ? ref(e.citation) : undefined;
    const visit = entries.find((x): x is VisitEntry => x.kind === "visit" && x.steps.some((st) => st.id === e.stepId));
    if (visit) visit.tips.push({ text, ...(r ? { ref: r } : {}) });
    else entries.push({ kind: "reminder", date: e.date, title: text, ...(r ? { ref: r } : {}) });
  }

  const last = sched.criticalPath.stepIds[sched.criticalPath.stepIds.length - 1];
  if (last && items[last]) entries.push({ kind: "done", date: items[last].doneDate });

  entries.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind]);
  return { entries, optional: optionalIds.map(dayStep) };
}

/**
 * The event a step can be done at (a university check-in event), from verified `venue` claims. Its place and
 * date are shown only when the cited date falls in the arrival month or the month after: a date for another
 * intake ("28 & 29 August" for a January arrival) is not this person's date.
 */
function venueOf(facts: Fact[], arrival: string | undefined, ref: (c: Citation) => Ref): VisitEntry["venue"] {
  const event = facts.find((f) => !f.value.includes(":"));
  if (!event) return undefined;
  const where = facts.find((f) => f.value.includes(":"));
  const m = where ? venueMonth(where.value) : undefined;
  const am = arrival ? Number(arrival.slice(5, 7)) : undefined;
  const fits = m !== undefined && am !== undefined && (m === am || m === (am % 12) + 1);
  return {
    name: event.value,
    ref: ref(event.citation),
    ...(where && fits ? { when: { value: where.value.split(":").slice(1).join(":").trim(), ref: ref(where.citation) } } : {}),
  };
}

export type FallbackStep = { id: string; title: string; authority: string; mode: "online" | "in_person" | "either" };

/**
 * Safety net: the run found steps but none of them has a date (a schedule that could not be built, or one
 * that came back empty for any reason). Then the plan is the steps as an ordered list, prerequisites first
 * where the graph knows the order, never an empty page. Null when the schedule has dated steps (or none exist).
 */
export function fallbackSteps(state: RunState): FallbackStep[] | null {
  const real = state.stepOrder.map((id) => state.steps[id]).filter((s) => s && !s.milestone && !s.done);
  if (!real.length) return null;
  const items = state.schedule?.schedule.items ?? {};
  if (real.some((s) => items[s.id])) return null;
  const rank = new Map((state.graph?.order ?? []).map((id, i) => [id, i]));
  const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return real
    .map((s, i) => ({ s, i }))
    .sort((a, b) => at(a.s.id) - at(b.s.id) || a.i - b.i)
    .map(({ s }) => ({ id: s.id, title: nodeLabel(s.id, s.title), authority: s.authority, mode: s.mode }));
}

export const FALLBACK_NOTE = "These steps could not be put on dates this time, so here they are in a sensible order. Each one still links to its sources.";

/** For tests and the panel: the step objects a day entry covers. */
export function entrySteps(e: DayEntry): DayStep[] {
  return e.kind === "visit" || e.kind === "online" ? e.steps : [];
}

