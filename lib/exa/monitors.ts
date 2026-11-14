// Exa Search Monitors ("keep watching it"): POST /monitors, interval trigger, signed webhook, dedup between runs.
// Reference: .agents/skills/build-with-exa/references/monitors.md and https://exa.ai/docs/monitors/quickstart.
//   - A monitor runs a search on an interval and each run returns only results earlier runs did not (Exa dedups).
//   - The create call returns `webhookSecret` ONCE: lib/exa/monitorStore.ts keeps it, the client never sees it.
//   - Webhooks carry `Exa-Signature: t=<timestamp>,v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`.
// Monitors are stateful on Exa's side, so (unlike search) they cannot go through the disk cache: nothing here
// runs unless the user clicks, and never in EXA_CACHE=read mode.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RunRecord } from "../agent/runStore";
import type { Step } from "../types";
import { exa } from "./client";
import { OFFICIAL, trustOf } from "./domains";
import { newStore, type ChangeRec, type MonitorRec, type MonitorStore } from "./monitorStore";

/** Who you deal with -> the official domain to scope that monitor to. Banks and universities are not watched. */
const AUTHORITY_DOMAIN: Record<string, string> = {
  Migri: "migri.fi",
  DVV: "dvv.fi",
  Vero: "vero.fi",
  Kela: "kela.fi",
  Police: "poliisi.fi",
};

export const MAX_MONITORS = 6;
export const WEBHOOK_PATH = "/api/monitors/webhook";
export const INTERVAL = { type: "interval", period: "7d" } as const;

export type Topic = { stepId: string; topic: string; domains: string[]; query: string };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const onDomain = (url: string, domains: string[]) => domains.some((d) => hostOf(url) === d || hostOf(url).endsWith(`.${d}`));

/** The official domain (from the fixed list) a host belongs to, if any. */
const officialDomainOf = (host: string) => (OFFICIAL as readonly string[]).find((d) => host === d || host.endsWith(`.${d}`));

/**
 * One topic per key step of the plan, slowest chain first, at most MAX_MONITORS. Scoped to the step's authority
 * domain, else to the official domain of its own citations; steps with neither (banks, universities) are skipped:
 * we watch only official pages.
 */
export function monitorTopics(run: Pick<RunRecord, "steps" | "criticalPath">): Topic[] {
  const critical = new Set(run.criticalPath?.stepIds ?? []);
  const steps = run.steps.filter((s: Step) => !s.milestone && !s.done && !s.derived);
  const ranked = [...steps].sort((a, b) => Number(critical.has(b.id)) - Number(critical.has(a.id)));
  const out: Topic[] = [];
  for (const s of ranked) {
    const own = [...new Set(s.citations.filter((c) => c.trust === "official").map((c) => officialDomainOf(hostOf(c.url))).filter((d): d is string => !!d))];
    const domains = AUTHORITY_DOMAIN[s.authority] ? [AUTHORITY_DOMAIN[s.authority]] : own.slice(0, 2);
    if (!domains.length) continue;
    const topic = s.title.replace(/\s*\([^)]*\)\s*$/, "").trim();
    out.push({ stepId: s.id, topic, domains, query: `${topic} in Finland: changes, updates and new requirements` });
    if (out.length >= MAX_MONITORS) break;
  }
  return out;
}

/** Where Exa should post. localhost and private addresses are rejected by Exa, so a public URL comes from the env. */
export function webhookTarget(env: Record<string, string | undefined> = process.env): { url: string; public: boolean } {
  const base = env.MONITOR_WEBHOOK_URL?.trim();
  if (!base) return { url: `https://exa.ai/unblock-webhook-not-configured`, public: false };
  const url = base.endsWith(WEBHOOK_PATH) ? base : `${base.replace(/\/+$/, "")}${WEBHOOK_PATH}`;
  const host = hostOf(url);
  const isPublic = url.startsWith("https://") && !!host && !/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(host);
  return { url, public: isPublic };
}

/** `Exa-Signature: t=<timestamp>,v1=<signature>`. Constant-time compare; rejects a timestamp more than `toleranceMs` off. */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, opts: { nowMs?: number; toleranceMs?: number } = {}): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const stamp = Number(t);
  if (!Number.isFinite(stamp)) return false;
  const ms = stamp > 1e12 ? stamp : stamp * 1000; // seconds or milliseconds
  return Math.abs((opts.nowMs ?? Date.now()) - ms) <= (opts.toleranceMs ?? 10 * 60_000);
}

/** What a finished monitor run found, as stored changes. Only pages on the monitor's own official domains. */
export function resultsOf(
  monitor: Pick<MonitorRec, "id" | "stepId" | "topic" | "domains">,
  run: { id: string; completedAt?: string | null; output?: { results?: Record<string, unknown>[] | null } | null },
  baseline: boolean,
): ChangeRec[] {
  const out: ChangeRec[] = [];
  for (const r of run.output?.results ?? []) {
    const url = typeof r.url === "string" ? r.url : "";
    if (!url || !onDomain(url, monitor.domains)) continue;
    const highlights = Array.isArray(r.highlights) ? (r.highlights as unknown[]).filter((h): h is string => typeof h === "string") : [];
    const published = typeof r.publishedDate === "string" ? r.publishedDate : undefined;
    out.push({
      url,
      title: (typeof r.title === "string" && r.title.trim()) || hostOf(url),
      date: (published ?? run.completedAt ?? new Date().toISOString()).slice(0, 10),
      ...(highlights[0] ? { quote: highlights[0] } : {}),
      monitorId: monitor.id,
      stepId: monitor.stepId,
      topic: monitor.topic,
      trust: trustOf(url),
      baseline,
      runId: run.id,
      foundAt: new Date().toISOString(),
    });
  }
  return out;
}

/** One monitor per topic, weekly, scoped to the authority's domain; then a first run to learn what is already there. */
export async function createPlanMonitors(run: Pick<RunRecord, "runId" | "steps" | "criticalPath">): Promise<MonitorStore> {
  const topics = monitorTopics(run);
  const target = webhookTarget();
  const store = newStore(run.runId, target);
  try {
    for (const t of topics) {
    const m = await exa().monitors.create({
      name: `Unblock: ${t.topic}`,
      search: { query: t.query, numResults: 5, includeDomains: t.domains, contents: { highlights: true } },
      trigger: INTERVAL,
      webhook: { url: target.url, events: ["monitor.run.completed"] },
      metadata: { runId: run.runId, stepId: t.stepId },
    });
    store.monitors.push({ id: m.id, stepId: t.stepId, topic: t.topic, domains: t.domains, secret: m.webhookSecret, seenRuns: [], pending: { before: null, since: new Date().toISOString() } });
    // The first run only tells us what is already published: it is the baseline, not a change.
    await exa().monitors.trigger(m.id).catch(() => undefined);
    }
  } catch (e) {
    await deletePlanMonitors(store); // all or nothing: no half-watched plan left running on Exa
    throw e;
  }
  return store;
}

/** Newest run of a monitor (Exa lists runs; we sort by creation time ourselves). */
export async function latestRun(monitorId: string) {
  const { data } = await exa().monitors.runs.list(monitorId, { limit: 5 });
  return [...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** "Check now": remember the newest run, trigger a new one. Resolved later by `collectPending`. */
export async function triggerCheck(m: MonitorRec): Promise<void> {
  const before = await latestRun(m.id);
  await exa().monitors.trigger(m.id);
  m.pending = { before: before?.id ?? null, since: new Date().toISOString() };
}

export async function deletePlanMonitors(store: MonitorStore): Promise<void> {
  await Promise.allSettled(store.monitors.map((m) => exa().monitors.delete(m.id)));
}
