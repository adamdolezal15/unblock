// Pipeline step 3 (SPEC F2, layer "lived experience"). For the critical node and every in-person step:
//   community searches (no domain filter, official domains excluded, last ~2 years) -> extract tips via
//   lib/llm -> verifyCitations against the text Exa returned -> Tip[].
// Trust comes from the URL (trustOf): university guides are "university", forums and blogs "community".
// waitDays is parsed from the VERIFIED quote (estimates.parseWaitDays), never taken from the extractor.
import { cityDomains } from "../exa/domains";
import { getPages, searchCommunity } from "../exa/search";
import { buildGraph, criticalNode, helsinkiDate } from "../graph";
import { extract } from "../llm";
import { extractTipsContext, extractTipsTask, TipExtraction } from "../prompts/extractTips";
import type { CommunityTip, DroppedClaim, ExaDoc, Profile, RawClaim, Step, Tip } from "../types";
import { mergeDocs } from "./docs";
import { parseWaitDays } from "./estimates";
import { STEP_IDS, STEP_TAXONOMY } from "./stepTaxonomy";
import { createPageFetcher, verifyCitations, type PageFetcher } from "./verifyCitations";

export type TipReport = { stepId: string; ms: number; sources: number; extracted: number; verified: number; error?: string };

export type FindTipsResult = {
  tips: Tip[];
  /** stepId -> tips, also copied onto the steps' `communityTips` by attachTips(). */
  byStep: Record<string, Tip[]>;
  dropped: DroppedClaim[];
  reports: TipReport[];
  /** Every community document read, so tip quotes can be re-checked independently. */
  sources: ExaDoc[];
};

export type FindTipsOptions = {
  onProgress?: (message: string) => void;
  /** YYYY-MM-DD; anchors the publication-date window. Defaults to today in Helsinki. */
  today?: string;
};

/**
 * Earliest publication date searched: 1 January two years before `today`. Year granularity keeps the
 * Exa request (and so the cache key) stable for a whole year; the window is 2–3 years.
 */
export function communityWindowStart(today: string): string {
  return `${Number(today.slice(0, 4)) - 2}-01-01`;
}

const MAX_TIPS_PER_STEP = 6;
const FULL_TEXT_PAGES = 3;
const FULL_TEXT_CHARS = 12_000;

/** Steps that get a community search: the critical node and every in-person step (never milestones). */
export function tipTargets(steps: Step[]): Step[] {
  const crit = criticalNode(buildGraph(steps));
  return steps.filter((s) => !s.milestone && (s.id === crit || s.mode === "in_person"));
}

function labelOf(step: Step): string {
  return STEP_TAXONOMY.find((d) => d.id === step.id)?.label ?? step.title;
}

/** Two lived-experience searches per step: waiting / appointments, and tricks / what people forgot. */
function tipQueries(step: Step, profile: Profile): { query: string; objective: string }[] {
  const label = labelOf(step);
  const where = `${profile.city}, Finland`;
  return [
    {
      query: `How many days or weeks did you wait for a ${step.authority} appointment for ${label} in ${profile.city}, and how long until it was done?`,
      objective: `Forum posts, Reddit threads, blogs and university guides from people who did "${label}" (${step.authority}) in ${where}: how long they waited for an appointment or for the result, and appointment availability.`,
    },
    {
      query: `${step.authority} ${label} ${where} tips, what to bring, what I forgot, problems`,
      objective: `First-hand experiences and newcomer guides about "${label}" (${step.authority}) in ${where}: practical tricks, documents people forgot or were unexpectedly asked for, and things that went wrong.`,
    },
  ];
}

function dedupeDocs(docs: ExaDoc[]): ExaDoc[] {
  const seen = new Set<string>();
  return docs.filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)));
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

async function tipsForStep(
  step: Step,
  profile: Profile,
  startPublishedDate: string,
  fetchPage: PageFetcher,
  onProgress: (m: string) => void,
): Promise<{ tips: Tip[]; dropped: DroppedClaim[]; docs: ExaDoc[]; report: TipReport }> {
  const t0 = Date.now();
  const label = labelOf(step);
  onProgress(`searching community sources: ${label}`);
  const queries = tipQueries(step, profile);
  const searches = await Promise.allSettled(
    queries.map((q) => searchCommunity({ ...q, city: profile.city, startPublishedDate })),
  );
  let docs = dedupeDocs(searches.flatMap((s) => (s.status === "fulfilled" ? s.value.docs : [])));
  // Highlights rarely reach the paragraph with the actual wait; read the top wait-query pages in full.
  const waitHits = searches[0].status === "fulfilled" ? searches[0].value.docs.slice(0, FULL_TEXT_PAGES) : [];
  if (waitHits.length) {
    const pages = await getPages(waitHits.map((d) => d.url), { maxCharacters: FULL_TEXT_CHARS, extraOfficial: cityDomains(profile.city) }).catch(() => null);
    const textOf = new Map((pages?.docs ?? []).filter((p) => p.text).map((p) => [p.url, p.text!]));
    docs = docs.map((d) => (textOf.has(d.url) ? { ...d, text: textOf.get(d.url) } : d));
  }
  const report: TipReport = { stepId: step.id, ms: 0, sources: docs.length, extracted: 0, verified: 0 };
  if (docs.length === 0) return { tips: [], dropped: [], docs, report: { ...report, ms: Date.now() - t0 } };

  onProgress(`reading community sources: ${label}`);
  let result;
  try {
    result = await extract(
      extractTipsTask,
      { query: queries[0].query, context: extractTipsContext(profile, step, label), includeDomains: [], docs },
      TipExtraction,
    );
  } catch (e) {
    return { tips: [], dropped: [], docs, report: { ...report, ms: Date.now() - t0, error: (e as Error).message } };
  }

  const extracted = result.data?.tips ?? [];
  // wait_time is checked as a processing_time claim: every number in the tip text must be in the quote.
  const raw: RawClaim[] = extracted.map((t) => ({
    stepId: step.id,
    kind: t.kind === "wait_time" ? "processing_time" : "document",
    value: t.tip,
    url: t.url,
    quote: t.quote,
  }));
  const allDocs = dedupeDocs([...docs, ...result.sources]);
  const allowedDomains = [...new Set(allDocs.map((d) => hostOf(d.url)).filter((h): h is string => !!h))];
  // One call per tip so each verified claim stays paired with the tip it came from.
  const checks = await Promise.all(
    raw.map((r) =>
      verifyCitations([r], allDocs, { allowedDomains, extraOfficial: cityDomains(profile.city), knownStepIds: STEP_IDS, fetchPage }),
    ),
  );

  const tips: Tip[] = [];
  const dropped: DroppedClaim[] = [];
  const seen = new Set<string>();
  checks.forEach(({ verified, dropped: d }, i) => {
    dropped.push(...d);
    const v = verified[0];
    if (!v) return;
    const key = `${v.citation.url}|${v.citation.quote}`;
    if (seen.has(key)) return;
    seen.add(key);
    let kind: Tip["kind"] = extracted[i].kind;
    const waitDays = kind === "wait_time" ? parseWaitDays(v.citation.quote) : undefined;
    // A wait_time tip whose quote states no parseable duration is still a useful tip, but not a wait.
    if (kind === "wait_time" && waitDays === undefined) kind = "gotcha";
    tips.push({
      stepId: step.id,
      tip: v.value,
      kind,
      ...(waitDays !== undefined ? { waitDays } : {}),
      citation: v.citation,
      matchScore: v.matchScore,
    });
  });
  const kept = tips.slice(0, MAX_TIPS_PER_STEP);
  return {
    tips: kept,
    dropped,
    docs: allDocs,
    report: { ...report, ms: Date.now() - t0, sources: allDocs.length, extracted: raw.length, verified: kept.length },
  };
}

export async function findCommunityTips(profile: Profile, steps: Step[], opts: FindTipsOptions = {}): Promise<FindTipsResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const startPublishedDate = communityWindowStart(opts.today ?? helsinkiDate(new Date()));
  const fetchPage = createPageFetcher(cityDomains(profile.city));
  const runs = await Promise.all(
    tipTargets(steps).map((s) => tipsForStep(s, profile, startPublishedDate, fetchPage, onProgress)),
  );
  const tips = runs.flatMap((r) => r.tips);
  const byStep: Record<string, Tip[]> = {};
  for (const t of tips) (byStep[t.stepId] ??= []).push(t);
  return {
    tips,
    byStep,
    dropped: runs.flatMap((r) => r.dropped),
    reports: runs.map((r) => r.report),
    sources: mergeDocs(runs.flatMap((r) => r.docs)),
  };
}

/** Steps with their verified tips as `communityTips` (calendar reminders read `trick` tips from there). */
export function attachTips(steps: Step[], tips: Tip[]): Step[] {
  return steps.map((s) => {
    const mine = tips.filter((t) => t.stepId === s.id);
    if (!mine.length) return s;
    const communityTips: CommunityTip[] = mine.map((t) => ({ ...t.citation, kind: t.kind, text: t.tip }));
    return { ...s, communityTips };
  });
}
