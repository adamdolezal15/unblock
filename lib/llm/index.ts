// The single entry point for LLM-shaped work. Callers never learn which provider ran.
//   LLM_PROVIDER=exa (default)  -> Exa deep search + outputSchema
//   LLM_PROVIDER=anthropic      -> Claude, only if ANTHROPIC_API_KEY is set; otherwise falls back to exa
import type { z } from "zod";
import type { ExtractInput, ExtractResult, LlmProvider, LlmTask } from "./types";

export type { ExtractInput, ExtractResult, LlmTask } from "./types";

let warned = false;

/** Which provider will run, resolved from env. Exported for tests only. */
export function resolveProviderName(env: Record<string, string | undefined> = process.env): "exa" | "anthropic" {
  const wanted = (env.LLM_PROVIDER ?? "exa").toLowerCase();
  if (wanted === "anthropic") {
    if (env.ANTHROPIC_API_KEY) return "anthropic";
    if (!warned) {
      console.warn("[llm] LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set; using exa");
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

/** Structured extraction. Output is validated with `schema`; invalid parts are dropped, never guessed. */
export async function extract<T>(task: LlmTask, input: ExtractInput, schema: z.ZodType<T>): Promise<ExtractResult<T>> {
  return (await provider()).extract(task, input, schema);
}
