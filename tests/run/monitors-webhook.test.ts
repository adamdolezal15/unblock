// POST /api/monitors/webhook end to end against a store on disk: signature checked before anything is stored.
import { createHmac } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = `test-monitors-${Date.now().toString(36)}`;
const SECRET = "whsec_test_secret";

const event = (runId: string, monitorId = "mon_1", results: object[] = []) =>
  JSON.stringify({
    id: "event_1",
    object: "event",
    type: "monitor.run.completed",
    createdAt: new Date().toISOString(),
    data: { id: `run_${Math.random().toString(36).slice(2)}`, monitorId, status: "completed", metadata: { runId, stepId: "dvv_registration" }, output: { results } },
  });

const signed = (body: string, secret = SECRET) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
};

async function post(body: string, signature: string | null) {
  const { POST } = await import("../../app/api/monitors/webhook/route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["exa-signature"] = signature;
  return POST(new Request("http://localhost/api/monitors/webhook", { method: "POST", headers, body }));
}

const page = (url: string) => ({ url, title: `Page ${url}`, publishedDate: "2026-11-19T00:00:00Z", highlights: ["A sentence from the page."] });

beforeAll(async () => {
  const { newStore, saveStore } = await import("../../lib/exa/monitorStore");
  const store = newStore(RUN, { url: "https://x.test/api/monitors/webhook", public: true });
  store.monitors.push({ id: "mon_1", stepId: "dvv_registration", topic: "DVV registration", domains: ["dvv.fi"], secret: SECRET, seenRuns: [] });
  await saveStore(store);
});

afterAll(async () => {
  await rm(path.join(process.cwd(), ".cache", "monitors", `${RUN}.json`), { force: true });
});

describe("POST /api/monitors/webhook", () => {
  it("rejects bad JSON, a missing signature, a forged signature and an unknown monitor; stores nothing", async () => {
    const { loadStore } = await import("../../lib/exa/monitorStore");
    expect((await post("not json", null)).status).toBe(400);
    const body = event(RUN, "mon_1", [page("https://dvv.fi/forged")]);
    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, signed(body, "wrong-secret"))).status).toBe(401);
    const stranger = event(RUN, "mon_unknown", [page("https://dvv.fi/x")]);
    expect((await post(stranger, signed(stranger))).status).toBe(404);
    expect((await post(event("no-such-plan"), signed(event("no-such-plan")))).status).toBe(404);
    expect((await loadStore(RUN))!.results).toEqual([]);
  });

  it("a signed event is stored: the first is the baseline, the next one is a change, off-domain pages are ignored", async () => {
    const { loadStore } = await import("../../lib/exa/monitorStore");
    const first = event(RUN, "mon_1", [page("https://dvv.fi/old")]);
    expect((await post(first, signed(first))).status).toBe(200);
    const second = event(RUN, "mon_1", [page("https://dvv.fi/new-rules"), page("https://elsewhere.example/x")]);
    expect((await post(second, signed(second))).status).toBe(200);
    const results = (await loadStore(RUN))!.results;
    expect(results.map((r) => [r.url, r.baseline])).toEqual([
      ["https://dvv.fi/old", true],
      ["https://dvv.fi/new-rules", false],
    ]);
  });

  it("the public view of the plan's watch list has no secret", async () => {
    const { loadStore, publicView } = await import("../../lib/exa/monitorStore");
    expect(JSON.stringify(publicView((await loadStore(RUN))!))).not.toContain(SECRET);
  });
});

describe("GET/POST /api/monitors guards", () => {
  it("refuses to create monitors in offline mode and validates runId", async () => {
    const { POST, GET } = await import("../../app/api/monitors/route");
    const prev = process.env.EXA_CACHE;
    process.env.EXA_CACHE = "read";
    try {
      const res = await POST(new Request("http://localhost/api/monitors", { method: "POST", body: JSON.stringify({ runId: RUN }) }));
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toMatch(/offline/i);
    } finally {
      if (prev === undefined) delete process.env.EXA_CACHE;
      else process.env.EXA_CACHE = prev;
    }
    expect((await POST(new Request("http://localhost/api/monitors", { method: "POST", body: JSON.stringify({ runId: "../x" }) }))).status).toBe(400);
    const none = await GET(new Request("http://localhost/api/monitors?runId=does-not-exist"));
    expect(await none.json()).toEqual({ watching: false });
  });
});
