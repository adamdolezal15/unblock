// Shared data shapes. SPEC.md "Data shapes" is the source of truth; keep in sync.

export type Trust = "official" | "university" | "community";

export type Profile = {
  citizenship: "EU" | "NON_EU" | "NORDIC";
  purpose: ("work" | "study" | "family")[];
  city: string;
  arrivalDate?: string; // ISO
  monthlySalaryEur?: number;
  hasFamily?: boolean;
};

export type Citation = { url: string; quote: string; trust: Trust; fetchedAt: string };

export type Step = {
  id: string; // e.g. "dvv_registration"
  title: string;
  authority: string; // DVV, Vero, Kela...
  mode: "online" | "in_person" | "either";
  requires: string[]; // step ids
  costOfDelay?: string;
  visitPack?: { address?: string; hours?: string; documents: string[]; bookingUrl?: string };
  citations: Citation[];
  communityTips?: Citation[];
};

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
