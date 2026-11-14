import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StepExtraction } from "../prompts/extractStep";
import { resolveProviderName } from "./index";
import { salvage } from "./salvage";
import { schemaStats, toExaSchema } from "./schema";

describe("toExaSchema", () => {
  it("StepExtraction fits Exa limits", () => {
    const json = toExaSchema(StepExtraction);
    expect(schemaStats(json)).toEqual({ properties: 6, depth: 2 });
    expect(json).not.toHaveProperty("$schema");
  });

  it("rejects too-deep schemas", () => {
    const deep = z.object({ a: z.object({ b: z.object({ c: z.string() }) }) });
    expect(() => toExaSchema(deep)).toThrow(/depth 3/);
  });
});

describe("resolveProviderName", () => {
  it("defaults to anthropic when keyed, else exa", () => {
    expect(resolveProviderName({ ANTHROPIC_API_KEY: "x" })).toBe("anthropic");
    expect(resolveProviderName({})).toBe("exa");
    expect(resolveProviderName({ LLM_PROVIDER: "exa", ANTHROPIC_API_KEY: "x" })).toBe("exa");
  });
  it("anthropic needs a key", () => {
    expect(resolveProviderName({ LLM_PROVIDER: "anthropic" })).toBe("exa");
    expect(resolveProviderName({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "x" })).toBe("anthropic");
  });
});

describe("salvage", () => {
  it("keeps valid claims when one is malformed", () => {
    const good = { kind: "applies", value: "yes", url: "https://dvv.fi", quote: "q" };
    const out = salvage(StepExtraction, { title: "T", claims: [good, { kind: "nonsense" }] });
    expect(out?.claims).toEqual([good]);
  });
  it("null for garbage", () => expect(salvage(StepExtraction, "oops")).toBeNull());
});

describe("llm cache key", () => {
  it("changes with provider, model, prompt version and docs; ignores doc order of domains", async () => {
    const { llmCacheKey } = await import("./index");
    const task = { name: "t", version: "1", systemPrompt: "p" };
    const doc = { url: "https://dvv.fi", title: "x", domain: "dvv.fi", trust: "official" as const, highlights: ["a"], fetchedAt: "now" };
    const input = { query: "q", context: "c", includeDomains: ["b.fi", "a.fi"], docs: [doc] };
    const base = llmCacheKey({ name: "anthropic", model: "m" }, task, input, StepExtraction);
    expect(llmCacheKey({ name: "exa", model: "m" }, task, input, StepExtraction)).not.toEqual(base);
    expect(llmCacheKey({ name: "anthropic", model: "m2" }, task, input, StepExtraction)).not.toEqual(base);
    expect(llmCacheKey({ name: "anthropic", model: "m" }, { ...task, version: "2" }, input, StepExtraction)).not.toEqual(base);
    expect(
      llmCacheKey({ name: "anthropic", model: "m" }, task, { ...input, docs: [{ ...doc, highlights: ["b"] }] }, StepExtraction),
    ).not.toEqual(base);
    expect(
      llmCacheKey({ name: "anthropic", model: "m" }, task, { ...input, includeDomains: ["a.fi", "b.fi"] }, StepExtraction),
    ).toEqual(base);
  });

  it("anthropic in LLM_CACHE=read needs no key", () => {
    expect(resolveProviderName({ LLM_PROVIDER: "anthropic", LLM_CACHE: "read" })).toBe("anthropic");
  });
});
