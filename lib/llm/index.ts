// The single entry point for LLM-shaped work. Callers never learn which provider ran.
//   LLM_PROVIDER=anthropic (default) -> Claude Sonnet 5.5; needs ANTHROPIC_API_KEY unless LLM_CACHE=read (no API calls then)
//   LLM_PROVIDER=exa                 -> Exa deep search + outputSchema (also the fallback when Claude is unavailable)
// Every extraction goes through a disk cache: .cache/llm/, LLM_CACHE=read|write|off (default write).
import path from "node:path";
import { z } from "zod";
import { cachedCall, modeFromEnv, sha } from "../cache/disk";
import { countActivity, domainList, emitStatus, meterLlm, throwIfAborted } from "../events/context";
import { salvage } from "./salvage";
import type { ExtractInput, ExtractResult, LlmProvider, LlmTask } from "./types";

export type { ExtractInput, ExtractResult, LlmTask } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache", "llm");
/** Git-tracked entries for the demo sentences (npm run warm-demo). */
export const DEMO_CACHE_DIR = path.join(process.cwd(), "demo-cache", "llm");
let warned = false;

/** Which provider will run, resolved from env. Exported for tests. */
export function resolveProviderName(env: Record<string, string | undefined> = process.env): "exa" | "anthropic" {
  const wanted = (env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (wanted === "anthropic") {
    if (env.ANTHROPIC_API_KEY || (env.LLM_CACHE ?? "").toLowerCase() === "read") return "anthropic";
    if (!warned) {
      console.warn("[llm] anthropic extractor selected but ANTHROPIC_API_KEY is not set; falling back to exa");
      warned = true;
    }
  }
  return "exa";
}

async function provider(): Promise<LlmProvider> {
  // Lazy imports: the Anthropic SDK is never loaded on the exa path.
  if (resolveProviderName() === "anthropic") return (await import("./anthropicProvider")).anthropicProvider;
  return (await import("./exaProvider")).exaProvider;
}

/**
 * Cache key: provider + model + prompt version (+ prompt text hash, so an edit without a version bump
 * can't serve stale answers) + schema + per-call input (query, context, domains) + hash of the input docs.
 */
export function llmCacheKey(p: Pick<LlmProvider, "name" | "model">, task: LlmTask, input: ExtractInput, schema: z.ZodType) {
  return {
    endpoint: "llm.extract",
    provider: p.name,
    model: p.model,
    task: `${task.name}@${task.version}`,
    promptHash: sha(task.systemPrompt, 16),
    schemaHash: sha(z.toJSONSchema(schema), 16),
    query: input.query,
    contextHash: sha(input.context, 16),
    includeDomains: [...input.includeDomains].sort(),
    docsHash: sha(
      input.docs.map((d) => ({ url: d.url, highlights: d.highlights, text: d.text ?? null })),
      16,
    ),
  };
}

/** Activity-feed line for an extraction about to run (the task name says what is being read). */
function statusLine(task: string, n: number, domains: string): string {
  const src = `${n} source${n === 1 ? "" : "s"}${domains ? ` (${domains})` : ""}`;
  switch (task) {
    case "parseProfile":
      return "Understanding your situation…";
    case "extractStep":
      return `Extracting cited steps from ${src}…`;
    case "extractTips":
      return `Extracting community tips from ${src}…`;
    case "draft":
      return "Writing your draft from the verified facts…";
    case "detectConflicts":
      return `Comparing ${src} for disagreements…`;
    default:
      return `Reading ${src}…`;
  }
}

/** Structured extraction. Output is validated with `schema`; invalid parts are dropped, never guessed. */
export async function extract<T>(task: LlmTask, input: ExtractInput, schema: z.ZodType<T>): Promise<ExtractResult<T>> {
  const p = await provider();
  const domains = input.docs.map((d) => d.domain);
  // The exa provider's extraction is an Exa deep search (counted and labelled in lib/exa); only Claude's count here.
  const byClaude = p.name !== "exa";
  if (byClaude) countActivity("extractions");
  emitStatus(statusLine(task.name, input.docs.length, domainList(domains)), { actor: byClaude ? "claude" : "exa", domain: domains[0] });
  const r = await cachedCall(
    { dir: CACHE_DIR, mode: modeFromEnv("LLM_CACHE"), label: "LLM_CACHE", fallbackDir: DEMO_CACHE_DIR },
    llmCacheKey(p, task, input, schema),
    () => {
      throwIfAborted();
      return p.extract(task, input, schema);
    },
  );
  meterLlm(r.hit, r.hit ? 0 : (r.response.meta.costUsd ?? 0), p.name);
  if (!r.hit) return r.response;
  return {
    data: salvage(schema, r.response.data),
    sources: r.response.sources,
    meta: { ...r.response.meta, ms: r.ms, costUsd: 0, cacheHit: true },
  };
}
