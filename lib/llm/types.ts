import type { ExaDoc } from "../types";

/** A named extraction task. Prompt text lives in lib/prompts/*. */
export type LlmTask = { name: string; systemPrompt: string };

/**
 * What the extractor gets. Each provider uses what it needs:
 * - exa: runs its own deep search with `query` + `includeDomains` (docs are not sent to Exa)
 * - anthropic: reads `docs` (already-fetched Exa results)
 */
export type ExtractInput = {
  query: string;
  /** Per-call context appended to the task prompt (profile summary, allowed ids). */
  context: string;
  includeDomains: string[];
  /** Domains labelled official for this run on top of the fixed list (the city's domain). */
  extraOfficial?: string[];
  docs: ExaDoc[];
};

export type ExtractMeta = { provider: "exa" | "anthropic"; ms: number; costUsd?: number; cacheHit: boolean };

export type ExtractResult<T> = {
  /** null when the provider returned nothing schema-valid. */
  data: T | null;
  /** Every document the provider read; extra text for citation verification. */
  sources: ExaDoc[];
  meta: ExtractMeta;
};

export interface LlmProvider {
  name: "exa" | "anthropic";
  extract<T>(task: LlmTask, input: ExtractInput, schema: import("zod").ZodType<T>): Promise<ExtractResult<T>>;
}
