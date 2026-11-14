// Pipeline step 2 (SPEC F1). Per relevant canonical step, in parallel:
//   targeted Exa searches -> extract claims via lib/llm -> verifyCitations -> merge into a Step.
// Steps carry only verified claims. A step is confirmed by its own `applies` claim or by a confirmed
// step requiring it (see confirmSteps); otherwise it becomes a stub ("not found, check <url>").
// "Needs a personal identity code" points at the personal_identity_code milestone, which any step
// with a verified `provides` claim can satisfy (an any-of group in lib/graph).
import type { Progress } from "../events/context";
import { cityDomains, officialDomains, PROVIDER, TRUST_RANK, UNIVERSITY } from "../exa/domains";
import { bookingHref } from "../calendar/bookingUrl";
import { searchOfficial, searchProvider } from "../exa/search";
import { extract } from "../llm";
import { extractStepContext, extractStepTask, StepExtraction } from "../prompts/extractStep";
import type {
  Citation, Confirmation, Conflict, DroppedClaim, ExaDoc, Profile, RawClaim, Step, StepStub, VerifiedClaim,
} from "../types";
import { whatToDoByTrust } from "./detectConflicts";
import { doneSteps, MILESTONE_IDS, MILESTONES, selectSteps, STEP_IDS, type StepDef } from "./stepTaxonomy";
import { inPersonFromText, localVisitClaims, permitProvidesCode, policeIdentificationClaims, policeIdentificationStep } from "./derive";
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

export type FindStepsOptions = {
  onProgress?: Progress;
  /**
   * Called as soon as a step is confirmed, and again if its final form differs (consumers upsert by id).
   * Every step in the returned `steps` has been passed here in its final form.
   */
  onStep?: (step: Step) => void;
};

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
function claimConflicts(stepId: string, claims: VerifiedClaim[]): Conflict[] {
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
            stepId,
            topic: `${stepId}.${kind}`,
            a: a.citation,
            b: b.citation,
            note: `Sources disagree: "${a.value}" vs "${b.value}".`,
            whatToDo: whatToDoByTrust(a.citation, b.citation),
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
  profile: Profile,
): Step {
  // Office addresses and hours for the person's own city when a local source says them.
  const sorted = localVisitClaims([...claims].sort(byTrust), profile.city, cityDomains(profile.city)[0]);
  const first = (kind: VerifiedClaim["kind"]) => sorted.find((c) => c.kind === kind)?.value;
  const all = (kind: VerifiedClaim["kind"]) => [...new Set(sorted.filter((c) => c.kind === kind).map((c) => c.value))];
  // A step confirmed only by another step's requirement still carries that citation.
  const ownCitations = uniqueCitations(sorted);
  const citations = ownCitations.length || confirmation.by === "applies" ? ownCitations : confirmation.citations;

  const documents = all("document");
  const address = first("address");
  const hours = first("hours");
  // Prefer a link-shaped booking value; an instruction ("call ... to book") is kept only if there is no link.
  const bookingUrl = all("booking_url").find((v) => bookingHref(v)) ?? first("booking_url");
  const visitPack =
    documents.length || address || hours || bookingUrl
      ? { documents, ...(address ? { address } : {}), ...(hours ? { hours } : {}), ...(bookingUrl ? { bookingUrl } : {}) }
      : undefined;

  return {
    id: def.id,
    title: title?.trim() || def.label,
    authority: def.authority,
    mode: (first("mode") as Step["mode"] | undefined) ?? "either",
    requires: all("requires"),
    ...(def.beforeArrival?.(profile) ? { beforeArrival: true } : {}),
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
  onProgress: Progress,
): Promise<StepRun> {
  const t0 = Date.now();
  const extraOfficial = cityDomains(profile.city);
  const includeDomains = [
    ...officialDomains(profile.city),
    ...(def.provider ? PROVIDER : []),
    ...(def.university ? UNIVERSITY : []),
  ];

  onProgress(`searching official sources: ${def.label}`, "exa");
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

  onProgress(`reading sources: ${def.label}`, "claude");
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
  const { verified, dropped } = await verifyCitations(raw, [...docs, ...result.sources], {
    allowedDomains: includeDomains,
    extraOfficial,
    knownStepIds: STEP_IDS,
    milestoneIds: MILESTONE_IDS,
    fetchPage,
    label: def.label,
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
  const done = doneSteps(profile);
  const available = new Set([...selected.map((d) => d.id), ...done.map((s) => s.id)]);
  // Steps with their own verified `applies` claim are confirmed the moment their run finishes: report
  // them right away. Everything else (required_by, milestones, shared visitIds) is known only after all runs.
  const emitted = new Map<string, string>();
  const emit = (s: Step) => {
    const json = JSON.stringify(s);
    if (emitted.get(s.id) === json) return;
    emitted.set(s.id, json);
    opts.onStep?.(s);
  };
  const verifyOpts = { allowedDomains: officialDomains(profile.city), extraOfficial: cityDomains(profile.city), fetchPage };
  // Whether a residence permit is searched: then the Vero identity-code step may turn out to be redundant (below).
  const permitSearched = selected.some((d) => d.id === "residence_permit");
  let runs = await Promise.all(
    selected.map((def) =>
      runStep(def, profile, selected, fetchPage, onProgress).then((r) => {
        r.verified = r.verified.map(remapIdentityCode);
        r.verified.push(...requiresFromDocuments(r.def.id, r.verified, available));
        if (r.verified.some((c) => c.kind === "applies") && !(permitSearched && r.def.id === "vero_identity_code")) {
          const confirmation: Confirmation = { by: "applies" };
          emit({ ...mergeStep(r.def, r.title, r.verified, r.checkUrl, confirmation, profile), confirmation });
        }
        return r;
      }),
    ),
  );

  // A page that says "requires a personal visit" makes the step in person, over a looser "either". Any page
  // read for this person counts (one step's search often returns the sentence about another step).
  const allDocs = dedupeDocs(runs.flatMap((r) => r.docs));
  for (const r of runs) {
    const visit = await inPersonFromText(r.def.id, allDocs, verifyOpts);
    if (visit.length) r.verified = [...r.verified.filter((c) => !(c.kind === "mode" && c.value === "either")), ...visit];
  }

  // A residence permit normally comes with the personal identity code: then the permit is an option of
  // that milestone, and the Vero tax-office route is not needed (nothing to shortcut).
  const permit = runs.find((r) => r.def.id === "residence_permit");
  if (permit?.verified.some((c) => c.kind === "applies")) {
    const provides = await permitProvidesCode(allDocs, verifyOpts);
    if (provides.length) {
      permit.verified.push(...provides);
      runs = runs.filter((r) => r.def.id !== "vero_identity_code");
    }
  }
  // Non-EEA passport: identification at the police is a visit of its own, not an item to bring.
  const view = runs.map((r) => ({ id: r.def.id, verified: r.verified, run: r }));
  const police = policeIdentificationClaims(profile, view);
  for (const v of view) v.run.verified = v.verified;
  for (const p of police) runs.find((r) => r.def.id === p.stepId)?.verified.push(p.requires);
  const confirmed = confirmSteps(runs.map((r) => ({ id: r.def.id, verified: r.verified })));

  const steps: Step[] = [];
  const stubs: StepStub[] = [];
  const conflicts: Conflict[] = [];
  for (const r of runs) {
    const confirmation = confirmed.get(r.def.id);
    if (confirmation) {
      steps.push({ ...mergeStep(r.def, r.title, r.verified, r.checkUrl, confirmation, profile), confirmation });
      conflicts.push(...claimConflicts(r.def.id, r.verified));
    } else {
      const message = r.error
        ? "Could not be read right now. Check the official source."
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

  const policeStep = policeIdentificationStep(police.filter((p) => confirmed.has(p.stepId)));
  if (policeStep) steps.push(policeStep);

  steps.push(...done);
  for (const id of MILESTONE_IDS) {
    const confirmation = confirmed.get(id);
    if (!confirmation || done.some((s) => s.id === id)) continue;
    const providers = runs.flatMap((r) =>
      confirmed.has(r.def.id) ? r.verified.filter((c) => c.kind === "provides" && c.value === id) : [],
    );
    const milestone = buildMilestone(id, confirmation, providers, runs);
    if (milestone) steps.push(milestone);
  }
  for (const s of steps) emit(s); // new steps, and early ones whose final form changed (e.g. a shared visitId)

  return {
    steps,
    sources: dedupeDocs(runs.flatMap((r) => r.docs)),
    stubs,
    dropped: runs.flatMap((r) => r.dropped),
    conflicts,
    reports: runs.map((r) => r.report),
  };
}
