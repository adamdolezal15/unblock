// Facts that sources state in sentences the extractor already read, turned into claims by plain pattern rules.
// No new LLM call and no new search (so the prompts and cache keys stay as they are), and no new fact:
// every claim here carries a sentence that was found in the text Exa returned (verifyCitations checks it again).
import type { ExaDoc, Profile, RawClaim, Step, VerifiedClaim } from "../types";
import { DERIVED_STEPS, MILESTONE_IDS, POLICE_IDENTIFICATION, STEP_IDS } from "./stepTaxonomy";
import { verifyCitations, type PageFetcher } from "./verifyCitations";

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z"“])|\n+/;

/** Every sentence of a document's highlights and text, with its url. */
export function sentencesOf(docs: ExaDoc[]): { url: string; trust: ExaDoc["trust"]; sentence: string }[] {
  const out: { url: string; trust: ExaDoc["trust"]; sentence: string }[] = [];
  for (const d of docs) {
    for (const block of [...d.highlights, ...(d.text ? [d.text] : [])]) {
      for (const raw of block.split(SENTENCE_SPLIT)) {
        const sentence = raw.replace(/^[-*#\s]+/, "").replace(/\s+/g, " ").trim();
        if (sentence.length >= 30 && sentence.length <= 400) out.push({ url: d.url, trust: d.trust, sentence });
      }
    }
  }
  return out;
}

const PERMIT = /\bresidence[- ]permit\b|\bpermit card\b|\bpermit decision\b/i;
const CODE = /personal identity (code|number)|\bidentity code\b/i;
const ISSUED = /\b(issued|receive[ds]?|given|granted|comes? with|together with|at the same time|indicated on|shown on|appears? on|automatically registered)\b/i;
const NOT_A_PROMISE = /\b(not|no|without|unless|failing|apply for|needs?|requires?|must|should|if you have a)\b|\?|\bcheck whether\b/i;

/**
 * Official sentences saying a residence permit comes with a personal identity code ("When you are granted a
 * residence permit, ... you will also be issued a personal identity code"). Verified `provides` claims for the
 * residence_permit step, at most two (different pages). Official / university pages only.
 */
export async function permitProvidesCode(
  docs: ExaDoc[],
  opts: { allowedDomains: readonly string[]; extraOfficial: string[]; fetchPage: PageFetcher },
): Promise<VerifiedClaim[]> {
  const seen = new Set<string>();
  const raw: RawClaim[] = [];
  for (const { url, trust, sentence } of sentencesOf(docs)) {
    if (trust === "community" || trust === "provider") continue;
    if (!PERMIT.test(sentence) || !CODE.test(sentence) || !ISSUED.test(sentence) || NOT_A_PROMISE.test(sentence)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    raw.push({ stepId: "residence_permit", kind: "provides", value: "personal_identity_code", url, quote: sentence });
    if (raw.length >= 2) break;
  }
  if (!raw.length) return [];
  const { verified } = await verifyCitations(raw, docs, {
    allowedDomains: opts.allowedDomains,
    extraOfficial: opts.extraOfficial,
    knownStepIds: STEP_IDS,
    milestoneIds: MILESTONE_IDS,
    fetchPage: opts.fetchPage,
  });
  return verified;
}

/** A step whose page says in so many words that it takes a personal visit. */
const IN_PERSON_FROM_TEXT: { stepId: string; pattern: RegExp }[] = [
  { stepId: "police_id_card", pattern: /\brequires? a personal visit (to|at) the police\b|processed only after you have been to the police station/i },
];

/** Verified `mode: in_person` claims for steps where a source says a visit is required. */
export async function inPersonFromText(
  stepId: string,
  docs: ExaDoc[],
  opts: { allowedDomains: readonly string[]; extraOfficial: string[]; fetchPage: PageFetcher },
): Promise<VerifiedClaim[]> {
  const rule = IN_PERSON_FROM_TEXT.find((r) => r.stepId === stepId);
  if (!rule) return [];
  const hit = sentencesOf(docs).find((s) => s.trust !== "community" && rule.pattern.test(s.sentence));
  if (!hit) return [];
  const { verified } = await verifyCitations([{ stepId, kind: "mode", value: "in_person", url: hit.url, quote: hit.sentence }], docs, {
    allowedDomains: opts.allowedDomains,
    extraOfficial: opts.extraOfficial,
    knownStepIds: STEP_IDS,
    fetchPage: opts.fetchPage,
  });
  return verified;
}

const EVENT = /\b(check-in event|orientation (?:week|day)|welcome (?:fair|week|event|day)|arrival (?:day|event))\b/i;
const DVV = /\bDVV\b|\bDigital and Population Data\b/i;
const AT_EVENT = /\b(present|register\w*|visit|attend\w*|services? available|do it|done)\b/i;
const MONTH_NAMES = "January|February|March|April|May|June|July|August|September|October|November|December";
const EVENT_WHEN_WHERE = new RegExp(String.raw`\bheld (?:at|in) (?:the )?(.{3,60}?) on (\d{1,2}(?:\s*(?:&|and|-|–)\s*\d{1,2})?\s+(?:${MONTH_NAMES}))`, "i");

/**
 * A university page saying DVV registration can be done at its check-in / orientation event ("DVV and Migri
 * will be present at the Check-In Event and you should register with them there"). Verified `venue` claims
 * for dvv_registration: the event, and its place and date when the same page states them. University pages only.
 */
export async function eventVenueClaims(
  docs: ExaDoc[],
  opts: { allowedDomains: readonly string[]; extraOfficial: string[]; fetchPage: PageFetcher },
): Promise<VerifiedClaim[]> {
  const sentences = sentencesOf(docs).filter((s) => s.trust === "university");
  const hit = sentences.find((s) => DVV.test(s.sentence) && EVENT.test(s.sentence) && AT_EVENT.test(s.sentence));
  if (!hit) return [];
  const name = hit.sentence.match(EVENT)![1];
  const raw: RawClaim[] = [{ stepId: "dvv_registration", kind: "venue", value: name, url: hit.url, quote: hit.sentence }];
  const sameEvent = new RegExp(`\\b${name.replace(/[-\s]+/g, "[-\\s]+")}\\b`, "i");
  const when = sentences.find((s) => sameEvent.test(s.sentence) && EVENT_WHEN_WHERE.test(s.sentence));
  if (when) {
    const m = when.sentence.match(EVENT_WHEN_WHERE)!;
    raw.push({ stepId: "dvv_registration", kind: "venue", value: `${name}: ${m[1].trim()}, ${m[2].trim()}`, url: when.url, quote: when.sentence });
  }
  const { verified } = await verifyCitations(raw, docs, {
    allowedDomains: opts.allowedDomains,
    extraOfficial: opts.extraOfficial,
    knownStepIds: STEP_IDS,
    fetchPage: opts.fetchPage,
  });
  return verified;
}

const POLICE = /\bpolice\b/i;
const IDENTIFY = /\b(identif\w*|verif\w*)\b/i;

/**
 * "Identity verification at a police station if your passport is not from the EEA": for a non-EEA passport this
 * is a visit of its own before the bank gives strong identification, not an item to bring. Takes the verified
 * `document` claims out of the steps' claims and returns, per step, a `requires` claim carrying the same quote.
 */
export function policeIdentificationClaims(
  profile: Pick<Profile, "citizenship">,
  runs: { id: string; verified: VerifiedClaim[] }[],
): { stepId: string; requires: VerifiedClaim }[] {
  if (profile.citizenship !== "NON_EU") return [];
  const out: { stepId: string; requires: VerifiedClaim }[] = [];
  for (const r of runs) {
    if (r.id !== "strong_identification" && r.id !== "bank_account") continue;
    // The quote itself must say it: a value like "card issued by the police" over a quote that never names
    // the police would give the derived step a citation that does not support it.
    const hit = r.verified.find((c) => c.kind === "document" && POLICE.test(c.citation.quote) && IDENTIFY.test(c.citation.quote));
    if (!hit) continue;
    r.verified = r.verified.filter((c) => c !== hit);
    out.push({ stepId: r.id, requires: { ...hit, kind: "requires", value: POLICE_IDENTIFICATION } });
  }
  return out;
}

/** The derived "identification at the police" step, from the requires claims above. */
export function policeIdentificationStep(requirers: { stepId: string; requires: VerifiedClaim }[]): Step | null {
  if (!requirers.length) return null;
  const d = DERIVED_STEPS.police_identification;
  const citations = requirers
    .map((r) => r.requires.citation)
    .filter((c, i, all) => all.findIndex((x) => x.url === c.url && x.quote === c.quote) === i);
  const claims: VerifiedClaim[] = requirers.map((r) => ({ ...r.requires, stepId: POLICE_IDENTIFICATION, kind: "mode", value: "in_person" }));
  return {
    id: POLICE_IDENTIFICATION,
    title: d.label,
    authority: d.authority,
    mode: "in_person",
    requires: [],
    derived: true,
    citations,
    claims,
    confirmation: { by: "required_by", stepIds: requirers.map((r) => r.stepId), citations },
  };
}

const CITY_NAMES = ["Helsinki", "Espoo", "Vantaa", "Tampere", "Oulu", "Turku", "Jyväskylä", "Kuopio", "Lahti", "Rovaniemi", "Vaasa", "Joensuu"];

/**
 * Addresses and opening hours for the person's city. When some are about that city (its name or its municipal
 * domain in the quote / url), keep only those; otherwise drop the ones that name a different Finnish city.
 */
export function localVisitClaims(claims: VerifiedClaim[], city: string, cityDomain?: string): VerifiedClaim[] {
  const mentions = (c: VerifiedClaim, name: string) => new RegExp(`\\b${name}\\b`, "i").test(`${c.value} ${c.citation.quote}`);
  const local = (c: VerifiedClaim) => mentions(c, city) || (!!cityDomain && c.citation.url.includes(cityDomain));
  const otherCity = (c: VerifiedClaim) => CITY_NAMES.some((n) => n.toLowerCase() !== city.toLowerCase() && mentions(c, n));
  const drop = new Set<VerifiedClaim>();
  for (const kind of ["address", "hours"] as const) {
    const group = claims.filter((c) => c.kind === kind);
    const keep = group.some(local) ? group.filter(local) : group.filter((c) => !otherCity(c));
    for (const c of group) if (!keep.includes(c)) drop.add(c);
  }
  return claims.filter((c) => !drop.has(c));
}
