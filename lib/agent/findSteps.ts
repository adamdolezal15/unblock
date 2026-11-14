// Pipeline step 2 (SPEC F1). Per relevant canonical step, in parallel:
//   targeted Exa searches -> extract claims via lib/llm -> verifyCitations -> merge into a Step.
// Steps carry only verified claims. A step is confirmed by its own `applies` claim or by a confirmed
// step requiring it (see confirmSteps); otherwise it becomes a stub ("not found, check <url>").
// "Needs a personal identity code" points at the personal_identity_code milestone, which any step
// with a verified `provides` claim can satisfy (an any-of group in lib/graph).
import { cityDomains, officialDomains, PROVIDER, TRUST_RANK, UNIVERSITY } from "../exa/domains";
import { searchOfficial, searchProvider } from "../exa/search";
import { extract } from "../llm";
import { extractStepContext, extractStepTask, StepExtraction } from "../prompts/extractStep";
import type {
  Citation, Confirmation, Conflict, DroppedClaim, ExaDoc, Profile, RawClaim, Step, StepStub, VerifiedClaim,
} from "../types";
import { authorityOf } from "./authority";
import { MILESTONE_IDS, MILESTONES, selectSteps, STEP_IDS, type StepDef } from "./stepTaxonomy";
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
  /** Every source document read, so citations can be re-checked independently. */
  sources: ExaDoc[];
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

function mergeStep(
  def: StepDef,
  title: string | undefined,
  claims: VerifiedClaim[],
  checkUrl: string | undefined,
  confirmation: Confirmation,
): Step {
  const sorted = [...claims].sort(byTrust);
  const first = (kind: VerifiedClaim["kind"]) => sorted.find((c) => c.kind === kind)?.value;
  const all = (kind: VerifiedClaim["kind"]) => [...new Set(sorted.filter((c) => c.kind === kind).map((c) => c.value))];
  const anchorUrl = (sorted.find((c) => c.kind === "applies") ?? sorted[0])?.citation.url ?? checkUrl;
  // A step confirmed only by another step's requirement still carries that citation.
  const ownCitations = uniqueCitations(sorted);
  const citations = ownCitations.length || confirmation.by === "applies" ? ownCitations : confirmation.citations;

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
    authority: anchorUrl ? authorityOf(anchorUrl) : "unknown",
    mode: (first("mode") as Step["mode"] | undefined) ?? "either",
    requires: all("requires"),
    ...(first("cost_of_delay") ? { costOfDelay: first("cost_of_delay") } : {}),
    ...(visitPack ? { visitPack } : {}),
    citations,
    claims: sorted,
  };
}

type StepRun = {
  def: StepDef;
  title?: string;
  verified: VerifiedClaim[];
  dropped: DroppedClaim[];
  report: StepReport;
  checkUrl?: string;
  /** Every document read for this step (search results + the extractor's own sources). */
  docs: ExaDoc[];
  error?: string;
};

/** Search, extract and verify one step. Does not decide whether the step is confirmed. */
async function runStep(
  def: StepDef,
  profile: Profile,
  selected: StepDef[],
  fetchPage: PageFetcher,
  onProgress: (m: string) => void,
): Promise<StepRun> {
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
    ...(def.extraSearches ?? []).map((s) =>
      s.layer === "provider"
        ? searchProvider(s.query, { objective: s.objective })
        : searchOfficial({ query: s.query, objective: s.objective, city: profile.city }),
    ),
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
      def,
      verified: [],
      dropped: [],
      checkUrl,
      docs,
      error,
      report: { id: def.id, ms: Date.now() - t0, extracted: 0, verified: 0, dropped: 0, sources: docs.length, error },
    };
  }

  const raw: RawClaim[] = (result.data?.claims ?? []).map((c) => ({ stepId: def.id, ...c }));
  onProgress(`verifying ${raw.length} quotes: ${def.label}`);
  const { verified, dropped } = await verifyCitations(raw, [...docs, ...result.sources], {
    allowedDomains: includeDomains,
    extraOfficial,
    knownStepIds: STEP_IDS,
    milestoneIds: MILESTONE_IDS,
    fetchPage,
  });

  return {
    def,
    title: result.data?.title,
    verified,
    dropped,
    checkUrl,
    docs: dedupeDocs([...docs, ...result.sources]),
    report: {
      id: def.id,
      ms: Date.now() - t0,
      extracted: raw.length,
      verified: verified.length,
      dropped: dropped.length,
      sources: dedupeDocs([...docs, ...result.sources]).length,
      llm: { provider: result.meta.provider, ms: result.meta.ms, costUsd: result.meta.costUsd },
    },
  };
}

/**
 * Confirmation rule: a step is confirmed if it has its own verified `applies` claim, OR a confirmed
 * step requires it with a verified citation. A milestone (e.g. personal_identity_code) required by a
 * confirmed step is confirmed too, and so is every step with a verified `provides` claim for it
 * (each is one cited way to meet that requirement). Iterated to a fixpoint (requirements chain).
 */
export function confirmSteps(
  runs: { id: string; verified: VerifiedClaim[] }[],
  milestoneIds: ReadonlySet<string> = MILESTONE_IDS,
): Map<string, Confirmation> {
  const ids = new Set(runs.map((r) => r.id));
  const confirmed = new Map<string, Confirmation>();
  const require = (id: string, by: string, citation: Citation): boolean => {
    const existing = confirmed.get(id);
    if (!existing) {
      confirmed.set(id, { by: "required_by", stepIds: [by], citations: [citation] });
      return true;
    }
    if (existing.by === "required_by" && !existing.stepIds.includes(by)) {
      existing.stepIds.push(by);
      existing.citations.push(citation);
    }
    return false;
  };
  for (const r of runs) if (r.verified.some((c) => c.kind === "applies")) confirmed.set(r.id, { by: "applies" });
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of runs) {
      if (confirmed.has(r.id)) {
        for (const c of r.verified) {
          if (c.kind !== "requires") continue;
          if (ids.has(c.value) || milestoneIds.has(c.value)) changed = require(c.value, r.id, c.citation) || changed;
        }
      }
      for (const c of r.verified) {
        if (c.kind === "provides" && confirmed.has(c.value)) changed = require(r.id, c.value, c.citation) || changed;
      }
    }
  }
  return confirmed;
}

/**
 * Safety net for the prompt rule "a personal identity code is not DVV registration": a `requires
 * dvv_registration` whose quote is about the ID code and not about population registration is
 * re-pointed at the personal_identity_code milestone.
 */
export function remapIdentityCode(c: VerifiedClaim): VerifiedClaim {
  if (c.kind !== "requires" || c.value !== "dvv_registration") return c;
  const q = c.citation.quote.toLowerCase();
  const aboutCode = /personal identity (code|number)|identity code|henkilötunnu/.test(q);
  const aboutRegistration = /population information system|väestötietojärjestelmä|municipality of residence|kotikunta|register(ed)? (as a resident|with dvv|at dvv)/.test(q);
  return aboutCode && !aboutRegistration ? { ...c, value: "personal_identity_code" } : c;
}

/** visitId -> members, from verified same_visit claims between confirmed steps (union-find). */
export function sameVisits(steps: Pick<Step, "id" | "claims">[]): Map<string, string[]> {
  const ids = new Set(steps.map((s) => s.id));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const s of steps) {
    for (const c of s.claims ?? []) {
      if (c.kind === "same_visit" && ids.has(c.value)) parent.set(find(s.id), find(c.value));
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  const out = new Map<string, string[]>();
  for (const members of groups.values()) {
    if (members.length > 1) out.set(`visit:${[...members].sort().join("+")}`, members);
  }
  return out;
}

/**
 * Documents that are the OUTPUT of another step. When a verified `document` claim asks for one, the
 * step requires that other step; the new `requires` claim carries the same verified citation.
 * Classification only: no fact is added that the quote does not state.
 */
const DOCUMENT_FROM_STEP: { pattern: RegExp; stepId: string }[] = [
  { pattern: /(registration (certificate )?of (an? |the )?(eu citizen.{0,3}s )?right of residence|certificate of registration of the right of residence)/i, stepId: "eu_registration" },
  { pattern: /\bresidence permit( card)?\b/i, stepId: "residence_permit" },
];

export function requiresFromDocuments(stepId: string, claims: VerifiedClaim[], available: ReadonlySet<string>): VerifiedClaim[] {
  const have = new Set(claims.filter((c) => c.kind === "requires").map((c) => c.value));
  const out: VerifiedClaim[] = [];
  for (const c of claims) {
    if (c.kind !== "document") continue;
    const text = `${c.value} ${c.citation.quote}`;
    for (const { pattern, stepId: target } of DOCUMENT_FROM_STEP) {
      if (target === stepId || !available.has(target) || have.has(target) || !pattern.test(text)) continue;
      have.add(target);
      out.push({ ...c, kind: "requires", value: target });
    }
  }
  return out;
}

/**
 * The milestone node: met by ANY step with a verified `provides` claim. A provider that itself requires
 * the milestone can't satisfy it, so it is not an option. Null when no source names a usable option.
 */
function buildMilestone(id: string, confirmation: Confirmation, providers: VerifiedClaim[], runs: StepRun[]): Step | null {
  const needsItself = (stepId: string) =>
    runs.some((r) => r.def.id === stepId && r.verified.some((c) => c.kind === "requires" && c.value === id));
  providers = providers.filter((c) => !needsItself(c.stepId));
  if (providers.length === 0) return null; // leave it to buildGraph as an `unresolved` placeholder
  return {
    id,
    title: MILESTONES[id]?.label ?? id,
    authority: "any of the options",
    mode: "either",
    requires: [],
    requiresAnyOf: [[...new Set(providers.map((c) => c.stepId))]],
    milestone: true,
    citations: uniqueCitations(providers),
    claims: providers,
    confirmation,
  };
}

export async function findSteps(profile: Profile, opts: FindStepsOptions = {}): Promise<FindStepsResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const selected = selectSteps(profile);
  const fetchPage = createPageFetcher(cityDomains(profile.city));
  const runs = await Promise.all(selected.map((def) => runStep(def, profile, selected, fetchPage, onProgress)));
  const available = new Set(runs.map((r) => r.def.id));
  for (const r of runs) {
    r.verified = r.verified.map(remapIdentityCode);
    r.verified.push(...requiresFromDocuments(r.def.id, r.verified, available));
  }
  const confirmed = confirmSteps(runs.map((r) => ({ id: r.def.id, verified: r.verified })));

  const steps: Step[] = [];
  const stubs: StepStub[] = [];
  const conflicts: Conflict[] = [];
  for (const r of runs) {
    const confirmation = confirmed.get(r.def.id);
    if (confirmation) {
      steps.push({ ...mergeStep(r.def, r.title, r.verified, r.checkUrl, confirmation), confirmation });
      conflicts.push(...detectConflicts(r.def.id, r.verified));
    } else {
      const message = r.error
        ? `Extraction failed (${r.error}). Check the official source.`
        : r.checkUrl
          ? `Not found in sources, check ${r.checkUrl}`
          : "Not found in sources.";
      stubs.push({ id: r.def.id, label: r.def.label, message, checkUrl: r.checkUrl });
    }
  }

  // Shared visits: union confirmed steps linked by a verified same_visit claim.
  for (const [visitId, members] of sameVisits(steps)) {
    for (const s of steps) if (members.includes(s.id)) s.visitId = visitId;
  }

  for (const id of MILESTONE_IDS) {
    const confirmation = confirmed.get(id);
    if (!confirmation) continue;
    const providers = runs.flatMap((r) =>
      confirmed.has(r.def.id) ? r.verified.filter((c) => c.kind === "provides" && c.value === id) : [],
    );
    const milestone = buildMilestone(id, confirmation, providers, runs);
    if (milestone) steps.push(milestone);
  }

  return {
    steps,
    sources: dedupeDocs(runs.flatMap((r) => r.docs)),
    stubs,
    dropped: runs.flatMap((r) => r.dropped),
    conflicts,
    reports: runs.map((r) => r.report),
  };
}
