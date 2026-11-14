// Invariants every finished run must satisfy, whatever the profile. Pure: reads the client RunState (the
// same thing the UI renders) and the UI's own derived views (letter, day by day, comparison, profile
// sentence). Used by scripts/eval-invariants.ts (matrix table) and tests/golden/invariants.test.ts.
import type { Citation, Step } from "../types";
import { citizenshipClass, type CitizenshipClass } from "../agent/applicability";
import { buildLetter, type Seg } from "../ui/letter";
import { buildDays, buildOptional, entrySteps, type DayEntry } from "../ui/days";
import { OPTIONAL_FOR_SHORT_STUDY, shortStudyStay, verifiedMust } from "../agent/necessity";
import { namesOnlyOtherOutput } from "../agent/stepTaxonomy";
import { venueMonth } from "../agent/valueFormats";
import { compareWithUsual, MIN_GAIN_WORKING_DAYS } from "../ui/compare";
import { isConsequence, stepFacts } from "../ui/panel";
import { profileParts } from "../ui/profileSentence";
import { assumptionKind } from "../ui/assumptionLabel";
import { countVisits } from "../graph/baseline";
import { looksLikeAddress, looksLikeDuration, looksLikeHours } from "../agent/valueFormats";
import { workingDaysBetween } from "../graph/dates";
import { finnishHolidaysBetween } from "../graph/holidays";
import type { RunState } from "../ui/runState";

export const INVARIANTS = {
  exclusive: "no mutually exclusive registrations for the citizenship class",
  cited: "every step shows a verified quote or 'No official source found'",
  empty: "no empty strings in steps / tips / bring",
  format: "address / hours / processing time / dates pass format checks",
  shortcut: `'Shortcut' only on steps with a baseline gain >= ${MIN_GAIN_WORKING_DAYS} working days`,
  permit: "non-EU residence permit scheduled before arrival",
  bring: "bring items don't target another citizenship class",
  skip: "'If you skip it' only for consequences",
  visits: "visit count = distinct in-person visits",
  scheduled: "steps > 0 => schedule and a real date in the headline",
  blank: "no empty headlines or list items",
  assumptions: "assumptions are short code-generated labels",
  optional: "short study stay: everyday steps optional unless a source says must; optional steps never in the dates, path or counts",
  waits: "a processing time is the step's own, not the wait for another step's result",
  venue: "a check-in event for a step is shown on its card; its date only when it fits the arrival",
} as const;

export type InvariantId = keyof typeof INVARIANTS;
export type Violation = { id: InvariantId; detail: string };


/** The one registration / permit path of each class; the others must not appear. */
export const REGISTRATION_BY_CLASS: Record<CitizenshipClass, string> = {
  EU: "eu_registration",
  NORDIC: "nordic_registration",
  NON_EU: "residence_permit",
  TP: "temporary_protection",
};

/** Text that only makes sense for one citizenship class (a Bring item for another class is wrong). */
const CLASS_TEXT: { classes: CitizenshipClass[]; re: RegExp }[] = [
  { classes: ["NON_EU", "TP"], re: /\bresidence permit\b|\bvisa\b|\bnon-?\s?(EU|EEA)\b|third[- ]country/i },
  // Nordic citizens are EU / EEA citizens too; only the EU registration itself is EU-only.
  { classes: ["EU", "NORDIC"], re: /(?<!non-?\s?)\b(EU|EEA) citizens?\b|(?<!non-?\s?)citizens? of (an? |the )?(EU|EEA|European Union)\b/i },
  { classes: ["EU"], re: /registration (certificate )?of (an? |the )?(EU citizen'?s? )?right of residence|right of residence registration|\(for EU citizens\)/i },
  { classes: ["NORDIC"], re: /\bNordic (citizens?|move|registration|notification)|inter-?Nordic/i },
  { classes: ["TP"], re: /temporary protection/i },
];

const MONTH = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_IN_TEXT = new RegExp(`\\b([1-9]|[12]\\d|3[01]) (${MONTH})\\b`);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const segText = (segs: Seg[]) => segs.map((s) => ("t" in s ? s.t : `[${s.ref.n}]`)).join("");
const hasRef = (segs: Seg[]) => segs.some((s) => "ref" in s);
const blank = (s: string | undefined | null) => !s || !s.trim();
/** Rendering leftovers: an empty slot, a missing value, a dangling separator. */
const BROKEN = /\bundefined\b|\bnull\b|\bNaN\b|\s[.,:;]|\(\s*\)|:\s*$|\s{2,}|\b(\w+ \w+) \1\b/i;

const realIsoDate = (s: string) => {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};


/** Every string in a value, with its path. */
function strings(v: unknown, path: string, out: { path: string; value: string }[] = []): { path: string; value: string }[] {
  if (typeof v === "string") out.push({ path, value: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}

const wdays = (from: string, to: string) =>
  workingDaysBetween(from, to, new Set(finnishHolidaysBetween(Number(from.slice(0, 4)), Number(to.slice(0, 4)) + 1).map((h) => h.date)));

const actionable = (s: Step) => !s.milestone && !s.done;

export function checkInvariants(state: RunState): Violation[] {
  const out: Violation[] = [];
  const add = (id: InvariantId, detail: string) => out.push({ id, detail });
  const profile = state.profile?.profile;
  if (!profile) return [{ id: "scheduled", detail: "no profile" }];
  const cls = citizenshipClass(profile);
  const steps = Object.values(state.steps);
  const real = steps.filter(actionable);
  const doc = buildLetter(state);
  const days = buildDays(state, doc.ref);
  const dayStepsAll = days.flatMap(entrySteps);
  const items = state.schedule?.schedule.items ?? {};

  // --- exclusive: one registration path per class (shown steps and "not found" stubs alike)
  const present = new Set([...real.map((s) => s.id), ...state.stubs.map((s) => s.id)]);
  for (const [c, id] of Object.entries(REGISTRATION_BY_CLASS)) {
    if (c !== cls && present.has(id)) add("exclusive", `${id} for a ${cls} profile`);
  }
  // A Nordic citizen's registration IS the DVV registration: both would be the same visit twice.
  if (cls === "NORDIC" && present.has("nordic_registration") && present.has("dvv_registration")) add("exclusive", "nordic_registration and dvv_registration together");

  // --- cited: each step card shows a footnoted sentence or says there is no source
  for (const d of dayStepsAll) {
    const step = state.steps[d.id];
    const quotes = [...step.citations, ...(step.claims ?? []).map((c) => c.citation)].filter((c) => !blank(c.quote));
    if (d.noSource) {
      if (quotes.length) add("cited", `${d.id}: marked 'no source' but has ${quotes.length} quotes`);
    } else if (!quotes.length) add("cited", `${d.id}: no quote and not marked 'no source'`);
    else if (!hasRef(d.whyNow) && !(d.wait && hasRef(d.wait))) add("cited", `${d.id}: card shows no footnote`);
    for (const c of step.claims ?? []) if (c.matchScore < 0.9) add("cited", `${d.id}: ${c.kind} claim matchScore ${c.matchScore}`);
  }

  // --- empty: no empty strings in steps, tips, bring
  for (const s of steps) for (const x of strings(s, s.id)) if (blank(x.value)) add("empty", x.path);
  state.tips.forEach((t, i) => strings(t, `tip[${i}]`).forEach((x) => blank(x.value) && add("empty", x.path)));
  for (const e of days) if (e.kind === "visit") for (const b of e.bring) if (blank(b.value)) add("empty", `bring on ${e.date}`);

  // --- format: address / hours / processing time, schedule dates
  for (const s of steps) {
    for (const c of s.claims ?? []) {
      if (c.kind === "address" && !looksLikeAddress(c.value)) add("format", `${s.id} address "${c.value}"`);
      if (c.kind === "hours" && !looksLikeHours(c.value)) add("format", `${s.id} hours "${c.value}"`);
      if (c.kind === "processing_time" && !looksLikeDuration(c.value)) add("format", `${s.id} processing_time "${c.value}"`);
    }
  }
  for (const [id, it] of Object.entries(items)) {
    for (const k of ["startDate", "readyDate", "doneDate"] as const) if (!realIsoDate(it[k])) add("format", `${id}.${k} "${it[k]}"`);
  }

  // --- shortcut: the tag only where the step itself gets the identity code >= 3 working days sooner
  const cmp = compareWithUsual(state, doc.ref);
  const bl = state.schedule?.baseline;
  for (const sc of cmp?.shortcuts ?? []) {
    const ours = items.personal_identity_code?.readyDate;
    const usual = bl?.readyDates.personal_identity_code;
    const gain = ours && usual && usual > ours ? wdays(ours, usual) : 0;
    if (gain < MIN_GAIN_WORKING_DAYS) add("shortcut", `${sc.id}: identity code gain ${gain} working days`);
  }
  const sp = doc.letter?.paras.find((p) => p.key === "shortcut");
  if (sp && !/\b([3-9]|\d{2,}) working days\b/.test(segText(sp.segs))) add("shortcut", `letter: "${segText(sp.segs)}"`);

  // --- permit: a non-EU residence permit starts before arrival
  const arrival = profile.arrivalDate?.slice(0, 10);
  for (const s of real) {
    const it = items[s.id];
    if (s.id === "residence_permit" && cls === "NON_EU") {
      if (!s.beforeArrival) add("permit", "residence_permit not flagged beforeArrival");
      if (it && arrival && state.schedule && arrival > state.schedule.schedule.startDate && it.startDate >= arrival)
        add("permit", `residence_permit starts ${it.startDate}, arrival ${arrival}`);
    } else if (s.beforeArrival && cls !== "NON_EU") add("permit", `${s.id} before arrival for a ${cls} profile`);
  }

  // --- bring: no item meant for another class (visit cards and the panel's document list)
  const wrongFor = (v: string) => CLASS_TEXT.find((x) => !x.classes.includes(cls) && x.re.test(v));
  for (const s of real) {
    for (const d of stepFacts(s).documents) if (wrongFor(d.value)) add("bring", `${s.id}: "${d.value}"`);
  }

  // --- skip: "If you skip it" carries a consequence, never a prerequisite
  for (const d of dayStepsAll) {
    const t = segText(d.whyNow);
    const m = t.match(/^If you skip it: (.*)$/);
    if (m && (!isConsequence(m[1]) || /\b(is|are) (required|needed|mandatory)\b|\bmust (have|be|first)\b/i.test(m[1]))) add("skip", `${d.id}: "${t}"`);
  }

  // --- visits: the count in the closing line = visit cards = distinct in-person visits
  const visitCards = days.filter((e) => e.kind === "visit").length;
  const distinct = countVisits(steps.filter((s) => s.necessity !== "optional"), items);
  const sumVisits = state.summary?.inPersonVisits;
  if (visitCards !== distinct || (sumVisits !== undefined && sumVisits !== distinct))
    add("visits", `cards ${visitCards}, summary ${sumVisits}, distinct ${distinct}`);

  // --- scheduled: steps => a schedule and a real date in the headline
  const headline = doc.letter ? segText(doc.letter.headline) : "";
  if (real.length > 0) {
    if (!state.schedule || !Object.keys(items).length) add("scheduled", "no schedule");
    else if (!state.schedule.criticalPath.stepIds.length) add("scheduled", "empty critical path");
    if (!DATE_IN_TEXT.test(headline)) add("scheduled", `headline without a date: "${headline}"`);
  }

  // --- blank: nothing rendered empty or half-filled
  const shown: { where: string; text: string }[] = [];
  if (doc.letter) {
    shown.push({ where: "headline", text: headline });
    doc.letter.paras.forEach((p) => shown.push({ where: `para ${p.key}`, text: segText(p.segs) }));
    doc.letter.insights.forEach((p) => shown.push({ where: `insight ${p.key}`, text: segText(p.segs) }));
  }
  for (const e of days as DayEntry[]) {
    if ((e.kind === "visit" || e.kind === "online") && !e.steps.length) shown.push({ where: `${e.kind} ${e.date}`, text: "" });
    if (e.kind === "visit") {
      e.bring.forEach((b) => shown.push({ where: `bring ${e.date}`, text: b.value }));
      e.tips.forEach((t) => shown.push({ where: `tip ${e.date}`, text: t.text }));
      if (e.address) shown.push({ where: `address ${e.date}`, text: e.address.value });
    }
    if (e.kind === "reminder") shown.push({ where: `reminder ${e.date}`, text: e.title });
    for (const d of entrySteps(e)) {
      shown.push({ where: `${d.id} title`, text: d.title });
      if (d.whyNow.length) shown.push({ where: `${d.id} why`, text: segText(d.whyNow) });
      if (d.wait) shown.push({ where: `${d.id} wait`, text: segText(d.wait) });
    }
  }
  (state.profile?.partnerNotes ?? []).forEach((n) => shown.push({ where: "partner note", text: n }));
  for (const p of profileParts(profile, state.profile?.assumptions ?? [], state.text)) if ("field" in p) shown.push({ where: `profile ${p.field}`, text: p.value });
  for (const x of shown) {
    if (blank(x.text)) add("blank", `${x.where} is empty`);
    else if (BROKEN.test(x.text)) add("blank", `${x.where}: "${x.text}"`);
  }

  // --- assumptions: each is a known kind, shown as a short label
  const assumptions = state.profile?.assumptions ?? [];
  assumptions.forEach((a) => {
    if (!assumptionKind(a)) add("assumptions", `not a code label: "${a}"`);
  });
  for (const p of profileParts(profile, assumptions, state.text)) {
    if (!("field" in p) || !p.field.startsWith("assumption:")) continue;
    if (p.value.split(/\s+/).length > 6) add("assumptions", `long label "${p.value}"`);
    // A bare kind word says nothing: "Assumed: city" must name the city, "arrival date" must name the day.
    if (/^(city|arrival date|arrival|citizenship|purpose|date)$/i.test(p.value.trim())) add("assumptions", `bare label "${p.value}"`);
  }

  // --- optional: decided by the profile, and kept out of the plan's dates, path and counts
  const short = shortStudyStay(profile);
  for (const s of real) {
    const want = short && OPTIONAL_FOR_SHORT_STUDY.has(s.id) && !verifiedMust(s);
    if (want && s.necessity !== "optional" && !steps.some((r) => r.necessity !== "optional" && r.requires.includes(s.id)))
      add("optional", `${s.id} should be optional for a short study stay`);
    if (!short && s.necessity === "optional") add("optional", `${s.id} optional for a profile that is not a short study stay`);
  }
  const optionalIds = new Set(real.filter((s) => s.necessity === "optional").map((s) => s.id));
  const shownOptional = new Set(buildOptional(state, doc.ref).map((d) => d.id));
  for (const id of optionalIds) {
    if (state.schedule?.criticalPath.stepIds.includes(id)) add("optional", `${id} on the critical path`);
    if (dayStepsAll.some((d) => d.id === id)) add("optional", `${id} in the day by day plan`);
    if (!shownOptional.has(id)) add("optional", `${id} missing from the optional section`);
  }
  const requiredDone = real.filter((s) => !optionalIds.has(s.id) && items[s.id]).map((s) => items[s.id].doneDate).sort().pop();
  const path = state.schedule?.criticalPath.stepIds ?? [];
  const pathEnd = path.length ? items[path[path.length - 1]]?.doneDate : undefined;
  if (requiredDone && pathEnd && pathEnd !== requiredDone) add("optional", `finish ${pathEnd}, last required step done ${requiredDone}`);
  if (state.summary && state.summary.steps !== real.length - optionalIds.size) add("optional", `summary counts ${state.summary.steps} steps, required ${real.length - optionalIds.size}`);

  // --- waits: a processing time names this step's own result (or none), never only another step's
  for (const s of steps) {
    const provides = (s.claims ?? []).filter((c) => c.kind === "provides").map((c) => c.value);
    for (const c of s.claims ?? []) {
      if (c.kind === "processing_time" && namesOnlyOtherOutput(s.id, provides, `${c.value} ${c.citation.quote}`)) add("waits", `${s.id}: "${c.citation.quote}"`);
    }
  }

  // --- venue: shown on the card of its step; a date only for the arrival month or the next
  const am = arrival ? Number(arrival.slice(5, 7)) : undefined;
  for (const s of real) {
    if (!(s.claims ?? []).some((c) => c.kind === "venue") || optionalIds.has(s.id) || !items[s.id]) continue;
    const card = days.find((e) => e.kind === "visit" && e.steps.some((d) => d.id === s.id));
    if (card?.kind !== "visit") continue; // not an in-person visit: nothing to put it on
    if (!card.venue) add("venue", `${s.id}: venue claim not shown`);
    const m = card.venue?.when ? venueMonth(card.venue.when.value) : undefined;
    if (m !== undefined && (am === undefined || (m !== am && m !== (am % 12) + 1))) add("venue", `${s.id}: event date ${card.venue!.when!.value} for arrival ${arrival}`);
  }

  return out;
}

/** For the table: the citations a run shows, to sanity-check that quotes exist at all. */
export function allCitations(state: RunState): Citation[] {
  return Object.values(state.steps).flatMap((s) => [...s.citations, ...(s.claims ?? []).map((c) => c.citation)]);
}
