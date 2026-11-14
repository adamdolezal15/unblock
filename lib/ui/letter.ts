// The "letter": the answer at the top of the results, written only from run data (never invented).
// Every factual sentence carries a numbered footnote that points at a verified quote. Footnote numbers
// are per source page, assigned in reading order (letter first, then every other citation of the run),
// so the letter, the side panel and the Sources list all use the same numbers.
import type { Citation, Step, Tip, Trust } from "@/lib/types";
import type { RunState } from "./runState";
import { domainOf } from "./format";
import { nodeLabel } from "./graphLayout";

export type Source = { n: number; url: string; domain: string; trust: Trust; fetchedAt: string; quotes: string[] };
export type Ref = { n: number; citation: Citation };
export type Seg = { t: string } | { ref: Ref };
export type Para = { key: string; segs: Seg[]; stepId?: string; /** One-line version for the key insights card. */ insight?: Seg[] };
/** insights: at most 3 one-liners (shortcut, money at stake, conflict), each with its footnote and step. */
export type Letter = { headline: Seg[]; paras: Para[]; insights: Para[] };
export type LetterDoc = { letter: Letter | null; sources: Source[]; ref: (c: Citation) => Ref };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "13 January" or "13 January 2027" when the year differs from `baseYear`. */
export function longDate(iso: string, baseYear?: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${baseYear !== undefined && y !== baseYear ? ` ${y}` : ""}`;
}

/** Dates in running prose: day and month only (the headline's end date carries the year when it differs). */
const day = (iso: string) => longDate(iso);

/** Names in running prose, where the graph's short label reads oddly. */
const PROSE: Record<string, string> = { university_enrolment: "university enrolment", kela_registration: "Kela registration" };

/** "Your bank" stays capitalised at a sentence start only. */
function who(authority: string): string {
  return /^Your /.test(authority) ? authority.replace(/^Your/, "your") : authority;
}

function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) && !/^(DVV|Vero|Kela|Migri|Police|EU|ID|Finnish|Nordic|Finland)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

// Split on sentence ends followed by a capital (not inside "migri.fi" or "e.g.").
const sentences = (s: string) =>
  s
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter(Boolean);

class Registry {
  private byUrl = new Map<string, Source>();
  ref = (c: Citation): Ref => {
    let s = this.byUrl.get(c.url);
    if (!s) {
      s = { n: this.byUrl.size + 1, url: c.url, domain: domainOf(c.url), trust: c.trust, fetchedAt: c.fetchedAt, quotes: [] };
      this.byUrl.set(c.url, s);
    }
    if (!s.quotes.includes(c.quote)) s.quotes.push(c.quote);
    return { n: s.n, citation: c };
  };
  list = () => [...this.byUrl.values()];
}

type Ctx = { state: RunState; reg: Registry; short: (id: string) => string; baseYear?: number };

export function buildLetter(state: RunState): LetterDoc {
  const reg = new Registry();
  const short = (id: string) => PROSE[id] ?? nodeLabel(id, state.steps[id]?.title ?? id);
  const start = state.schedule?.schedule.startDate;
  const ctx: Ctx = { state, reg, short, baseYear: start ? Number(start.slice(0, 4)) : undefined };
  const letter = state.schedule ? writeLetter(ctx) : null;

  // Every other citation of the run, in a stable order, so panel numbers exist before they are shown.
  for (const id of state.stepOrder) {
    const s = state.steps[id];
    for (const c of s.claims ?? []) reg.ref(c.citation);
    for (const c of s.citations) reg.ref(c);
  }
  for (const t of state.tips) reg.ref(t.citation);
  for (const c of state.conflicts) {
    reg.ref(c.a);
    reg.ref(c.b);
  }
  return { letter, sources: reg.list(), ref: reg.ref };
}

function writeLetter(ctx: Ctx): Letter {
  const { state } = ctx;
  const paras: Para[] = [];
  const shortcut = findShortcut(ctx);

  // Headline: when you are set up, and where to start.
  const sched = state.schedule!;
  const path = sched.criticalPath.stepIds;
  const last = path[path.length - 1];
  const end = last ? sched.schedule.items[last]?.doneDate : undefined;
  const fuzzy = path.some((id) => sched.schedule.items[id]?.estimated);
  const headline: Seg[] = [];
  if (end) headline.push({ t: `You can be fully set up by ${fuzzy ? "about " : ""}${longDate(end, ctx.baseYear)}. ` });
  else headline.push({ t: "Here is the order to do things in. " });
  if (shortcut) {
    headline.push({ t: `Get your ${shortcut.label} at ${who(shortcut.fast.authority)} on ${day(shortcut.fast.start)}, not at ${who(shortcut.slow.authority)}.` });
    if (shortcut.fastRef) headline.push({ ref: shortcut.fastRef });
  } else {
    const first = path[0];
    const step = first ? state.steps[first] : undefined;
    const it = first ? sched.schedule.items[first] : undefined;
    if (step && it) {
      headline.push({ t: `Start with the ${lowerFirst(ctx.short(first))} at ${who(step.authority)} on ${day(it.startDate)}: the longest chain of steps begins there.` });
      const applies = step.claims?.find((c) => c.kind === "applies")?.citation ?? step.citations[0];
      if (applies) headline.push({ ref: ctx.reg.ref(applies) });
    }
  }

  if (shortcut) {
    const p = shortcutPara(ctx, shortcut);
    p.insight = [
      { t: `Get your ${shortcut.label} at ${who(shortcut.fast.authority)} on ${day(shortcut.fast.start)}, ${shortcut.gap} working days sooner than through ${who(shortcut.slow.authority)}.` },
      ...(shortcut.fastRef ? [{ ref: shortcut.fastRef }] : []),
    ];
    paras.push(p);
  }
  const money = moneyPara(ctx);
  if (money) paras.push(money);
  const conflict = conflictPara(ctx);
  if (conflict) paras.push(conflict);
  const estimates = estimatePara(ctx);
  if (estimates) paras.push(estimates);
  const insights = paras.filter((p) => p.insight).slice(0, 3).map((p) => ({ key: p.key, segs: p.insight!, stepId: p.stepId }));
  return { headline, paras, insights };
}

type Option = { id: string; authority: string; start: string; ready: string; readyIndex: number };
type Shortcut = { milestone: string; label: string; fast: Option; slow: Option; gap: number; fastRef?: Ref; slowRef?: Ref; dependents: string[] };

/** An any-of choice where one option is ready at least 3 working days before another. */
function findShortcut(ctx: Ctx): Shortcut | null {
  const { state } = ctx;
  const graph = state.graph?.graph;
  const items = state.schedule?.schedule.items;
  if (!graph || !items) return null;
  const groups = new Map<string, { target: string; options: string[] }>();
  for (const e of graph.edges) {
    if (!e.anyOf) continue;
    const g = groups.get(e.anyOf) ?? { target: e.target, options: [] };
    g.options.push(e.source);
    groups.set(e.anyOf, g);
  }
  let best: Shortcut | null = null;
  for (const g of groups.values()) {
    const opts: Option[] = g.options
      .filter((id) => items[id] && state.steps[id])
      .map((id) => ({ id, authority: state.steps[id].authority, start: items[id].startDate, ready: items[id].readyDate, readyIndex: items[id].readyIndex }))
      .sort((a, b) => a.readyIndex - b.readyIndex);
    if (opts.length < 2) continue;
    const fast = opts[0];
    const slow = opts[opts.length - 1];
    const gap = slow.readyIndex - fast.readyIndex;
    if (gap < 3 || (best && gap <= best.gap)) continue;
    const ms = state.steps[g.target];
    const provides = (opt: string) =>
      ms?.claims?.find((c) => c.kind === "provides" && c.stepId === opt)?.citation ??
      state.steps[opt]?.claims?.find((c) => c.kind === "provides" && c.value === g.target)?.citation;
    const fp = provides(fast.id);
    const sp = provides(slow.id);
    const dependents = graph.edges
      .filter((e) => e.source === g.target && !e.anyOf && items[e.target])
      .map((e) => e.target)
      .sort((a, b) => items[a].startDate.localeCompare(items[b].startDate));
    best = {
      milestone: g.target,
      label: lowerFirst(ms?.title ?? ctx.short(g.target)),
      fast,
      slow,
      gap,
      fastRef: fp ? ctx.reg.ref(fp) : undefined,
      slowRef: sp ? ctx.reg.ref(sp) : undefined,
      dependents,
    };
  }
  return best;
}

function shortcutPara(ctx: Ctx, s: Shortcut): Para {
  const { state } = ctx;
  const items = state.schedule!.schedule.items;
  const segs: Seg[] = [{ t: `Two routes give you a ${s.label}: ${lowerFirst(ctx.short(s.fast.id))}` }];
  if (s.fastRef) segs.push({ ref: s.fastRef });
  segs.push({ t: ` and ${lowerFirst(ctx.short(s.slow.id))}` });
  if (s.slowRef) segs.push({ ref: s.slowRef });
  segs.push({
    t: `. Through ${who(s.fast.authority)} you can use it from ${day(s.fast.ready)}; through ${who(s.slow.authority)} not until ${day(s.slow.ready)}, ${s.gap} working days later.`,
  });
  // Steps the code unblocks (not ones done in the same visit, which start before it is ready).
  const visitOf = (id: string) => items[id]?.visitId;
  const deps = s.dependents
    .filter((id) => !state.steps[id]?.milestone && items[id].startIndex >= s.fast.readyIndex && !(visitOf(id) && visitOf(id) === visitOf(s.fast.id)))
    .slice(0, 2);
  if (deps.length) {
    const list = deps.map((id) => `the ${lowerFirst(ctx.short(id))} on ${day(items[id].startDate)}`);
    segs.push({ t: ` With it you can start ${list.join(" and ")}.` });
  }
  // Same desk, same visit (a verified same_visit claim).
  const visit = items[s.fast.id]?.visitId;
  const mates = visit ? Object.values(items).filter((i) => i.visitId === visit && i.stepId !== s.fast.id) : [];
  if (mates.length) {
    const mate = mates[0].stepId;
    const claim =
      state.steps[s.fast.id]?.claims?.find((c) => c.kind === "same_visit" && c.value === mate) ??
      state.steps[mate]?.claims?.find((c) => c.kind === "same_visit" && c.value === s.fast.id);
    segs.push({ t: ` Get your ${lowerFirst(ctx.short(mate))} in the same visit` });
    if (claim) segs.push({ ref: ctx.reg.ref(claim.citation) });
    segs.push({ t: "." });
  }
  return { key: "shortcut", segs, stepId: s.fast.id };
}

/** Money at stake, only from a verified cost-of-delay quote that states a percentage of salary. */
function moneyPara(ctx: Ctx): Para | null {
  const { state } = ctx;
  const salary = state.profile?.profile.monthlySalaryEur;
  if (!salary) return null;
  for (const id of state.stepOrder) {
    const step = state.steps[id];
    for (const c of step.claims ?? []) {
      if (c.kind !== "cost_of_delay") continue;
      const q = c.citation.quote;
      const m = q.match(/(\d{1,3}(?:[.,]\d+)?)\s?%\s*(?:of\s+(?:your\s+)?)?(salary|income|wages?|pay)/i);
      if (!m) continue;
      const pct = Number(m[1].replace(",", "."));
      if (!(pct > 0 && pct <= 100)) continue;
      const eur = Math.round((salary * pct) / 100);
      return {
        key: "money",
        stepId: id,
        segs: [
          { t: `Don't leave the ${lowerFirst(ctx.short(id))} for later: without it, ${pct}% of your salary is withheld` },
          { ref: ctx.reg.ref(c.citation) },
          { t: `. On €${salary.toLocaleString("en-GB")} a month that is €${eur.toLocaleString("en-GB")}.` },
        ],
        insight: [
          { t: `Without the ${lowerFirst(ctx.short(id))}, ${pct}% of your salary is withheld` },
          { ref: ctx.reg.ref(c.citation) },
          { t: `: €${eur.toLocaleString("en-GB")} of your €${salary.toLocaleString("en-GB")} a month.` },
        ],
      };
    }
  }
  return null;
}

/** "family_member_permit.mode" style topics in plain English. */
export function topicText(topic: string, short: (id: string) => string): string {
  const m = topic.match(/^([a-z_]+)\.([a-z_]+)$/);
  if (!m) return topic;
  const step = lowerFirst(short(m[1]));
  switch (m[2]) {
    case "mode":
      return `whether the ${step} is done online or in person`;
    case "processing_time":
      return `how long the ${step} takes`;
    case "cost_of_delay":
      return `what happens if the ${step} is late`;
    case "document":
    case "documents":
      return `which documents the ${step} needs`;
    default:
      return `the ${step}`;
  }
}

const MODE_WORD: Record<string, string> = { online: "online", in_person: "in person", either: "online or in person" };
const RAW_TOPIC = /^[a-z_]+\.[a-z_]+$/;

/** The conflict note in prose. Same-step mode disagreements carry raw values ("online" vs "in_person"). */
export function conflictNote(note: string, a: Citation, b: Citation): string {
  const m = note.match(/"(online|in_person|either)"\s*vs\s*"(online|in_person|either)"/);
  if (m) return `${domainOf(a.url)} says ${MODE_WORD[m[1]]}, ${domainOf(b.url)} says ${MODE_WORD[m[2]]}.`;
  return note.trim();
}

/** whatToDo, at most two sentences. */
export function whatToDoShort(text: string): string {
  return sentences(text).slice(0, 2).join(" ");
}

function conflictPara(ctx: Ctx): Para | null {
  // Prefer a disagreement the conflict checker explained over a raw same-step field mismatch.
  const conflicts = [...ctx.state.conflicts].sort((x, y) => Number(RAW_TOPIC.test(x.topic)) - Number(RAW_TOPIC.test(y.topic)));
  const c = conflicts[0];
  if (!c) return null;
  const segs: Seg[] = [
    { t: `${c.a.trust === "official" && c.b.trust === "official" ? "Official sources disagree" : "Sources disagree"} on ${topicText(c.topic, ctx.short)}. ${conflictNote(c.note, c.a, c.b)}` },
    { ref: ctx.reg.ref(c.a) },
    { ref: ctx.reg.ref(c.b) },
    { t: ` ${whatToDoShort(c.whatToDo)}` },
  ];
  if (conflicts.length > 1) {
    const k = conflicts.length - 1;
    segs.push({ t: ` I found ${k} more disagreement${k === 1 ? "" : "s"}; ${k === 1 ? "it is" : "they are"} marked on the map.` });
  }
  const insight: Seg[] = [
    { t: `${c.a.trust === "official" && c.b.trust === "official" ? "Official sources disagree" : "Sources disagree"} on ${topicText(c.topic, ctx.short)}.` },
    { ref: ctx.reg.ref(c.a) },
    { ref: ctx.reg.ref(c.b) },
  ];
  return { key: "conflict", segs, stepId: c.stepId, insight };
}

function estimatePara(ctx: Ctx): Para | null {
  const { state } = ctx;
  const items = state.schedule!.schedule.items;
  const real = Object.values(items).filter((i) => !state.steps[i.stepId]?.milestone && !state.steps[i.stepId]?.done);
  const segs: Seg[] = [];
  const community = real.filter((i) => i.waitSource === "community").slice(0, 2);
  for (const i of community) {
    const tip = bestWaitTip(state.tips, i.stepId);
    segs.push({ t: `${segs.length ? " " : ""}The wait for the ${lowerFirst(ctx.short(i.stepId))} comes from people who did it` });
    if (tip) segs.push({ ref: ctx.reg.ref(tip.citation) });
    segs.push({ t: ", not from an official figure." });
  }
  const est = real.filter((i) => i.estimated);
  if (est.length) {
    const names = est.map((i) => lowerFirst(ctx.short(i.stepId)));
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    segs.push({
      t: `${segs.length ? " " : ""}${est.length === 1 ? "One date is an estimate" : `${est.length} of the ${real.length} dates are estimates`}, because no official figure was found: ${list}. ${est.length === 1 ? "It is" : "They are"} marked * in the plan.`,
    });
  }
  if (!segs.length) return null;
  return { key: "estimates", segs };
}

function bestWaitTip(tips: Tip[], stepId: string): Tip | undefined {
  const mine = tips.filter((t) => t.stepId === stepId);
  return mine.find((t) => t.kind === "wait_time" && t.waitDays !== undefined) ?? mine.find((t) => t.kind === "wait_time") ?? mine[0];
}

/** For panel code: the step's own claims of one kind. */
export function claimsOf(step: Step | undefined, kind: string) {
  return (step?.claims ?? []).filter((c) => c.kind === kind);
}
