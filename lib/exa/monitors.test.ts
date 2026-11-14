import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Step } from "../types";
import { ingestRun, newStore, publicView, type MonitorRec } from "./monitorStore";
import { MAX_MONITORS, monitorTopics, resultsOf, verifyWebhookSignature, webhookTarget } from "./monitors";

const sign = (body: string, secret: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("verifyWebhookSignature (Exa-Signature: t=<ts>,v1=<hex HMAC-SHA256 of '<ts>.<raw body>'>)", () => {
  const body = '{"type":"monitor.run.completed","data":{"id":"run_1"}}';
  const now = 1_800_000_000_000;
  const t = Math.floor(now / 1000);

  it("accepts a correct signature (timestamp in seconds or milliseconds)", () => {
    expect(verifyWebhookSignature(body, sign(body, "s3cret", t), "s3cret", { nowMs: now })).toBe(true);
    expect(verifyWebhookSignature(body, sign(body, "s3cret", now), "s3cret", { nowMs: now })).toBe(true);
  });
  it("rejects a wrong secret, a changed body, a missing or malformed header", () => {
    expect(verifyWebhookSignature(body, sign(body, "other", t), "s3cret", { nowMs: now })).toBe(false);
    expect(verifyWebhookSignature(body + " ", sign(body, "s3cret", t), "s3cret", { nowMs: now })).toBe(false);
    expect(verifyWebhookSignature(body, null, "s3cret", { nowMs: now })).toBe(false);
    expect(verifyWebhookSignature(body, "garbage", "s3cret", { nowMs: now })).toBe(false);
    expect(verifyWebhookSignature(body, `t=${t},v1=abc`, "s3cret", { nowMs: now })).toBe(false);
  });
  it("rejects a replay: a valid signature with an old timestamp", () => {
    expect(verifyWebhookSignature(body, sign(body, "s3cret", t - 3600), "s3cret", { nowMs: now })).toBe(false);
  });
});

const step = (id: string, authority: string, extra: Partial<Step> = {}): Step => ({
  id,
  title: `${id} title (${authority})`,
  authority,
  mode: "in_person",
  requires: [],
  citations: [],
  ...extra,
});

describe("monitorTopics", () => {
  it("one topic per key step on its authority's official domain, slowest chain first; banks and derived steps are not watched", () => {
    const steps = [
      step("kela_registration", "Kela"),
      step("bank_account", "Your bank", { citations: [{ url: "https://www.op.fi/x", quote: "q", trust: "provider", fetchedAt: "" }] }),
      step("dvv_registration", "DVV"),
      step("police_identification", "Police", { derived: true }),
      step("personal_identity_code", "any", { milestone: true }),
      step("tax_card", "Vero"),
    ];
    const topics = monitorTopics({ steps, criticalPath: { stepIds: ["dvv_registration"], totalDays: 1, calendarDays: 1 } });
    expect(topics.map((t) => t.stepId)).toEqual(["dvv_registration", "kela_registration", "tax_card"]);
    expect(topics.map((t) => t.domains)).toEqual([["dvv.fi"], ["kela.fi"], ["vero.fi"]]);
    expect(topics[0].topic).toBe("dvv_registration title");
  });

  it("falls back to the official domain of the step's own citations, and caps the number of monitors", () => {
    const viaCitation = step("university_enrolment", "Your university", { citations: [{ url: "https://www.infopankki.fi/en/x", quote: "q", trust: "official", fetchedAt: "" }] });
    expect(monitorTopics({ steps: [viaCitation] })[0].domains).toEqual(["infopankki.fi"]);
    const many = Array.from({ length: 12 }, (_, i) => step(`s${i}`, "DVV"));
    expect(monitorTopics({ steps: many })).toHaveLength(MAX_MONITORS);
  });
});

describe("webhookTarget", () => {
  it("uses a public https URL from the env, and says when there is none", () => {
    expect(webhookTarget({ MONITOR_WEBHOOK_URL: "https://abc.ngrok.app" })).toEqual({ url: "https://abc.ngrok.app/api/monitors/webhook", public: true });
    expect(webhookTarget({ MONITOR_WEBHOOK_URL: "http://localhost:3000" }).public).toBe(false);
    expect(webhookTarget({}).public).toBe(false);
  });
});

describe("baseline vs change", () => {
  const monitor = (): MonitorRec => ({ id: "m1", stepId: "dvv_registration", topic: "DVV registration", domains: ["dvv.fi"], secret: "s", seenRuns: [] });
  const run = (id: string, urls: string[]) => ({
    id,
    status: "completed",
    completedAt: "2026-11-20T10:00:00Z",
    output: { results: urls.map((url) => ({ url, title: `Page ${url}`, publishedDate: "2026-11-19T00:00:00Z", highlights: ["A sentence from the page."] })) },
  });
  const to = (m: MonitorRec, r: Parameters<typeof resultsOf>[1], baseline: boolean) => resultsOf(m, r, baseline);

  it("the first run is the baseline; later runs are changes; the same page is kept once; other domains are dropped", () => {
    const store = newStore("r1", { url: "https://x.test/hook", public: true });
    const m = monitor();
    store.monitors.push(m);
    ingestRun(store, m, run("run1", ["https://dvv.fi/a", "https://evil.example/b"]), to);
    expect(store.results.map((r) => [r.url, r.baseline])).toEqual([["https://dvv.fi/a", true]]);
    ingestRun(store, m, run("run2", ["https://dvv.fi/a", "https://dvv.fi/new"]), to);
    ingestRun(store, m, run("run2", ["https://dvv.fi/again"]), to); // the same run delivered twice (webhook + poll)
    expect(store.results.map((r) => [r.url, r.baseline])).toEqual([
      ["https://dvv.fi/a", true],
      ["https://dvv.fi/new", false],
    ]);
    expect(store.results[1]).toMatchObject({ title: "Page https://dvv.fi/new", date: "2026-11-19", topic: "DVV registration", trust: "official", quote: "A sentence from the page." });
  });

  it("a failed run is recorded as a calm error, not a result", () => {
    const store = newStore("r1", { url: "https://x.test/hook", public: true });
    const m = monitor();
    ingestRun(store, m, { id: "run1", status: "failed", failReason: "search_failed" }, to);
    expect(m.lastError).toBe("search_failed");
    expect(store.results).toEqual([]);
  });

  it("the public view never carries webhook secrets", () => {
    const store = newStore("r1", { url: "https://x.test/hook", public: false });
    store.monitors.push({ ...monitor(), secret: "TOPSECRET" });
    expect(JSON.stringify(publicView(store))).not.toContain("TOPSECRET");
    expect(JSON.stringify(publicView(store))).not.toContain("x.test/hook");
  });
});
