// "Ready to send" drafts, the pure part (safe for the browser): which drafts a run can offer, the facts each
// one may use, the checks every model sentence must pass, and the final text with footnotes and sources.
// Generation (the cached LLM call) is in lib/agent/drafts.ts. No fact here is new: F-facts are verified claims
// (or conflict quotes) of the run, P-facts are the person's own profile and plan dates.
import type { Conflict, Profile, Step, Trust, VerifiedClaim } from "../types";
import { venueMonth } from "./valueFormats";

export type DraftKind = "employer" | "bank" | "booking";

/** What the browser sends to /api/drafts: the run, cut down to what drafts read. */
export type DraftSource = {
  profile: Profile;
  steps: Step[];
  conflicts: Conflict[];
  /** Planned start date per step id (the schedule). */
  dates: Record<string, string>;
  /** Shared visit id per step (schedule), so a merged visit gets one booking note. */
  visits?: Record<string, string>;
};

export type DraftFact = {
  id: string;
  text: string;
  /** Verified page sentence behind an F-fact. P-facts (profile, plan) have none. */
  quote?: string;
  url?: string;
  trust?: Trust;
};

export type DraftOffer = {
  /** "employer" | "bank" | "booking:<stepId>" */
  id: string;
  kind: DraftKind;
  /** The step whose day card shows this draft. */
  stepId: string;
  /** Every step the draft covers (all members of a merged visit). */
  stepIds: string[];
  title: string;
  /** An email (Copy + Open in email) or a note (Copy only). */
  email: boolean;
};

export type DraftSentence = { text: string; refs: number[] };
export type DraftSourceRef = { n: number; url: string; quote: string; trust?: Trust };

export type Draft = {
  offerId: string;
  title: string;
  email: boolean;
  subject: string;
  /** The full text as it is copied / mailed: greeting, sentences with [n], sign-off, Sources list. */
  body: string;
  sentences: DraftSentence[];
  sources: DraftSourceRef[];
  /** "claude" when the model's sentences passed the checks, "template" when the plain fallback was used. */
  by: "claude" | "template";
  bookingUrl?: string;
};

const MONTHS = "January February March April May June July August September October November December".split(" ");
const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const EMPLOYMENT_DOC = /\bemploy(ment|er)\b|\bwork contract\b|\bcontract of employment\b/i;
const INCOME_DOC = /\bincome\b|\bsalary\b|\bwages?\b/i;
const REGISTRATIONS = ["dvv_registration", "eu_registration", "nordic_registration", "vero_identity_code", "residence_permit"];
const REGULATOR = /finanssivalvonta\.fi|fin-?fsa/i;

const usable = (s: Step | undefined): s is Step => !!s && !s.done && !s.milestone && s.necessity !== "optional";
const has = (s: Step, ...kinds: VerifiedClaim["kind"][]) => (s.claims ?? []).some((c) => kinds.includes(c.kind));
const byId = (src: DraftSource) => new Map(src.steps.map((s) => [s.id, s]));

/** Drafts this run can back with facts. A student without a job gets no employer email, and so on. */
/** At most this many drafts per run: employer email, then bank email, then booking notes by date. */
export const MAX_DRAFTS = 3;

/** Drafts this run can back with facts. A student without a job gets no employer email, and so on. */
export function draftOffers(src: DraftSource): DraftOffer[] {
  const steps = byId(src);
  const out: DraftOffer[] = [];
  const tax = steps.get("tax_card");
  const working = src.profile.purpose.includes("work");
  if (working && usable(tax) && has(tax, "cost_of_delay", "applies")) {
    out.push({ id: "employer", kind: "employer", stepId: "tax_card", stepIds: ["tax_card"], title: "Email to your employer", email: true });
  }
  const bank = steps.get("bank_account");
  if (bank && !bank.done && !bank.milestone && has(bank, "document", "processing_time", "requires")) {
    out.push({ id: "bank", kind: "bank", stepId: "bank_account", stepIds: ["bank_account"], title: "Email to the bank", email: true });
  }
  // One note per office visit (a merged visit is one), and only for visits a source says need booking.
  const visits = new Map<string, Step[]>();
  for (const s of src.steps) {
    if (!usable(s) || s.mode === "online" || !src.dates[s.id]) continue;
    const v = src.visits?.[s.id] ?? s.id;
    visits.set(v, [...(visits.get(v) ?? []), s]);
  }
  const notes = [...visits.values()]
    .filter((members) => members.some((m) => has(m, "booking_url")))
    .map((members) => {
      const date = members.map((m) => src.dates[m.id]).sort()[0];
      const lead = members.find((m) => has(m, "booking_url"))!;
      const title = members.length > 1 ? `Booking note: ${lead.authority} visit` : `Booking note: ${lead.title}`;
      return { date, offer: { id: `booking:${lead.id}`, kind: "booking" as const, stepId: lead.id, stepIds: members.map((m) => m.id), title, email: false } };
    })
    .sort((x, y) => x.date.localeCompare(y.date));
  out.push(...notes.map((n) => n.offer));
  return out.slice(0, MAX_DRAFTS);
}

/** The numbered facts one draft may use (F = verified source, P = profile / plan). Order is stable. */
export function draftFacts(src: DraftSource, offer: Pick<DraftOffer, "kind" | "stepId"> & { stepIds?: string[] }): DraftFact[] {
  const steps = byId(src);
  const facts: DraftFact[] = [];
  const seen = new Set<string>();
  const f = (c: { value?: string; citation: { quote: string; url: string; trust: Trust } }, text?: string) => {
    const t = (text ?? c.value ?? c.citation.quote).trim();
    const key = `${t}|${c.citation.url}`;
    if (!t || seen.has(key)) return;
    seen.add(key);
    facts.push({ id: `F${facts.filter((x) => x.id.startsWith("F")).length + 1}`, text: t, quote: c.citation.quote, url: c.citation.url, trust: c.citation.trust });
  };
  const p = (text: string) => !facts.some((x) => x.text === text) && facts.push({ id: `P${facts.filter((x) => x.id.startsWith("P")).length + 1}`, text });
  const claims = (id: string, ...kinds: VerifiedClaim["kind"][]) => (steps.get(id)?.claims ?? []).filter((c) => kinds.includes(c.kind));
  const prof = src.profile;
  const who = prof.citizenship === "EU" ? "an EU citizen" : prof.citizenship === "NORDIC" ? "a Nordic citizen" : "a non-EU citizen";
  if (prof.arrivalDate) p(`I arrive in ${prof.city} on ${longDate(prof.arrivalDate)}.`);
  const planned = (id: string, what: string) => src.dates[id] && p(`I plan ${what} on ${longDate(src.dates[id])}.`);

  if (offer.kind === "employer") {
    for (const c of claims("tax_card", "cost_of_delay")) f(c);
    for (const c of claims("tax_card", "processing_time")) f(c, `Tax card: ${c.value}`);
    for (const c of claims("tax_card", "document")) if (INCOME_DOC.test(c.value)) f(c, `For the tax card: ${c.value}`);
    for (const id of REGISTRATIONS) {
      const title = steps.get(id)?.title;
      for (const c of claims(id, "document")) if (title && EMPLOYMENT_DOC.test(c.value)) f(c, `Needed for "${title}": ${c.value}`);
    }
    planned("tax_card", "to get my Finnish tax card");
  } else if (offer.kind === "bank") {
    p(`I am ${who} moving to ${prof.city}.`);
    for (const c of claims("bank_account", "document")) f(c, `To open an account: ${c.value}`);
    for (const c of claims("bank_account", "processing_time")) f(c);
    for (const c of src.conflicts.filter((x) => x.stepId === "bank_account")) {
      for (const side of [c.a, c.b]) if (REGULATOR.test(side.url) || REGULATOR.test(side.quote)) f({ citation: side }, `FIN-FSA: "${side.quote}"`);
    }
    planned("bank_account", "to visit the bank");
  } else {
    const members = (offer.stepIds ?? [offer.stepId]).map((id) => steps.get(id)).filter((x): x is Step => !!x);
    if (members.length) p(`I am ${who}, moving to ${prof.city} for ${prof.purpose.join(" and ")}.`);
    if (members.length > 1) p(`In this one visit: ${members.map((m) => m.title).join("; ")}.`);
    for (const s of members) {
      for (const c of claims(s.id, "booking_url")) f(c, `How to book: ${c.value}`);
      for (const c of claims(s.id, "hours")) f(c, `Opening hours: ${c.value}`);
      for (const c of claims(s.id, "address")) f(c, `Where: ${c.value}`);
      // An event date for another intake is not this person's date (same rule as the day card).
      const am = prof.arrivalDate ? Number(prof.arrivalDate.slice(5, 7)) : undefined;
      for (const c of claims(s.id, "venue")) {
        const m = c.value.includes(":") ? venueMonth(c.value) : undefined;
        const fits = !c.value.includes(":") || (m !== undefined && am !== undefined && (m === am || m === (am % 12) + 1));
        if (fits) f(c, `Can be done at: ${c.value}`);
      }
      for (const c of claims(s.id, "document")) f(c, `Bring: ${c.value}`);
      for (const c of claims(s.id, "processing_time")) f(c, `How long it takes: ${c.value}`);
      planned(s.id, `to go (${s.authority})`);
    }
  }
  return facts;
}

/** The text sent to the model: the facts, one per line. */
export function factsBlock(facts: DraftFact[]): string {
  return facts.map((x) => `${x.id}: ${x.text}`).join("\n");
}

const PLACEHOLDER = /\[[A-Za-z][^\]\n]{0,40}\]/g;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const URL_RE = /https?:\/\/\S+|\bwww\.\S+|\b[\w-]+\.(fi|com|eu|org|net)\b(\/\S*)?/i;
const PHONE = /\+?\d[\d\s()-]{6,}\d/;

/**
 * True when every email, phone, url and number in `text` is written in `support` (the facts it cites).
 * Placeholders like [Your name] are allowed anywhere.
 */
export function supportedBy(text: string, support: string): boolean {
  const t = text.replace(PLACEHOLDER, " ");
  const s = support.toLowerCase();
  const literal = (re: RegExp) => {
    const m = t.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`));
    return (m ?? []).every((x) => s.includes(x.toLowerCase().replace(/[.,;:)]+$/, "")));
  };
  if (!literal(EMAIL) || !literal(URL_RE)) return false;
  const phones = t.match(new RegExp(PHONE.source, "g")) ?? [];
  const digits = (x: string) => x.replace(/\D/g, "");
  if (!phones.every((ph) => digits(s).includes(digits(ph)))) return false;
  const numbers = new Set(support.match(/\d+/g) ?? []);
  return (t.match(/\d+/g) ?? []).every((n) => numbers.has(n));
}

/**
 * Model sentences -> checked sentences. A sentence survives only if its ids exist and everything concrete in it
 * (numbers, emails, phones, urls) is in the facts it cites; a sentence citing nothing may state nothing concrete.
 * F-facts become footnotes [n], numbered by source url in order of first use.
 */
export function checkSentences(raw: { text: string; factIds: string[] }[], facts: DraftFact[]): { sentences: DraftSentence[]; sources: DraftSourceRef[] } {
  const byFact = new Map(facts.map((x) => [x.id, x]));
  const sources: DraftSourceRef[] = [];
  const sentences: DraftSentence[] = [];
  for (const r of raw) {
    const text = r.text.replace(/\s+/g, " ").replace(/\s*\[\d+\]/g, "").trim();
    if (!text) continue;
    const ids = [...new Set(r.factIds.map((x) => x.trim().toUpperCase()))];
    if (ids.some((id) => !byFact.has(id))) continue;
    const used = ids.map((id) => byFact.get(id)!);
    if (!supportedBy(text, used.map((x) => `${x.text} ${x.quote ?? ""}`).join(" "))) continue;
    const refs: number[] = [];
    for (const x of used) {
      if (!x.url) continue;
      let ref = sources.find((s) => s.url === x.url);
      if (!ref) {
        ref = { n: sources.length + 1, url: x.url, quote: x.quote ?? x.text, ...(x.trust ? { trust: x.trust } : {}) };
        sources.push(ref);
      }
      if (!refs.includes(ref.n)) refs.push(ref.n);
    }
    sentences.push({ text: /[.!?:"”]$/.test(text) ? text : `${text}.`, refs });
  }
  return { sentences, sources };
}

/** Plain fallback when the model's sentences don't pass: one sentence per fact, each with its footnote. */
export function templateSentences(kind: DraftKind, facts: DraftFact[]): { text: string; factIds: string[] }[] {
  const open: Record<DraftKind, string> = {
    employer: "I am writing ahead of my start with you.",
    bank: "I would like to book an appointment to open an account with basic banking services (peruspankkipalvelut).",
    booking: "Checklist for booking and for the visit.",
  };
  const ask: Record<DraftKind, string | null> = {
    employer: "Could you please send me the employment contract or an employment certificate for my registration?",
    bank: "Could you please let me know a suitable time for an appointment?",
    booking: null,
  };
  const facts1 = facts.map((x) => ({ text: x.text[0].toUpperCase() + x.text.slice(1), factIds: [x.id] }));
  return [{ text: open[kind], factIds: [] }, ...facts1, ...(ask[kind] ? [{ text: ask[kind]!, factIds: [] }] : [])];
}

const GREETING: Record<DraftKind, string | null> = { employer: "Hello [Employer name] team,", bank: "Hello [Bank name] customer service,", booking: null };

/** Final text: greeting, the sentences with [n], sign-off, and the source list (url + verified quote). */
export function renderDraft(offer: DraftOffer, subject: string, sentences: DraftSentence[], sources: DraftSourceRef[], by: Draft["by"], bookingUrl?: string): Draft {
  const lines: string[] = [];
  const greeting = GREETING[offer.kind];
  if (greeting) lines.push(greeting, "");
  for (const s of sentences) lines.push(`${s.text}${s.refs.length ? ` ${s.refs.map((n) => `[${n}]`).join("")}` : ""}`);
  if (offer.email) lines.push("", "Best regards,", "[Your name]", "[Your phone number]");
  if (sources.length) {
    lines.push("", "Sources:");
    for (const s of sources) lines.push(`[${s.n}] ${s.url}`);
  }
  return {
    offerId: offer.id,
    title: offer.title,
    email: offer.email,
    subject,
    body: lines.join("\n"),
    sentences,
    sources,
    by,
    ...(bookingUrl ? { bookingUrl } : {}),
  };
}

/** mailto: with subject and body (no recipient: the person adds it). */
export function mailtoHref(d: Pick<Draft, "subject" | "body">): string {
  return `mailto:?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}

/** A booking link stated by a verified claim of this step, if it is a URL. */
export function bookingLink(step: Step | undefined): string | undefined {
  const v = step?.claims?.find((c) => c.kind === "booking_url")?.value.trim();
  if (!v) return undefined;
  if (/^https?:\/\//.test(v)) return v;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v) ? `https://${v}` : undefined;
}

/** The subject the model wrote, if it passes the same checks; otherwise a code-written one. */
export function checkedSubject(subject: string, kind: DraftKind, facts: DraftFact[], title: string): string {
  const s = subject.replace(/\s+/g, " ").trim();
  if (s && s.length <= 120 && supportedBy(s, facts.map((x) => `${x.text} ${x.quote ?? ""}`).join(" "))) return s;
  return kind === "employer" ? "Tax card and employment certificate" : kind === "bank" ? "Appointment to open an account (basic banking services)" : title;
}
