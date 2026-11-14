// Exa as the LLM: deep search + outputSchema + systemPrompt. Exa does its own retrieval inside
// includeDomains; the docs in ExtractInput are not sent. Quotes come back as a schema field and are
// verified by lib/agent/verifyCitations, never trusted as-is.
import type { z } from "zod";
import { searchDeep } from "../exa/search";
import { toExaSchema } from "./schema";
import type { ExtractInput, ExtractResult, LlmProvider, LlmTask } from "./types";
import { salvage } from "./salvage";

export const exaProvider: LlmProvider = {
  name: "exa",
  model: "exa-deep",
  async extract<T>(task: LlmTask, input: ExtractInput, schema: z.ZodType<T>): Promise<ExtractResult<T>> {
    const t0 = Date.now();
    const { content, docs, meta } = await searchDeep({
      query: input.query,
      systemPrompt: `${task.systemPrompt}\n\n${input.context}`,
      outputSchema: toExaSchema(schema),
      includeDomains: input.includeDomains,
      extraOfficial: input.extraOfficial,
    });
    return {
      data: salvage(schema, content),
      sources: docs,
      meta: { provider: "exa", ms: Date.now() - t0, costUsd: meta.hit ? 0 : meta.costUsd, cacheHit: meta.hit },
    };
  },
};
