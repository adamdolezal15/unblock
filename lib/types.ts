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

export type Step = {
  id: string; // e.g. "dvv_registration"
  title: string;
  authority: string; // DVV, Vero, Kela...
  mode: "online" | "in_person" | "either";
  requires: string[]; // step ids, all needed
  /** Alternatives: every group must be met by ANY one of its ids, e.g. [["dvv_registration", "vero_identity_code"]]. */
  requiresAnyOf?: string[][];
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
  | "booking_url";

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
  | "value_not_in_quote";

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

/** Counts for the final summary (SPEC F3: done online / visits / in calendar / critical path length). */
export type RunSummary = {
  runId: string;
  /** true when the run stopped early (timeout); the counts cover what was finished. */
  partial: boolean;
  /** Actionable steps found and confirmed (milestones and already-done items excluded). */
  steps: number;
  alreadyDone: number;
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
  totalMs: number;
  costUsd: { exa: number; llm: number; total: number };
  calls: { exa: number; exaLive: number; llm: number; llmLive: number };
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
  | { type: "status"; message: string; domain?: string; cached?: boolean }
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
