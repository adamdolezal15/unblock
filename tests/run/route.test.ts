// POST /api/run end to end, offline from the demo cache (EXA_CACHE=read, LLM_CACHE=read).
// If it fails with "no cached response", run once with network: npm run warm-demo
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import type { PipelineEvent } from "../../lib/types";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

const MARTA = "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto";

type Of<T extends PipelineEvent["type"]> = Extract<PipelineEvent, { type: T }>;

async function post(text: unknown, query = "?fast=1"): Promise<{ res: Response; lines: string[]; events: PipelineEvent[] }> {
  const { POST } = await import("../../app/api/run/route");
  const res = await POST(
    new Request(`http://localhost/api/run${query}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
  const body = await res.text();
  const lines = body.split("\n").filter((l) => l.length);
  return { res, lines, events: lines.map((l) => JSON.parse(l) as PipelineEvent) };
}

describe("POST /api/run: Marta from cache", () => {
  let r: Awaited<ReturnType<typeof post>>;
  beforeAll(async () => {
    r = await post(MARTA);
  }, 60_000);

  it("returns NDJSON: one valid JSON event per line", () => {
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    expect(r.lines.length).toBeGreaterThan(20);
    for (const l of r.lines) expect(() => JSON.parse(l)).not.toThrow();
    for (const e of r.events) expect(typeof e.type).toBe("string");
  });

  it("events arrive in a sensible order", () => {
    const types = r.events.map((e) => e.type);
    const first = (t: PipelineEvent["type"]) => types.indexOf(t);
    const last = (t: PipelineEvent["type"]) => types.lastIndexOf(t);
    expect(types.filter((t) => t === "profile")).toHaveLength(1);
    expect(types.filter((t) => t === "done")).toHaveLength(1);
    expect(types.at(-1)).toBe("done");
    expect(types).not.toContain("error");
    expect(types).not.toContain("partial");
    // profile is the first non-status event; all steps before the graph; graph before tips; tips before schedule
    expect(types.findIndex((t) => t !== "status")).toBe(first("profile"));
    expect(first("step")).toBeGreaterThan(first("profile"));
    expect(last("step")).toBeLessThan(first("graph"));
    expect(first("graph")).toBeLessThan(first("tip"));
    expect(last("tip")).toBeLessThan(first("schedule"));
    expect(first("schedule")).toBeLessThan(first("calendar"));
    expect(first("conflict")).toBeGreaterThan(first("profile"));
    expect(types.filter((t) => t === "status").length).toBeGreaterThan(20);
  });

  it("streams real work: statuses name domains, steps carry verified citations", () => {
    const statuses = r.events.filter((e): e is Of<"status"> => e.type === "status");
    expect(statuses.some((s) => s.domain === "dvv.fi")).toBe(true);
    expect(statuses.some((s) => /quotes/.test(s.message))).toBe(true);
    const steps = r.events.filter((e): e is Of<"step"> => e.type === "step").map((e) => e.step);
    for (const s of steps.filter((s) => !s.milestone)) expect(s.citations.length).toBeGreaterThan(0);
  });

  it("calendar events have Google template links; done summary counts add up", () => {
    const cal = r.events.find((e): e is Of<"calendar"> => e.type === "calendar")!;
    expect(cal.events.length).toBeGreaterThan(0);
    for (const ev of cal.events) expect(ev.googleTemplateUrl).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    const s = (r.events.at(-1) as Of<"done">).summary;
    expect(s.partial).toBe(false);
    expect(s.runId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cal.icsUrl).toBe(`/api/calendar.ics?runId=${s.runId}`);
    expect(s.steps).toBeGreaterThan(5);
    expect(s.inCalendar).toBe(cal.events.filter((e) => e.kind === "visit").length);
    expect(s.criticalPath.stepIds).toContain("dvv_registration");
    expect(s.criticalPath.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.sourcesByTrust.official).toBeGreaterThan(0);
    expect(s.verifiedQuotes).toBeGreaterThan(0);
    expect(s.calls.exaLive + s.calls.llmLive).toBe(0);
    expect(s.costUsd.total).toBe(0);
  });

  it("persists the run and GET /api/calendar.ics?runId= serves it", async () => {
    const s = (r.events.at(-1) as Of<"done">).summary;
    const saved = JSON.parse(await readFile(`.cache/runs/${s.runId}.json`, "utf8"));
    expect(saved.runId).toBe(s.runId);
    expect(saved.steps.length).toBeGreaterThan(0);
    const { GET } = await import("../../app/api/calendar.ics/route");
    const ics = await GET(new Request(`http://localhost/api/calendar.ics?runId=${s.runId}`));
    expect(ics.status).toBe(200);
    const text = await ics.text();
    expect(text).toMatch(/^BEGIN:VCALENDAR/);
    expect((text.match(/BEGIN:VEVENT/g) ?? []).length).toBe(saved.events.length);
    expect((await GET(new Request("http://localhost/api/calendar.ics?runId=nope-missing"))).status).toBe(404);
  });
});

describe("POST /api/run: other inputs", () => {
  it("out-of-scope input returns a single friendly event", async () => {
    const { res, events } = await post("I'm leaving Helsinki for Berlin next month, how do I cancel my Finnish registration?");
    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("out_of_scope");
    expect((events[0] as Of<"out_of_scope">).message.length).toBeGreaterThan(20);
  }, 30_000);

  it("empty body returns a single error event with 400", async () => {
    const { res, events } = await post("   ");
    expect(res.status).toBe(400);
    expect(events).toEqual([expect.objectContaining({ type: "error", recoverable: true })]);
  });
});

describe("activity feed actors", () => {
  it("every status line names its actor, and the summary counts each actor's work", async () => {
    const { readEvents, runStream } = await import("../../lib/agent/runStream");
    const events: PipelineEvent[] = [];
    for await (const e of readEvents(runStream(MARTA, { fast: true, persist: false }))) events.push(e);
    const statuses = events.filter((e): e is Of<"status"> => e.type === "status");
    expect(statuses.every((s) => ["exa", "claude", "check"].includes(s.actor))).toBe(true);
    const by = (a: string) => statuses.filter((s) => s.actor === a).map((s) => s.message);
    expect(by("exa").some((m) => /^Found \d+/.test(m))).toBe(true);
    expect(by("claude").some((m) => /^Understanding|^Extracting/.test(m))).toBe(true);
    expect(by("check").some((m) => /^Verifying \d+ quotes/.test(m))).toBe(true);
    expect(by("check").some((m) => /^Scheduled /.test(m))).toBe(true);
    const done = events.find((e): e is Of<"done"> => e.type === "done")!;
    const a = done.summary.activity;
    expect(a.searches).toBeGreaterThan(0);
    expect(a.pagesRead).toBeGreaterThanOrEqual(0);
    expect(a.extractions).toBeGreaterThan(0);
    expect(a.quotesChecked).toBeGreaterThanOrEqual(a.quotesDropped);
    expect(a.quotesChecked).toBeGreaterThan(0);
  }, 60_000);
});

describe("demo replay", () => {
  it("spaces status lines for a cached demo sentence unless fast", async () => {
    const { readEvents, runStream } = await import("../../lib/agent/runStream");
    const stamps: number[] = [];
    const t0 = Date.now();
    for await (const e of readEvents(runStream(MARTA, { replayDelay: () => 20, persist: false }))) {
      if (e.type === "status") stamps.push(Date.now() - t0);
    }
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
    // with 20 ms per status line, most gaps are >= ~20 ms (timer jitter allowed)
    expect(gaps.filter((g) => g >= 15).length).toBeGreaterThan(gaps.length * 0.8);
  }, 60_000);

  it("paced lines are labelled as a replay", async () => {
    const { readEvents, runStream } = await import("../../lib/agent/runStream");
    const statuses: Of<"status">[] = [];
    for await (const e of readEvents(runStream(MARTA, { replayDelay: () => 0, persist: false }))) if (e.type === "status") statuses.push(e);
    expect(statuses.some((s) => s.replay)).toBe(true);
  }, 60_000);

  it("DEMO_REPLAY=off disables delays and the label", async () => {
    const { readEvents, runStream, replayEnabled } = await import("../../lib/agent/runStream");
    expect(replayEnabled({ DEMO_REPLAY: "off" })).toBe(false);
    expect(replayEnabled({ DEMO_REPLAY: "OFF " })).toBe(false);
    expect(replayEnabled({})).toBe(true);
    const prev = process.env.DEMO_REPLAY;
    process.env.DEMO_REPLAY = "off";
    try {
      let delays = 0;
      const statuses: Of<"status">[] = [];
      const stream = runStream(MARTA, { replayDelay: () => (delays++, 0), persist: false });
      for await (const e of readEvents(stream)) if (e.type === "status") statuses.push(e);
      expect(delays).toBe(0);
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.some((s) => s.replay)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.DEMO_REPLAY;
      else process.env.DEMO_REPLAY = prev;
    }
  }, 60_000);
});
