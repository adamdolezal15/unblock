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
  it("defaults to exa", () => expect(resolveProviderName({})).toBe("exa"));
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
