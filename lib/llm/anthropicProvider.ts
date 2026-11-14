// Claude as the extractor. Used only when LLM_PROVIDER=anthropic AND ANTHROPIC_API_KEY is set.
// Reads the Exa docs we already fetched (numbered excerpts) and fills the same zod schema as the
// exa provider, so verification is identical.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { ExaDoc } from "../types";
import { salvage } from "./salvage";
import type { ExtractInput, ExtractResult, LlmProvider, LlmTask } from "./types";

const MODEL = "claude-sonnet-5-5";
// Sonnet 5.5 list prices, $ per token (input / output).
const PRICE_IN = 2 / 1e6;
const PRICE_OUT = 10 / 1e6;
const MAX_DOC_CHARS = 12_000;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

function renderDocs(docs: ExaDoc[]): string {
  return docs
    .map((d, i) => {
      const body = (d.text ?? d.highlights.join("\n\n")).slice(0, MAX_DOC_CHARS);
      return `<document index="${i + 1}" url="${d.url}" trust="${d.trust}">\n${body}\n</document>`;
    })
    .join("\n\n");
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  model: MODEL,
  async extract<T>(task: LlmTask, input: ExtractInput, schema: z.ZodType<T>): Promise<ExtractResult<T>> {
    const t0 = Date.now();
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: task.systemPrompt,
      output_config: { format: betaZodOutputFormat(schema) },
      messages: [
        {
          role: "user",
          content: `${input.context}\n\nSearch query: ${input.query}\n\nSources (copy quotes only from these, and use their exact url):\n\n${renderDocs(input.docs)}`,
        },
      ],
    } as never);
    const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    const costUsd = usage ? (usage.input_tokens ?? 0) * PRICE_IN + (usage.output_tokens ?? 0) * PRICE_OUT : undefined;
    const parsed = (response as { parsed_output?: unknown; stop_reason?: string }).parsed_output ?? null;
    return {
      data: salvage(schema, parsed),
      sources: input.docs,
      meta: { provider: "anthropic", ms: Date.now() - t0, costUsd, cacheHit: false },
    };
  },
};
