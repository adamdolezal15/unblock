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
};

export type Citation = { url: string; quote: string; trust: Trust; fetchedAt: string };

/** A community tip. `trick` tips can become calendar reminders (e.g. "check for cancelled slots at 23:00"). */
export type CommunityTip = Citation & {
  kind?: "wait_time" | "trick" | "gotcha";
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

export type Conflict = { topic: string; a: Citation; b: Citation; note: string };

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

export type PipelineEvent =
  | { type: "progress"; message: string }
  | { type: "profile"; profile: Profile }
  | { type: "out_of_scope"; message: string }
  | { type: "docs"; layer: "official" | "community"; count: number }
  | { type: "steps"; steps: Step[] }
  | { type: "conflicts"; conflicts: Conflict[] }
  | { type: "graph"; order: string[]; criticalNodeId: string | null; criticalPath: string[]; lengthDays: number }
  | { type: "error"; message: string }
  | { type: "done"; elapsedMs: number };
