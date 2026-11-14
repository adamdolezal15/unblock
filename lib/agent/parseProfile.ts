// Pipeline step 1: text -> Profile. LLM first (parseProfileLlm, cached through lib/llm); the deterministic
// parser below is the fallback when there is no key, the cache misses in read mode, or the LLM fails.
// Everything not stated in the text and filled by a default goes into `assumptions`.
import { resolveProviderName } from "../llm";
import type { Profile } from "../types";
import { parseProfileLlm } from "./parseProfileLlm";
import { semesterAssumption, semesterStart } from "./semester";
import {
  EEA_TERMS, EU_TERMS, FINLAND_TERMS, FINNISH_CITIES, FINNISH_CITIZEN_TERMS, MONTHS, MOVE_TERMS, NON_EU_TERMS,
  NORDIC_TERMS, PURPOSE_TERMS, TEMPORARY_PROTECTION_TERMS, UNIVERSITY_CITY,
} from "./profileLexicon";

export type ProfileResult =
  | {
      ok: true;
      profile: Profile;
      assumptions: string[];
      /** Everyone moving, main applicant first (equal to `profile`); the rest are spouse/children with their own citizenship. */
      people: Profile[];
      source: "llm" | "deterministic";
    }
  | { ok: false; outOfScope: string; source: "llm" | "deterministic" };

export const SCOPE_MESSAGE =
  "Unblock plans the official steps for moving to a Finnish city (registration, permits, tax card, bank, Kela). " +
  'Tell me where in Finland you are moving and why, e.g. "Czech citizen moving to Helsinki on 1 December for a job".';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary match that works for ä/ö/å. A trailing "*" makes the term a stem. */
export function has(text: string, term: string): boolean {
  const stem = term.endsWith("*");
  const body = escapeRe(stem ? term.slice(0, -1) : term).replace(/\s+/g, "\\s+");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}${stem ? "" : "(?![\\p{L}\\p{N}])"}`, "iu");
  return re.test(text);
}

function firstMatch(text: string, terms: readonly string[]): string | undefined {
  return terms.find((t) => has(text, t));
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function addDays(date: string, n: number): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Absolute or relative arrival date, resolved against `today` (YYYY-MM-DD). Past dates roll to next year. */
export function parseDate(text: string, today: string): string | undefined {
  const t = text.toLowerCase();
  const isoM = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (isoM) return iso(+isoM[1], +isoM[2], +isoM[3]);

  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  if (/\bnext week\b/.test(t)) return addDays(today, 7);
  if (/\bnext month\b/.test(t)) return addDays(today, 30);
  const inN = t.match(/\bin (\d+|a|one|two|three|four) (day|week|month)s?\b/);
  if (inN) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
    const n = words[inN[1]] ?? Number(inN[1]);
    return addDays(today, n * (inN[2] === "day" ? 1 : inN[2] === "week" ? 7 : 30));
  }

  const monthAlt = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(?:of\\s+)?(${monthAlt})\\b\\.?(?:\\s+(20\\d\\d))?`));
  const md = t.match(new RegExp(`\\b(${monthAlt})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?`));
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  if (dm) [day, month, year] = [+dm[1], MONTHS[dm[2]], dm[3] ? +dm[3] : undefined];
  else if (md) [day, month, year] = [+md[2], MONTHS[md[1]], md[3] ? +md[3] : undefined];
  if (!dm && !md) {
    // "in January" / "in Jan 2027": the 1st of that month
    const mo = t.match(new RegExp(`\\b(?:in|from|starting)\\s+(${monthAlt})\\b\\.?(?:\\s+(20\\d\\d))?`));
    if (mo) [day, month, year] = [1, MONTHS[mo[1]], mo[2] ? +mo[2] : undefined];
  }
  if (!day || !month || day > 31) return undefined;

  const ty = Number(today.slice(0, 4));
  let candidate = iso(year ?? ty, month, day);
  if (!year && candidate < today) candidate = iso(ty + 1, month, day);
  return candidate;
}

/** Monthly gross salary in EUR. "45k a year" / "€45,000 per year" are divided by 12. */
export function parseSalary(text: string): number | undefined {
  const t = text.toLowerCase().replace(/(\d)[,\s](\d{3})\b/g, "$1$2");
  const m =
    t.match(/(?:€|\beur\b)\s*(\d+(?:\.\d+)?)\s*(k\b)?([^.;]{0,25})/) ??
    t.match(/\b(\d+(?:\.\d+)?)\s*(k)?\s*(?:€|eur\b|euros?\b)([^.;]{0,25})/) ??
    t.match(/\bsalary(?:\s+of|\s+is|:)?\s*(\d+(?:\.\d+)?)\s*(k\b)?([^.;]{0,25})/);
  if (!m) return undefined;
  let amount = Number(m[1]) * (m[2] ? 1000 : 1);
  const tail = m[3] ?? "";
  const yearly = /\b(year|yearly|annual|annually|per annum|p\.a\.)\b/.test(tail) || (!/\bmonth/.test(tail) && amount >= 15000);
  if (yearly) amount /= 12;
  return Math.round(amount);
}

function parseStayMonths(text: string): number | undefined {
  const t = text.toLowerCase();
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const m = t.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ]months?\b/);
  if (m) return words[m[1]] ?? Number(m[1]);
  if (/\b(one|a|1) semester\b/.test(t)) return 5;
  return undefined;
}

/** "I already have a bank account / personal identity code / residence permit" -> step ids. */
export function parseAlreadyDone(text: string): string[] {
  const t = text.toLowerCase();
  const have = String.raw`(?:already\s+(?:have|got|hold|opened|registered)|i\s+(?:have|got)\s+(?:a|an|my)|got\s+(?:a|an|my))`;
  const out: string[] = [];
  const add = (id: string, thing: string) => {
    if (new RegExp(`${have}[^.;]{0,40}${thing}`).test(t) && !out.includes(id)) out.push(id);
  };
  add("bank_account", String.raw`bank\s+account`);
  add("personal_identity_code", String.raw`(?:personal\s+identity\s+code|henkilötunnus|finnish\s+id\s+code|hetu)`);
  add("residence_permit", String.raw`residence\s+permit(?!\s+card\s+yet)`);
  return out;
}

function helsinkiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki" }).format(new Date());
}

export async function parseProfile(text: string, today: string = helsinkiToday()): Promise<ProfileResult> {
  if (resolveProviderName() === "anthropic") {
    try {
      const r = await parseProfileLlm(text.trim(), today);
      return { ...r, source: "llm" };
    } catch (e) {
      console.warn(`[parseProfile] LLM parse failed (${e instanceof Error ? e.message.slice(0, 120) : "error"}); using the deterministic parser`);
    }
  }
  return parseProfileDeterministic(text, today);
}

/** Word lists and regexes only. English input; no typos, no partner with a different citizenship. */
export function parseProfileDeterministic(text: string, today: string = helsinkiToday()): ProfileResult {
  const assumptions: string[] = [];
  const t = text.trim();

  // Scope: a Finnish city or university, or Finland plus some moving/admin context.
  const cityKey = Object.keys(FINNISH_CITIES).find((k) => has(t, k));
  const uniKey = Object.keys(UNIVERSITY_CITY).find((k) => has(t, k));
  const mentionsFinland = FINLAND_TERMS.some((k) => has(t, k));
  const moving = MOVE_TERMS.some((k) => has(t, k));
  if (!cityKey && !uniKey && !(mentionsFinland && moving)) return { ok: false, outOfScope: SCOPE_MESSAGE, source: "deterministic" };

  let city: string;
  if (cityKey) city = FINNISH_CITIES[cityKey];
  else if (uniKey) {
    city = UNIVERSITY_CITY[uniKey];
    assumptions.push(`No city named; assumed ${city} from the university mentioned.`);
  } else {
    city = "Helsinki";
    assumptions.push("No Finnish city named; assumed Helsinki.");
  }

  let citizenship: Profile["citizenship"];
  const nordic = firstMatch(t, NORDIC_TERMS);
  const eu = firstMatch(t, EU_TERMS);
  const eea = firstMatch(t, EEA_TERMS);
  const nonEu = firstMatch(t, NON_EU_TERMS);
  const finnish = FINNISH_CITIZEN_TERMS.some((k) => has(t, k));
  if (nordic) citizenship = "NORDIC";
  else if (eu) citizenship = "EU";
  else if (eea) {
    citizenship = "EU";
    assumptions.push(`"${eea}": treated as EU (EEA/Swiss citizens register like EU citizens).`);
  } else if (nonEu) citizenship = "NON_EU";
  else if (finnish) {
    citizenship = "NORDIC";
    assumptions.push("Finnish citizen: no right-of-residence registration; treated like the Nordic path.");
  } else {
    citizenship = "NON_EU";
    assumptions.push("Citizenship not stated; assumed non-EU (the stricter path). Add your nationality to refine.");
  }

  const purpose = (Object.keys(PURPOSE_TERMS) as (keyof typeof PURPOSE_TERMS)[]).filter((p) =>
    PURPOSE_TERMS[p].some((k) => has(t, k)),
  );
  if (uniKey && !purpose.includes("study")) purpose.push("study");
  const hasFamily = purpose.includes("family");
  if (purpose.length === 0) {
    purpose.push("work");
    assumptions.push("Purpose not stated; assumed work.");
  }
  if (purpose.includes("study") && /\b(phd|doctoral)\b/i.test(t) && !purpose.includes("work")) {
    assumptions.push("PhD treated as study; many Finnish doctoral positions are employment, mention it if yours is.");
  }

  const temporaryProtection = TEMPORARY_PROTECTION_TERMS.some((k) => has(t, k));

  let arrivalDate = parseDate(t, today);
  const term = arrivalDate ? undefined : semesterStart(t, today);
  if (term) {
    arrivalDate = term;
    assumptions.push(semesterAssumption(term));
  }
  if (!arrivalDate) assumptions.push("Arrival date not stated; planning from today.");
  const monthlySalaryEur = parseSalary(t);
  const stayMonths = parseStayMonths(t);

  const alreadyDone = parseAlreadyDone(t);
  const profile: Profile = {
    citizenship,
    purpose,
    city,
    ...(arrivalDate ? { arrivalDate } : {}),
    ...(monthlySalaryEur ? { monthlySalaryEur } : {}),
    ...(hasFamily ? { hasFamily } : {}),
    ...(temporaryProtection ? { temporaryProtection } : {}),
    ...(stayMonths ? { stayMonths } : {}),
    ...(alreadyDone.length ? { alreadyDone } : {}),
  };
  return { ok: true, profile, assumptions, people: [profile], source: "deterministic" };
}
