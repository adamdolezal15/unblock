// Pipeline step 3c (SPEC F2, conflict detection). Per confirmed step: put its verified official/provider
// claims, its verified community tips and (where the taxonomy names them) targeted searches for both sides
// of a known disagreement in front of the extractor; it proposes pairs of sentences that disagree.
// A pair is kept only if BOTH quotes verify against the text Exa returned, they come from different pages,
// and the extractor judged them a genuine contradiction (precision over recall). Side `a` is the more
// trusted one (TRUST_RANK).
import type { Progress } from "../events/context";
import { cityDomains, TRUST_RANK } from "../exa/domains";
import { sourceAuthority } from "./authority";
import { searchOfficial, searchProvider } from "../exa/search";
import { extract } from "../llm";
import { ConflictExtraction, detectConflictsContext, detectConflictsTask } from "../prompts/detectConflicts";
import type { Citation, Conflict, DroppedClaim, ExaDoc, Profile, RawClaim, Step, Tip } from "../types";
import { mergeDocs } from "./docs";
import { STEP_IDS, STEP_TAXONOMY } from "./stepTaxonomy";
import { createPageFetcher, normalizeUrl, verifyCitations, type PageFetcher } from "./verifyCitations";

export type ConflictReport = { stepId: string; ms: number; sources: number; proposed: number; kept: number; error?: string };

export type DetectConflictsResult = {
  conflicts: Conflict[];
  dropped: DroppedClaim[];
  reports: ConflictReport[];
  /** Documents from the targeted conflict searches (the step and tip quotes are already verified). */
  sources: ExaDoc[];
};

export type DetectConflictsOptions = { profile: Profile; onProgress?: Progress };

const host = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
};

const WHY: Record<Citation["trust"], string> = {
  official: "an authority or regulator sets or enforces the rule",
  provider: "the provider states its own practice",
  university: "a university guide summarises the process for its students",
  news: "a news report",
  community: "a personal report",
};

/** Deterministic guidance from trust tiers, for conflicts found without the extractor. */
export function whatToDoByTrust(a: Citation, b: Citation): string {
  if (TRUST_RANK[a.trust] === TRUST_RANK[b.trust]) {
    return `Both sources are ${a.trust} (${host(a.url)}, ${host(b.url)}). Check which page is more recent and confirm with the authority before you plan around either. This is guidance, not legal advice.`;
  }
  return `Rely on ${host(a.url)} (${a.trust}: ${WHY[a.trust]}) over ${host(b.url)} (${b.trust}: ${WHY[b.trust]}), but plan for the stricter case until the authority confirms. This is guidance, not legal advice.`;
}

/** One pseudo-document per URL holding the already-verified quotes from that page. */
function citationDocs(citations: Citation[]): ExaDoc[] {
  const byUrl = new Map<string, ExaDoc>();
  for (const c of citations) {
    const k = normalizeUrl(c.url);
    const d = byUrl.get(k) ?? { url: c.url, title: host(c.url), domain: host(c.url), trust: c.trust, highlights: [], fetchedAt: c.fetchedAt };
    if (!d.highlights.includes(c.quote)) d.highlights.push(c.quote);
    byUrl.set(k, d);
  }
  return [...byUrl.values()];
}

async function probeDocs(step: Step, profile: Profile): Promise<ExaDoc[]> {
  const probes = STEP_TAXONOMY.find((d) => d.id === step.id)?.conflictSearches ?? [];
  const results = await Promise.allSettled(
    probes.map((p) =>
      p.layer === "provider"
        ? searchProvider(p.query, { objective: p.objective })
        : searchOfficial({ query: p.query, objective: p.objective, city: profile.city, onlyDomains: p.domains }),
    ),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value.docs : []));
}

async function conflictsForStep(
  step: Step,
  tips: Tip[],
  profile: Profile,
  fetchPage: PageFetcher,
  onProgress: Progress,
): Promise<{ conflicts: Conflict[]; dropped: DroppedClaim[]; probes: ExaDoc[]; report: ConflictReport }> {
  const t0 = Date.now();
  const probes = await probeDocs(step, profile);
  const docs = mergeDocs([
    ...citationDocs([...(step.claims ?? []).map((c) => c.citation), ...tips.map((t) => t.citation)]),
    ...probes,
  ]);
  const report: ConflictReport = { stepId: step.id, ms: 0, sources: docs.length, proposed: 0, kept: 0 };
  if (docs.length < 2) return { conflicts: [], dropped: [], probes, report: { ...report, ms: Date.now() - t0 } };

  onProgress(`comparing sources: ${step.title}`, "claude");
  let result;
  try {
    result = await extract(
      detectConflictsTask,
      { query: step.title, context: detectConflictsContext(profile, { ...step, authority: sourceAuthority(step) }), includeDomains: [], docs },
      ConflictExtraction,
    );
  } catch (e) {
    return { conflicts: [], dropped: [], probes, report: { ...report, ms: Date.now() - t0, error: (e as Error).message } };
  }

  const proposed = result.data?.conflicts ?? [];
  const allDocs = mergeDocs([...docs, ...result.sources]);
  const allowedDomains = [...new Set(allDocs.map((d) => host(d.url)))];
  const verify = (url: string, quote: string) =>
    verifyCitations([{ stepId: step.id, kind: "document", value: "-", url, quote } satisfies RawClaim], allDocs, {
      allowedDomains,
      extraOfficial: cityDomains(profile.city),
      knownStepIds: STEP_IDS,
      fetchPage,
    });

  const conflicts: Conflict[] = [];
  const dropped: DroppedClaim[] = [];
  for (const p of proposed) {
    if (p.verdict !== "contradiction") continue;
    const [va, vb] = await Promise.all([verify(p.aUrl, p.aQuote), verify(p.bUrl, p.bQuote)]);
    dropped.push(...va.dropped, ...vb.dropped);
    let a = va.verified[0]?.citation;
    let b = vb.verified[0]?.citation;
    if (!a || !b) continue;
    if (normalizeUrl(a.url) === normalizeUrl(b.url) || a.quote === b.quote) continue;
    if (TRUST_RANK[b.trust] > TRUST_RANK[a.trust]) [a, b] = [b, a];
    conflicts.push({ stepId: step.id, topic: p.topic.trim(), a, b, note: p.note.trim(), whatToDo: p.whatToDo.trim() });
  }
  return { conflicts, dropped, probes, report: { ...report, ms: Date.now() - t0, sources: allDocs.length, proposed: proposed.length, kept: conflicts.length } };
}

/**
 * Cross-tier conflicts per step. `tips` = verified community tips (findCommunityTips). Milestones are
 * skipped: their claims are their providers' own and are compared there.
 */
export async function detectConflicts(steps: Step[], tips: Tip[], opts: DetectConflictsOptions): Promise<DetectConflictsResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const fetchPage = createPageFetcher(cityDomains(opts.profile.city));
  const runs = await Promise.all(
    steps
      .filter((s) => !s.milestone)
      .map((s) => conflictsForStep(s, tips.filter((t) => t.stepId === s.id), opts.profile, fetchPage, onProgress)),
  );
  const seen = new Set<string>();
  const conflicts = runs
    .flatMap((r) => r.conflicts)
    .filter((c) => {
      const k = [`${normalizeUrl(c.a.url)}|${c.a.quote}`, `${normalizeUrl(c.b.url)}|${c.b.quote}`].sort().join("||");
      return seen.has(k) ? false : (seen.add(k), true);
    });
  return {
    conflicts,
    dropped: runs.flatMap((r) => r.dropped),
    reports: runs.map((r) => r.report),
    sources: mergeDocs(runs.flatMap((r) => r.probes)),
  };
}
