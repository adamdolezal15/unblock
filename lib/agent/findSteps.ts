// Pipeline step 2 (SPEC F1). Per relevant canonical step, in parallel:
//   targeted Exa searches -> extract claims via lib/llm -> verifyCitations -> merge into a Step.
// Steps carry only verified claims. A step with no verified `applies` claim becomes a stub
// ("not found, check <url>") and stays out of the graph.
import { cityDomains, officialDomains, PROVIDER, TRUST_RANK, UNIVERSITY } from "../exa/domains";
import { searchOfficial, searchProvider } from "../exa/search";
import { extract } from "../llm";
import { extractStepContext, extractStepTask, StepExtraction } from "../prompts/extractStep";
import type {
  Citation, Conflict, DroppedClaim, ExaDoc, Profile, RawClaim, Step, StepStub, VerifiedClaim,
} from "../types";
import { authorityOf } from "./authority";
import { selectSteps, STEP_IDS, type StepDef } from "./stepTaxonomy";
import { createPageFetcher, verifyCitations, type PageFetcher } from "./verifyCitations";

export type StepReport = {
  id: string;
  ms: number;
  extracted: number;
  verified: number;
  dropped: number;
  sources: number;
  /** Extractor that ran and its own cost (exa deep cost is also in exaStats; anthropic cost is not). */
  llm?: { provider: string; ms: number; costUsd?: number };
  error?: string;
};

export type FindStepsResult = {
  steps: Step[];
  stubs: StepStub[];
  dropped: DroppedClaim[];
  conflicts: Conflict[];
  reports: StepReport[];
};

export type FindStepsOptions = { onProgress?: (message: string) => void };

function dedupeDocs(docs: ExaDoc[]): ExaDoc[] {
  const seen = new Set<string>();
  return docs.filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)));
}

/** Highest-trust claim first, stable otherwise. */
function byTrust(a: VerifiedClaim, b: VerifiedClaim): number {
  return TRUST_RANK[b.citation.trust] - TRUST_RANK[a.citation.trust];
}

function uniqueCitations(claims: VerifiedClaim[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of claims) {
    const k = `${c.citation.url}|${c.citation.quote}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c.citation);
    }
  }
  return out;
}

const digits = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join(",");

/** Same step, same single-valued kind, different values from different pages -> show both. */
function detectConflicts(stepId: string, claims: VerifiedClaim[]): Conflict[] {
  const out: Conflict[] = [];
  for (const kind of ["mode", "processing_time", "cost_of_delay"] as const) {
    const cs = claims.filter((c) => c.kind === kind).sort(byTrust);
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i];
        const b = cs[j];
        if (a.citation.url === b.citation.url) continue;
        const differ = kind === "mode" ? a.value !== b.value : digits(a.value) !== digits(b.value) && !!digits(a.value) && !!digits(b.value);
        if (differ) {
          out.push({
            topic: `${stepId}.${kind}`,
            a: a.citation,
            b: b.citation,
            note: `Sources disagree: "${a.value}" vs "${b.value}".`,
          });
        }
      }
    }
  }
  return out;
}

function mergeStep(def: StepDef, title: string | undefined, claims: VerifiedClaim[]): Step {
  const sorted = [...claims].sort(byTrust);
  const first = (kind: VerifiedClaim["kind"]) => sorted.find((c) => c.kind === kind)?.value;
  const all = (kind: VerifiedClaim["kind"]) => [...new Set(sorted.filter((c) => c.kind === kind).map((c) => c.value))];
  const anchor = sorted.find((c) => c.kind === "applies") ?? sorted[0];

  const documents = all("document");
  const address = first("address");
  const hours = first("hours");
  const bookingUrl = first("booking_url");
  const visitPack =
    documents.length || address || hours || bookingUrl
      ? { documents, ...(address ? { address } : {}), ...(hours ? { hours } : {}), ...(bookingUrl ? { bookingUrl } : {}) }
      : undefined;

  return {
    id: def.id,
    title: title?.trim() || def.label,
    authority: authorityOf(anchor.citation.url),
    mode: (first("mode") as Step["mode"] | undefined) ?? "either",
    requires: all("requires"),
    ...(first("cost_of_delay") ? { costOfDelay: first("cost_of_delay") } : {}),
    ...(visitPack ? { visitPack } : {}),
    citations: uniqueCitations(sorted),
    claims: sorted,
  };
}

async function runStep(
  def: StepDef,
  profile: Profile,
  selected: StepDef[],
  fetchPage: PageFetcher,
  onProgress: (m: string) => void,
): Promise<{ step?: Step; stub?: StepStub; dropped: DroppedClaim[]; conflicts: Conflict[]; report: StepReport }> {
  const t0 = Date.now();
  const extraOfficial = cityDomains(profile.city);
  const includeDomains = [
    ...officialDomains(profile.city),
    ...(def.provider ? PROVIDER : []),
    ...(def.university ? UNIVERSITY : []),
  ];

  onProgress(`searching official sources: ${def.label}`);
  const query = def.query(profile);
  const searches = await Promise.allSettled([
    searchOfficial({ query, objective: def.objective, city: profile.city, includeUniversities: !!def.university }),
    ...(def.provider ? [searchProvider(query, { objective: def.objective })] : []),
  ]);
  const docs = dedupeDocs(searches.flatMap((s) => (s.status === "fulfilled" ? s.value.docs : [])));
  const checkUrl = docs.find((d) => d.trust === "official")?.url ?? docs[0]?.url;

  onProgress(`reading sources: ${def.label}`);
  let result;
  try {
    result = await extract(
      extractStepTask,
      { query, context: extractStepContext(profile, def, selected), includeDomains, extraOfficial, docs },
      StepExtraction,
    );
  } catch (e) {
    const error = (e as Error).message;
    return {
      stub: { id: def.id, label: def.label, message: `Extraction failed (${error}). Check the official source.`, checkUrl },
      dropped: [],
      conflicts: [],
      report: { id: def.id, ms: Date.now() - t0, extracted: 0, verified: 0, dropped: 0, sources: docs.length, error },
    };
  }

  const raw: RawClaim[] = (result.data?.claims ?? []).map((c) => ({ stepId: def.id, ...c }));
  onProgress(`verifying ${raw.length} quotes: ${def.label}`);
  const { verified, dropped } = await verifyCitations(raw, [...docs, ...result.sources], {
    allowedDomains: includeDomains,
    extraOfficial,
    knownStepIds: STEP_IDS,
    fetchPage,
  });

  const report: StepReport = {
    id: def.id,
    ms: Date.now() - t0,
    extracted: raw.length,
    verified: verified.length,
    dropped: dropped.length,
    sources: dedupeDocs([...docs, ...result.sources]).length,
    llm: { provider: result.meta.provider, ms: result.meta.ms, costUsd: result.meta.costUsd },
  };

  if (!verified.some((c) => c.kind === "applies")) {
    const message = checkUrl ? `Not found in sources, check ${checkUrl}` : "Not found in sources.";
    return { stub: { id: def.id, label: def.label, message, checkUrl }, dropped, conflicts: [], report };
  }
  return { step: mergeStep(def, result.data?.title, verified), dropped, conflicts: detectConflicts(def.id, verified), report };
}

export async function findSteps(profile: Profile, opts: FindStepsOptions = {}): Promise<FindStepsResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const selected = selectSteps(profile);
  const fetchPage = createPageFetcher(cityDomains(profile.city));
  const runs = await Promise.all(selected.map((def) => runStep(def, profile, selected, fetchPage, onProgress)));

  return {
    steps: runs.flatMap((r) => (r.step ? [r.step] : [])),
    stubs: runs.flatMap((r) => (r.stub ? [r.stub] : [])),
    dropped: runs.flatMap((r) => r.dropped),
    conflicts: runs.flatMap((r) => r.conflicts),
    reports: runs.map((r) => r.report),
  };
}
