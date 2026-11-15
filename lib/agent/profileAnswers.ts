// The pre-run clarify step: when the sentence leaves citizenship or purpose open, the first screen asks with
// chips instead of guessing. The answers travel inside the sentence as one fixed clause ("Citizenship: Nordic.
// Purpose: work and study."), so they survive re-runs and corrections, and parseProfile applies them over
// whatever the LLM or the deterministic parser inferred: a chip answer always wins. Pure; browser-safe.
import type { Profile } from "../types";
import { CITIZENSHIP_ASSUMED, PURPOSE_ASSUMED, has, parseProfileDeterministic, type ProfileResult } from "./parseProfileDeterministic";
import { EEA_TERMS, EU_TERMS, FINNISH_CITIZEN_TERMS, NON_EU_TERMS, NORDIC_TERMS } from "./profileLexicon";
import { isDemoSentence } from "../demo/sentences";

export type ClarifyField = "citizenship" | "purpose";
export type CitizenshipAnswer = { kind: "EU" | "NORDIC" | "NON_EU" } | { kind: "country"; country: string };
export type PurposeAnswer = "work" | "study" | "work_study" | "family";
export type Answers = { citizenship?: CitizenshipAnswer; purpose?: PurposeAnswer };

const CITIZENSHIP_WORD: Record<"EU" | "NORDIC" | "NON_EU", string> = { EU: "EU / EEA / Swiss", NORDIC: "Nordic", NON_EU: "other (non-EU)" };
const PURPOSE_WORD: Record<PurposeAnswer, string> = { work: "work", study: "study", work_study: "work and study", family: "family" };
const PURPOSES: Record<PurposeAnswer, Profile["purpose"]> = { work: ["work"], study: ["study"], work_study: ["work", "study"], family: ["family"] };

/** A typed country, trimmed to something that fits the clause (no full stop: it ends the clause). */
const cleanCountry = (s: string) => s.replace(/[.\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/** The clause appended to the sentence, e.g. "Citizenship: Brazil. Purpose: work and study." Empty when nothing is answered. */
export function answerClause(a: Answers): string {
  const out: string[] = [];
  if (a.citizenship) {
    const v = a.citizenship.kind === "country" ? cleanCountry(a.citizenship.country) : CITIZENSHIP_WORD[a.citizenship.kind];
    if (v) out.push(`Citizenship: ${v}.`);
  }
  if (a.purpose) out.push(`Purpose: ${PURPOSE_WORD[a.purpose]}.`);
  return out.join(" ");
}

const last = (text: string, re: RegExp) => [...text.matchAll(re)].pop()?.[1]?.trim();

/** The answers stated by the clause in this sentence (the last one wins). */
export function statedAnswers(text: string): Answers {
  const a: Answers = {};
  const c = last(text, /(?:^|[\s.])Citizenship: ([^.\n]{1,60})\./g);
  if (c) {
    const kind = (Object.keys(CITIZENSHIP_WORD) as (keyof typeof CITIZENSHIP_WORD)[]).find((k) => CITIZENSHIP_WORD[k].toLowerCase() === c.toLowerCase());
    a.citizenship = kind ? { kind } : { kind: "country", country: c };
  }
  const p = last(text, /(?:^|[\s.])Purpose: (work and study|work|study|family)\./gi)?.toLowerCase();
  if (p) a.purpose = (Object.keys(PURPOSE_WORD) as PurposeAnswer[]).find((k) => PURPOSE_WORD[k] === p);
  return a;
}

/** The citizenship group an answer means; a typed country the word lists don't know -> undefined (the parsers decide). */
export function citizenshipGroup(a: CitizenshipAnswer): Profile["citizenship"] | undefined {
  if (a.kind !== "country") return a.kind;
  const t = a.country;
  if (NORDIC_TERMS.some((k) => has(t, k)) || FINNISH_CITIZEN_TERMS.some((k) => has(t, k)) || /^finn(ish|land)$/i.test(t)) return "NORDIC";
  if (EU_TERMS.some((k) => has(t, k)) || EEA_TERMS.some((k) => has(t, k))) return "EU";
  if (NON_EU_TERMS.some((k) => has(t, k))) return "NON_EU";
  return undefined;
}

/** Apply the sentence's chip answers over a parse result (LLM or deterministic): the person's answer wins. */
export function applyAnswers(r: ProfileResult, text: string): ProfileResult {
  if (!r.ok) return r;
  const a = statedAnswers(text);
  const group = a.citizenship ? citizenshipGroup(a.citizenship) : undefined;
  const purpose = a.purpose ? PURPOSES[a.purpose] : undefined;
  if (!group && !purpose) return r;
  const patch = (p: Profile): Profile => ({
    ...p,
    ...(group ? { citizenship: group } : {}),
    ...(purpose ? { purpose: [...purpose], ...(purpose.includes("family") ? { hasFamily: true } : {}) } : {}),
  });
  const profile = patch(r.profile);
  const people = r.people.map((p, i) => (i === 0 ? profile : p));
  const assumptions = r.assumptions.filter(
    // The chip label "EU / EEA / Swiss" would otherwise read as a stated Swiss citizenship ("swiss": treated as EU).
    (x) => !(group && (/^Citizenship not stated/.test(x) || /^"[^"]+": treated as EU/.test(x))) && !(purpose && /^Purpose not stated/.test(x)),
  );
  return { ...r, profile, people, assumptions };
}

/** The questions to ask before running: citizenship and/or purpose, when the sentence leaves them open. */
export function clarifyFields(text: string, today?: string): ClarifyField[] {
  const t = text.trim();
  if (!t || isDemoSentence(t)) return [];
  const r = parseProfileDeterministic(t, today);
  if (!r.ok) return []; // out of scope: the run says so; no questions
  const a = statedAnswers(t);
  const out: ClarifyField[] = [];
  if (r.assumptions.includes(CITIZENSHIP_ASSUMED) && !a.citizenship) out.push("citizenship");
  if (r.assumptions.includes(PURPOSE_ASSUMED) && !a.purpose) out.push("purpose");
  return out;
}

/** What "Plan my move" does: ask (the open questions not answered yet), or run with this text. */
export function submitDecision(draft: string, answers: Answers, today?: string): { kind: "ask"; open: ClarifyField[] } | { kind: "run"; text: string } {
  const t = draft.trim();
  const fields = clarifyFields(t, today);
  const open = fields.filter((f) => !answers[f] || (f === "citizenship" && answers.citizenship?.kind === "country" && !cleanCountry(answers.citizenship.country)));
  if (open.length) return { kind: "ask", open };
  const clause = answerClause({ ...(fields.includes("citizenship") ? { citizenship: answers.citizenship } : {}), ...(fields.includes("purpose") ? { purpose: answers.purpose } : {}) });
  return { kind: "run", text: clause ? `${t.replace(/([^.!?])$/, "$1.")} ${clause}` : t };
}

/** The profile so far, for the sentence shown above the questions. City and date fall back to the usual defaults. */
export function profileSoFar(text: string, today?: string): { city: string; cityAssumed: boolean; arrivalDate?: string } | null {
  const r = parseProfileDeterministic(text.trim(), today);
  if (!r.ok) return null;
  return { city: r.profile.city, cityAssumed: r.assumptions.some((x) => /^No (Finnish )?city named/.test(x)), arrivalDate: r.profile.arrivalDate };
}
