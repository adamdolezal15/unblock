// Timeout and disconnect paths of lib/agent/run. Community tips are mocked to never finish, so the
// global deadline hits after the steps are in: the run must still deliver a usable partial plan.
import { describe, expect, it, vi } from "vitest";
import type { PipelineEvent } from "../../lib/types";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

vi.mock("../../lib/agent/findCommunityTips", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agent/findCommunityTips")>();
  return { ...real, findCommunityTips: () => new Promise(() => {}) };
});

const MARTA = "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto";
const TODAY = "2026-11-14";

type Of<T extends PipelineEvent["type"]> = Extract<PipelineEvent, { type: T }>;

describe("run timeout", () => {
  it("emits what it has, a partial event, and done", async () => {
    const { readEvents, runStream } = await import("../../lib/agent/runStream");
    const t0 = Date.now();
    const events: PipelineEvent[] = [];
    for await (const e of readEvents(runStream(MARTA, { fast: true, timeoutMs: 4000, today: TODAY, persist: false }))) events.push(e);
    const types = events.map((e) => e.type);
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(types).toContain("profile");
    expect(types).toContain("step");
    expect(types).toContain("graph");
    expect(types).not.toContain("tip");
    // schedule + calendar are completed from the steps we have (waits from cited times / defaults)
    expect(types).toContain("schedule");
    expect(types).toContain("calendar");
    const partial = events.find((e): e is Of<"partial"> => e.type === "partial")!;
    expect(partial.reason).toBe("timeout");
    expect(partial.missing.join(" ")).toMatch(/community tips/);
    expect(types.indexOf("partial")).toBeLessThan(types.indexOf("done"));
    expect(types.at(-1)).toBe("done");
    const done = events.at(-1) as Of<"done">;
    expect(done.summary.partial).toBe(true);
    expect(done.summary.steps).toBeGreaterThan(0);
    expect(done.summary.tips).toBe(0);
  }, 30_000);
});

describe("client disconnect", () => {
  it("stops emitting once the request is aborted", async () => {
    const { run } = await import("../../lib/agent/run");
    const ac = new AbortController();
    const seen: PipelineEvent[] = [];
    const outcome = await run(MARTA, {
      signal: ac.signal,
      today: TODAY,
      persist: false,
      onEvent: (e) => {
        seen.push(e);
        if (e.type === "profile") ac.abort();
      },
    });
    expect(outcome.kind).toBe("aborted");
    expect(seen.at(-1)?.type).toBe("profile");
    expect(seen.map((e) => e.type)).not.toContain("done");
  }, 30_000);
});
