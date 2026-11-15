// The Journey design's view of a plan (components/journey). Pure, and built only from what Day by day already
// shows (lib/ui/days), so the two designs cannot disagree: the same dates, steps, waits, forms and quotes.
//   stops   : one per visit day (and per day with an online step on the slowest chain), then the finish
//   tickets : that day's visits (and slowest-chain online steps), each with its bring list, forms, key quote, wait
//   anytime : online steps off the slowest chain (no fixed date) and optional steps
//   worth   : the letter's money-at-stake and source-conflict lines, each on its step
import type { Citation, Trust } from "@/lib/types";
import type { Comparison } from "./compare";
import { dedupeBring } from "./bring";
import { buildDays, waitText, type DayEntry, type DayStep, type OnlineEntry, type VisitEntry } from "./days";
import { domainOf } from "./format";
import type { FormLine } from "./forms";
import type { LetterDoc, Ref, Seg } from "./letter";
import type { RunState } from "./runState";

export type JourneyTicket = {
  key: string;
  kind: "visit" | "online" | "done";
  /** The office on the stub ("Migri", "Your bank"); the stub sets it in capitals. */
  office: string;
  date: string;
  /** "In person" for a day's first visit, "Same day" for the next ones, "Online", or "Set up" at the finish. */
  mode: "In person" | "Same day" | "Online" | "Set up";
  steps: DayStep[];
  bring: string[];
  forms: FormLine[];
  /** The key verified quote behind the ticket (official first), if any. */
  quote?: { text: string; url: string; domain: string; trust: Trust };
  /** Google Calendar template link for the visit. */
  calendarUrl?: string;
  /** "Then about 3 weeks" (the slowest-chain step's wait, else the first wait); the full sentence in `waitTitle`. */
  wait?: string;
  waitTitle?: string;
  shortcut: boolean;
};

export type JourneyStop = {
  date: string;
  /** "Migri + Vero", "DVV", "Fully set up". */
  label: string;
  /** 0..1 along the line, by date, spread so labels never overlap. */
  pos: number;
  finish: boolean;
  tickets: JourneyTicket[];
};

/** A pill on the line between two stops: the wait that separates them ("~3 weeks"). */
export type JourneyWait = { text: string; at: number; from: number };

export type AnytimeRow = { step: DayStep; from: string; optional: boolean };

export type WorthItem = { key: "money" | "conflict"; stepId: string; text: string; strong?: { amount: string; of: string; lead: string } };

export type Journey = {
  end?: string;
  /** True when a date on the slowest chain is an estimate ("by about"). */
  fuzzy: boolean;
  stops: JourneyStop[];
  waits: JourneyWait[];
  anytime: AnytimeRow[];
  worth: WorthItem[];
};

/** Prose without its footnotes, tidied (the same as the Day by day cards). */
export const plainText = (segs: Seg[]) =>
  segs
    .map((s) => ("t" in s ? s.t : ""))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:;!?])/g, "$1")
    .trim();

const refsOf = (segs?: Seg[]) => (segs ?? []).flatMap((s) => ("ref" in s ? [s.ref] : []));
const uniqueForms = (forms: FormLine[]) => forms.filter((f, i, all) => all.findIndex((x) => x.form.id === f.form.id) === i);

/** The minimum distance between two stops on the line (as a share of its length). */
export const MIN_STOP_GAP = 0.14;

/** Positions by date, then pushed apart to at least `gap` (smaller when there are many stops), first at 0, last at 1. */
export function spreadStops(raw: number[], gap = MIN_STOP_GAP): number[] {
  const n = raw.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const g = Math.min(gap, 1 / (n - 1));
  const p = raw.map((x) => Math.min(1, Math.max(0, x)));
  p[0] = 0;
  for (let i = 1; i < n; i++) p[i] = Math.max(p[i], p[i - 1] + g);
  p[n - 1] = 1;
  for (let i = n - 2; i >= 0; i--) p[i] = Math.min(p[i], p[i + 1] - g);
  return p.map((x) => Math.round(Math.max(0, x) * 1000) / 1000);
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** "Your bank" -> "Bank" on the line, where space is short. */
const shortOffice = (a: string) => a.replace(/^Your\s+(\w)/, (_, c: string) => c.toUpperCase());

/** "Migri + Vero"; three or more: "Migri + 2 more". */
export function stopLabel(offices: string[]): string {
  const u = [...new Set(offices.map(shortOffice))];
  return u.length <= 2 ? u.join(" + ") : `${u[0]} + ${u.length - 1} more`;
}

/** "about 3 weeks" -> "~3 weeks"; "3 working days" stays. */
const pillText = (days: number) => waitText(days).replace(/^about /, "~");

function keyQuote(steps: DayStep[], refs: Ref[]): JourneyTicket["quote"] {
  const notCommunity = (r: Ref) => r.citation.trust !== "community";
  const lead = refsOf(steps[0]?.whyNow).filter(notCommunity);
  const all = refs.filter(notCommunity);
  const key = lead.find((r) => r.citation.trust === "official") ?? all.find((r) => r.citation.trust === "official") ?? lead[0] ?? all[0];
  if (!key) return undefined;
  const c: Citation = key.citation;
  return { text: c.quote.trim(), url: c.url, domain: domainOf(c.url), trust: c.trust };
}

function ticketWait(state: RunState, steps: DayStep[]): Pick<JourneyTicket, "wait" | "waitTitle"> {
  const items = state.schedule?.schedule.items ?? {};
  const s = steps.find((x) => x.critical && x.wait) ?? steps.find((x) => x.wait);
  const days = s ? items[s.id]?.waitDays : undefined;
  if (!s || !days) return {};
  return { wait: `Then ${waitText(days)}`, waitTitle: plainText(s.wait!) };
}

function visitTicket(state: RunState, e: VisitEntry, mode: JourneyTicket["mode"], shortcuts: Set<string>): JourneyTicket {
  const forms = uniqueForms([...e.steps.flatMap((s) => s.forms), ...e.forms]);
  const refs = [
    ...e.steps.flatMap((s) => [...refsOf(s.whyNow), ...refsOf(s.wait)]),
    ...forms.flatMap((f) => refsOf(f.guide)),
    ...e.bring.map((b) => b.ref),
    ...[e.address?.ref, e.booking?.ref].filter((r): r is Ref => !!r),
  ];
  return {
    key: `${e.date}:${e.steps[0]?.id}`,
    kind: "visit",
    office: e.authority,
    date: e.date,
    mode,
    steps: e.steps,
    bring: dedupeBring(e.bring).slice(0, 6).map((b) => b.value),
    forms,
    quote: keyQuote(e.steps, refs),
    ...(e.calendarUrl ? { calendarUrl: e.calendarUrl } : {}),
    ...ticketWait(state, e.steps),
    shortcut: e.steps.some((s) => shortcuts.has(s.id)),
  };
}

function onlineTicket(state: RunState, date: string, s: DayStep, shortcuts: Set<string>): JourneyTicket {
  const forms = uniqueForms(s.forms);
  const refs = [...refsOf(s.whyNow), ...refsOf(s.wait), ...forms.flatMap((f) => refsOf(f.guide))];
  return {
    key: `${date}:${s.id}`,
    kind: "online",
    office: s.authority,
    date,
    mode: "Online",
    steps: [s],
    bring: [],
    forms,
    quote: keyQuote([s], refs),
    ...ticketWait(state, [s]),
    shortcut: shortcuts.has(s.id),
  };
}

/** "Without the tax card, 60% … €1,920 of your €3,200 a month." -> lead "Without the tax card", amount, of. */
function moneyParts(text: string): WorthItem["strong"] {
  const m = text.match(/(€\s?[\d,.]+) of your (€\s?[\d,.]+) a month/);
  const lead = text.match(/^(Without [^,:]+)[,:]/)?.[1];
  return m && lead ? { lead, amount: m[1], of: m[2] } : undefined;
}

export function buildJourney(state: RunState, doc: LetterDoc, comparison: Comparison | null): Journey {
  const sched = state.schedule;
  if (!sched) return { fuzzy: false, stops: [], waits: [], anytime: [], worth: [] };
  const items = sched.schedule.items;
  const path = sched.criticalPath.stepIds;
  const last = path[path.length - 1];
  const end = last ? items[last]?.doneDate : undefined;
  const fuzzy = path.some((id) => items[id]?.estimated);
  const shortcuts = new Set((comparison?.shortcuts ?? []).map((s) => s.id));
  const entries: DayEntry[] = buildDays(state, doc.ref);

  // As in Day by day: online steps off the slowest chain have no real date of their own.
  const offChain = (e: DayEntry): boolean => e.kind === "online" && !e.steps.some((s) => s.critical);
  const anytime: AnytimeRow[] = [
    ...entries.filter((e): e is OnlineEntry => offChain(e)).flatMap((e) => e.steps.map((step) => ({ step, from: e.date, optional: false }))),
    ...entries.flatMap((e) => (e.kind === "optional" ? e.steps.map((step) => ({ step, from: e.date, optional: true })) : [])),
  ];

  // One stop per day with a visit or a slowest-chain online step.
  const byDay = new Map<string, JourneyTicket[]>();
  for (const e of entries) {
    if (e.kind !== "visit" && !(e.kind === "online" && !offChain(e))) continue;
    const list = byDay.get(e.date) ?? [];
    if (e.kind === "visit") list.push(visitTicket(state, e, list.some((t) => t.kind === "visit") ? "Same day" : "In person", shortcuts));
    else for (const s of e.steps) list.push(onlineTicket(state, e.date, s, shortcuts));
    byDay.set(e.date, list);
  }
  const days = [...byDay.keys()].sort();
  const stopsRaw: Omit<JourneyStop, "pos">[] = days.map((date) => {
    const tickets = byDay.get(date)!;
    return { date, label: stopLabel(tickets.map((t) => t.office)), finish: false, tickets };
  });
  if (end) {
    stopsRaw.push({
      date: end,
      label: "Fully set up",
      finish: true,
      tickets: [{ key: `${end}:done`, kind: "done", office: "Done", date: end, mode: "Set up", steps: [], bring: [], forms: [], shortcut: false }],
    });
  }
  const first = stopsRaw[0] ? dayNumber(stopsRaw[0].date) : 0;
  const span = stopsRaw.length > 1 ? dayNumber(stopsRaw[stopsRaw.length - 1].date) - first : 0;
  const pos = spreadStops(stopsRaw.map((s) => (span > 0 ? (dayNumber(s.date) - first) / span : 0)));
  const stops: JourneyStop[] = stopsRaw.map((s, i) => ({ ...s, pos: pos[i] }));

  // A pill between two stops: the longest slowest-chain wait that starts at the earlier one, if the gap fits it.
  const waits: JourneyWait[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const w = Math.max(0, ...stops[i].tickets.flatMap((t) => t.steps).filter((s) => s.critical).map((s) => items[s.id]?.waitDays ?? 0));
    if (w > 0 && stops[i + 1].pos - stops[i].pos >= MIN_STOP_GAP) waits.push({ text: pillText(w), at: (stops[i].pos + stops[i + 1].pos) / 2, from: i });
  }

  const worth: WorthItem[] = (doc.letter?.insights ?? []).flatMap((p): WorthItem[] => {
    if (!p.stepId || (p.key !== "money" && p.key !== "conflict")) return [];
    const text = plainText(p.segs);
    const strong = p.key === "money" ? moneyParts(text) : undefined;
    return [{ key: p.key, stepId: p.stepId, text, ...(strong ? { strong } : {}) }];
  });

  return { ...(end ? { end } : {}), fuzzy, stops, waits, anytime, worth };
}

/** "Form 6150e (Registration information on …)" -> "Form 6150e", for buttons and rows; the full name goes in a tooltip. */
export const shortFormName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "") || name;
