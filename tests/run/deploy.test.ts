// Deployment (Vercel) guarantees:
// - each homepage example chip opens a saved demo that replays entirely from the git-tracked demo-cache/
//   (as on Vercel: .cache/ is never read, no live call, no passcode), even with LIVE_PASSCODE set;
// - a live run without the right passcode is refused with one "locked" event;
// - the reducer ignores keep-alive pings and returns to the first screen on "locked".
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PipelineEvent } from "../../lib/types";

const saved: Record<string, string | undefined> = {};
const ENV = { VERCEL: "1", LIVE_PASSCODE: "test-pass", LLM_PROVIDER: "anthropic", EXA_LOG: "0", EXA_CACHE: undefined, LLM_CACHE: undefined };

beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function post(body: unknown): Promise<{ status: number; events: PipelineEvent[] }> {
  const { POST } = await import("../../app/api/run/route");
  const res = await POST(
    new Request("http://localhost/api/run?fast=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );
  const events = (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PipelineEvent);
  return { status: res.status, events };
}

describe("homepage example chips open saved demos", async () => {
  const { EXAMPLES, demoHref } = await import("../../components/RunInput");
  const { DEMO_SENTENCES } = await import("../../lib/demo/sentences");

  it("there are three chips: marta, brazil, india", () => {
    expect(EXAMPLES.map((e) => e.key)).toEqual(["marta", "brazil", "india"]);
  });

  for (const ex of EXAMPLES) {
    it(`${ex.key}: links to /?demo=${ex.key} and replays from demo-cache/ only, no live call, no passcode`, async () => {
      const key = new URL(demoHref(ex.key), "http://x").searchParams.get("demo");
      expect(key).toBe(ex.key);
      const text = DEMO_SENTENCES[key as keyof typeof DEMO_SENTENCES];
      expect(text).toBeTruthy();
      const { status, events } = await post({ text });
      expect(status).toBe(200);
      expect(events.some((e) => e.type === "locked")).toBe(false);
      expect(events.filter((e) => e.type === "error")).toEqual([]);
      const done = events.find((e): e is Extract<PipelineEvent, { type: "done" }> => e.type === "done");
      expect(done).toBeTruthy();
      expect(done!.summary.calls.exaLive + done!.summary.calls.llmLive).toBe(0);
      expect(events.filter((e) => e.type === "step").length).toBeGreaterThan(0);
    }, 120_000);
  }
});

describe("live-run passcode (LIVE_PASSCODE)", () => {
  const LIVE = "Canadian designer moving to Turku in March for a job";
  it("refuses a live run with no passcode: one locked event, 401", async () => {
    const { status, events } = await post({ text: LIVE });
    expect(status).toBe(401);
    expect(events).toEqual([{ type: "locked", message: expect.stringMatching(/^Live planning is limited during the hackathon\. Try a saved demo:$/) }]);
  });
  it("refuses a wrong passcode", async () => {
    const { status, events } = await post({ text: LIVE, passcode: "nope" });
    expect(status).toBe(401);
    expect(events[0].type).toBe("locked");
  });
});

describe("cache on Vercel", () => {
  it("never writes, reads demo-cache only; a live run defaults to off, a demo to read", async () => {
    const { cachedCall, modeFromEnv } = await import("../../lib/cache/disk");
    const { withRunContext, newMeter } = await import("../../lib/events/context");
    const dir = await mkdtemp(path.join(os.tmpdir(), "unblock-deploy-"));
    try {
      const r = await cachedCall({ dir: path.join(dir, "c"), mode: "write", label: "T" }, { q: 1 }, async () => 42);
      expect(r.response).toBe(42);
      expect(await readdir(dir)).toEqual([]);
      expect(await withRunContext({ meter: newMeter() }, async () => modeFromEnv("EXA_CACHE"))).toBe("off");
      expect(await withRunContext({ meter: newMeter(), demo: true }, async () => modeFromEnv("LLM_CACHE"))).toBe("read");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("reducer", () => {
  it("ignores pings and goes back to the first screen on locked, keeping the sentence", async () => {
    const { initialRunState, runReducer } = await import("../../lib/ui/runState");
    let s = runReducer(initialRunState, { type: "start", text: "hello", at: 0 });
    expect(runReducer(s, { type: "event", event: { type: "ping" }, at: 1 })).toBe(s);
    s = runReducer(s, { type: "event", event: { type: "locked", message: "m" }, at: 1 });
    expect(s.phase).toBe("idle");
    expect(s.text).toBe("hello");
    expect(s.locked).toBe("m");
  });
});
