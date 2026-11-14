// Shared data shapes. SPEC.md "Data shapes" is the source of truth; keep in sync.

export type Trust = "official" | "provider" | "university" | "news" | "community";

export type Profile = {
  citizenship: "EU" | "NON_EU" | "NORDIC";
  purpose: ("work" | "study" | "family")[];
  city: string;
  arrivalDate?: string; // ISO
  monthlySalaryEur?: number;
  hasFamily?: boolean;
  /** Under EU temporary protection (e.g. from Ukraine). Changes the permit path. */
  temporaryProtection?: boolean;
  /** Planned stay length when stated ("5 months"). */
  stayMonths?: number;
  /**
   * The text describes a one-term stay (Erasmus, exchange, "for next semester") without a length: under 12 months.
   * Kept apart from stayMonths, which the search prompts read; this only decides required vs optional steps.
   */
  termStay?: boolean;
  /** Step / milestone ids the person says they already have ("I already have a bank account"). Not searched; shown as done. */
  alreadyDone?: string[];
  /** Only on entries of ProfileResult.people: how this person relates to the main applicant. */
  relation?: "self" | "spouse" | "child" | "other";
};

export type Citation = { url: string; quote: string; trust: Trust; fetchedAt: string };

export type TipKind = "wait_time" | "trick" | "gotcha" | "document";

/** A community tip. `trick` tips can become calendar reminders (e.g. "check for cancelled slots at 23:00"). */
export type CommunityTip = Citation & {
  kind?: TipKind;
  /** Short actionable text, used as the reminder title for `trick` tips. */
  text?: string;
  /** Helsinki wall-clock time "HH:MM" the reminder should fire at. Defaults to 09:00. */
  remindAt?: string;
};

/** An official form a step asks for. Shown only with a verified sentence (citation) that says it is needed. */
export type StepForm = {
  /** Form number or code as the page writes it ("6150e"), or the name when the page gives none. */
  id: string;
  name: string;
  /** The official link to the form itself; null when the page names the form but gives no link (then the citation page is the pointer). */
  url: string | null;
  /** PDF or web form, from the link; null when there is no link. */
  type: "pdf" | "web" | null;
  /** What the verified sentence says to do with it, in a few words: "fill in before you go, sign at the office". Null when it does not say. */
  guidance: string | null;
  citation: Citation;
};

export type Step = {
  id: string; // e.g. "dvv_registration"
  title: string;
  authority: string; // DVV, Vero, Kela...
  mode: "online" | "in_person" | "either";
  requires: string[]; // step ids, all needed
  /** Alternatives: every group must be met by ANY one of its ids, e.g. [["dvv_registration", "vero_identity_code"]]. */
  requiresAnyOf?: string[][];
  /**
   * Requirements dropped from `requires` because they closed a cycle with weaker evidence than the rest
   * (lib/agent/breakCycles). The verified claim stays in `claims`; this only lets the plan be ordered.
   */
  relaxedRequires?: string[];
  /**
   * Decided from the profile (lib/agent/necessity): "optional" steps are shown apart ("Optional, if useful for
   * you") and never count toward the finish date, the critical path or the visit count. Absent = required.
   */
  necessity?: "required" | "optional";
  /** Why a step is optional: a short study stay (default when absent), or the person said they do not need it (a refinement). */
  optionalReason?: "short_stay" | "your_choice";
  /** A state ("has a personal identity code"), not an action: no visit, takes no time. */
  milestone?: boolean;
  /** The person says they already have this (Profile.alreadyDone). No citations: it is their statement, not a claim. */
  done?: boolean;
  /** Must be done before the person travels (a non-EU residence permit); the scheduler starts it today, not on arrival. */
  beforeArrival?: boolean;
  /** Not searched for: built from quotes other steps already verified (e.g. identification at the police). No tips, no conflict probes. */
  derived?: boolean;
  /** Shared by steps a verified source says can be done in one visit at the same desk. */
  visitId?: string;
  costOfDelay?: string;
  visitPack?: { address?: string; hours?: string; documents: string[]; bookingUrl?: string };
  citations: Citation[];
  /** Official forms found on this step's official pages (lib/agent/forms). */
  forms?: StepForm[];
  communityTips?: CommunityTip[];
  /** Every verified claim behind this step (requires-edges, documents, facts), each with its own citation. */
  claims?: VerifiedClaim[];
  /** Why this step is shown: its own `applies` sentence, or a confirmed step's verified requirement. */
  confirmation?: Confirmation;
};

export type Confirmation =
  | { by: "applies" }
  | { by: "required_by"; stepIds: string[]; citations: Citation[] };

/** What a claim asserts about a step. For `requires`, value = a canonical step id; for `provides`, a milestone id. */
export type ClaimKind =
  | "applies"
  | "requires"
  | "provides"
  | "same_visit"
  | "mode"
  | "document"
  | "cost_of_delay"
  | "processing_time"
  | "address"
  | "hours"
  | "booking_url"
  /** Where / when a step can be done instead of the office (a university check-in event). Derived, not extracted. */
  | "venue";

/** A claim as extracted, before verification. `quote` is what the extractor says the page says. */
export type RawClaim = { stepId: string; kind: ClaimKind; value: string; url: string; quote: string };

/** A claim whose quote was found in the source text. `citation.quote` is the matched page text, verbatim. */
export type VerifiedClaim = {
  stepId: string;
  kind: ClaimKind;
  value: string;
  citation: Citation;
  /** 1 = exact (normalised) substring, < 1 = fuzzy token-overlap score. */
  matchScore: number;
};

export type DropReason =
  | "quote_not_found"
  | "url_not_allowed"
  | "page_unavailable"
  | "unknown_step_id"
  | "invalid_value"
  | "too_short"
  | "merged_sentences"
  | "value_not_in_quote"
  | "not_own_step";

export type DroppedClaim = RawClaim & { reason: DropReason; bestScore?: number };

/** A step we searched for but could not confirm from any source. Never shown as a fact. */
export type StepStub = { id: string; label: string; message: string; checkUrl?: string };

/**
 * Lived-experience tip for a step (lib/agent/findCommunityTips). `citation.quote` is verified page text.
 * `waitDays` (working days) is parsed from the verified quote itself, never taken from the extractor.
 */
export type Tip = {
  stepId: string;
  tip: string;
  kind: TipKind;
  waitDays?: number;
  citation: Citation;
  matchScore: number;
};

/**
 * Two verified sources disagreeing on one fact of a step. `a` is the higher-trust side (TRUST_RANK).
 * `whatToDo` is guidance on which source to rely on and why, not legal advice.
 */
export type Conflict = { stepId: string; topic: string; a: Citation; b: Citation; note: string; whatToDo: string };

/** One Exa result normalised for the pipeline. Text here is what citations are verified against. */
export type ExaDoc = {
  url: string;
  title: string;
  domain: string; // hostname without www.
  trust: Trust;
  highlights: string[];
  text?: string; // only from getPages()
  /** Links found on the page; only from getPages({ links }). */
  links?: string[];
  publishedDate?: string;
  fetchedAt: string; // when Exa returned it (cache write time)
};

/** Alias used in the Exa layer docs. */
export type ExaHit = ExaDoc;

/** One planned search (pipeline step 2a). */
export type SearchSpec = {
  topic: string; // e.g. "dvv", "vero", "bank"
  query: string;
  objective: string;
  layer: "official" | "community";
};

/** Who did the work behind a status line: Exa (search, pages, monitors), Claude (understanding, extracting, comparing), Check (quote verification, graph, scheduling). */
export type Actor = "exa" | "claude" | "check";

/** What each actor did in a run, counted where the work happens (lib/exa, lib/llm, verifyCitations). */
export type RunActivity = { searches: number; pagesRead: number; extractions: number; quotesChecked: number; quotesDropped: number };

/** Counts for the final summary (SPEC F3: done online / visits / in calendar / critical path length). */
export type RunSummary = {
  runId: string;
  /** true when the run stopped early (timeout); the counts cover what was finished. */
  partial: boolean;
  /** Actionable steps found and confirmed (milestones and already-done items excluded). */
  steps: number;
  alreadyDone: number;
  /** Steps shown under "Optional, if useful for you"; not in `steps`, visits or the critical path. */
  optional?: number;
  /** Steps that can be done online (mode online or either). */
  online: number;
  /** Distinct in-person visits as scheduled (steps merged into one visit count once). */
  inPersonVisits: number;
  /** Visit events in the calendar (+ tip reminders, counted separately). */
  inCalendar: number;
  reminders: number;
  /** Steps searched but not confirmed by any source ("not found, check <url>"). */
  notFound: number;
  criticalPath: { stepIds: string[]; workingDays: number; calendarDays: number; endDate: string | null };
  /** Distinct source URLs behind the citations shown, by trust tier. */
  sourcesByTrust: Record<Trust, number>;
  /** Distinct verified quotes shown (step claims, tips, both sides of conflicts). */
  verifiedQuotes: number;
  /** Extracted claims whose quote was not found in the source text (never shown). */
  droppedClaims: number;
  /** The rejected claims themselves (first 50), shown on request: honesty about what was thrown away. */
  rejected: Pick<DroppedClaim, "stepId" | "kind" | "url" | "quote" | "reason">[];
  tips: number;
  conflicts: number;
  /** Wall-clock time of this run (a cached replay is fast; never shown as "it took"). */
  totalMs: number;
  /**
   * The duration to show: this run's time when it did live work; for a run served entirely from cache, the
   * original live run recorded in demo-cache/runs/ (lib/demo/liveRuns.ts); absent when unknown (then omitted).
   */
  liveMs?: number;
  costUsd: { exa: number; llm: number; total: number };
  calls: { exa: number; exaLive: number; llm: number; llmLive: number };
  activity: RunActivity;
};

/** A calendar event as streamed: the CalEvent plus its Google Calendar template link. */
export type StreamCalEvent = import("./calendar/types").CalEvent & { googleTemplateUrl: string };

/**
 * NDJSON events from POST /api/run (lib/agent/run.ts). Order: status* → profile → (status | step | stub)*
 * → graph → (status | tip)* → schedule → calendar → (status | conflict)* → [partial] → done.
 * `step` events are upserts keyed by step.id (a step can be re-sent when its final form changes).
 * An out-of-scope input yields a single `out_of_scope` event and nothing else.
 */
export type PipelineEvent =
  /** actor: who did it, set where the line is created. replay: paced by the demo replay (a saved run played back from demo-cache). */
  | { type: "status"; message: string; actor: Actor; domain?: string; cached?: boolean; replay?: boolean }
  | {
      type: "profile";
      profile: Profile;
      assumptions: string[];
      /** Everyone moving, main applicant first. */
      people: Profile[];
      /** Per partner: which citizenship-path steps differ (not researched for them). */
      partnerNotes: string[];
      source: "llm" | "deterministic";
    }
  | { type: "out_of_scope"; message: string }
  | { type: "step"; step: Step }
  | { type: "stub"; stub: StepStub }
  | {
      type: "graph";
      graph: import("./graph/types").Graph;
      criticalNode: string | null;
      order: string[];
      deadlocks: import("./graph/types").Deadlock[];
    }
  | { type: "tip"; tip: Tip }
  | { type: "conflict"; conflict: Conflict }
  | {
      type: "schedule";
      schedule: import("./graph/types").Schedule;
      criticalPath: import("./graph/types").CriticalPath;
      visitChoices: (import("./graph/schedule").VisitChoice & { description: string })[];
      /** The usual order (identity code only via DVV, no merged visits) for comparison; absent when there is no alternative route. */
      baseline?: import("./graph/baseline").Baseline;
    }
  | { type: "calendar"; events: StreamCalEvent[]; icsUrl: string }
  | { type: "partial"; reason: "timeout"; message: string; missing: string[] }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done"; summary: RunSummary };

export type PipelineEventType = PipelineEvent["type"];
