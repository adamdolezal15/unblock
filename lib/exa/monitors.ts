// Exa Search Monitors ("keep watching it"): POST /monitors, interval trigger, signed webhook, dedup between runs.
// Reference: .agents/skills/build-with-exa/references/monitors.md and https://exa.ai/docs/monitors/quickstart.
//   - A monitor runs a search on an interval and each run returns only results earlier runs did not (Exa dedups).
//   - The create call returns `webhookSecret` ONCE: lib/exa/monitorStore.ts keeps it, the client never sees it.
//   - Webhooks carry `Exa-Signature: t=<timestamp>,v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`.
//   - The create call REQUIRES a webhook, and Exa rejects localhost, private IPs and names that do not resolve.
//     So there is no local placeholder: without MONITOR_WEBHOOK_URL no monitor can be created (see webhookTarget).
//   - The search takes no date filter (Exa drops startPublishedDate silently), so "last 30 days" is applied here.
// Monitors are stateful on Exa's side, so (unlike search) they cannot go through the disk cache: nothing here
// runs unless the user clicks, and never in EXA_CACHE=read mode.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RunRecord } from "../agent/runStore";
import type { Step } from "../types";
import { exa } from "./client";
import { NEWS, OFFICIAL, trustOf } from "./domains";
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
export const NEWS_TOPIC = "Service news affecting your plan";
export const NEWS_MAX_AGE_DAYS = 30;
export const WEBHOOK_PATH = "/api/monitors/webhook";
export const INTERVAL = { type: "interval", period: "7d" } as const;

export type Topic = { stepId: string; topic: string; domains: string[]; query: string; kind?: "news"; maxAgeDays?: number };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const onDomain = (url: string, domains: readonly string[]) => domains.some((d) => hostOf(url) === d || hostOf(url).endsWith(`.${d}`));

/** The official domain (from the fixed list) a host belongs to, if any. */
const officialDomainOf = (host: string) => (OFFICIAL as readonly string[]).find((d) => host === d || host.endsWith(`.${d}`));

/**
 * One topic per key step of the plan, slowest chain first, at most MAX_MONITORS. Scoped to the step's authority
 * domain, else to the official domain of its own citations; steps with neither (banks, universities) are skipped:
 * these monitors watch only official pages.
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

/**
 * The one extra monitor: service news (Yle, HS, Helsinki Times, and the plan's authorities' own pages) about
 * the authorities of this plan in the person's city, e.g. "DVV Migri Vero Oulu service point closed OR changes OR strike".
 * Only results from the last 30 days count.
 */
export function newsTopic(run: Pick<RunRecord, "steps" | "profile">): Topic {
  const authorities = Object.keys(AUTHORITY_DOMAIN).filter((a) => run.steps.some((s) => s.authority === a && !s.done));
  const officials = authorities.map((a) => AUTHORITY_DOMAIN[a]);
  const city = run.profile?.city ?? "";
  return {
    stepId: "service_news",
    topic: NEWS_TOPIC,
    kind: "news",
    maxAgeDays: NEWS_MAX_AGE_DAYS,
    domains: [...NEWS, ...officials],
    query: `${[...authorities, city].filter(Boolean).join(" ")} service point closed OR changes OR strike`,
  };
}

/** Where Exa should post: the person's own public URL (a tunnel to this server). Null when none is set. */
export function webhookTarget(env: Record<string, string | undefined> = process.env): { url: string | null; public: boolean } {
  const raw = env.MONITOR_WEBHOOK_URL?.trim();
  if (!raw) return { url: null, public: false };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { url: null, public: false };
  }
  // An origin alone means "this server": the route path is added. Any other path is used as given (a placeholder
  // that only satisfies Exa's check; nothing of ours listens there, so results arrive by "Check now").
  const ours = u.pathname === "/" || u.pathname.replace(/\/+$/, "") === WEBHOOK_PATH;
  const url = u.pathname === "/" ? `${u.origin}${WEBHOOK_PATH}` : u.href;
  const privateHost = /^(localhost$|127\.|10\.|192\.168\.|0\.0\.0\.0$)/.test(u.hostname) || u.hostname.endsWith(".local");
  return { url, public: ours && u.protocol === "https:" && !privateHost };
}

export class WebhookNotConfigured extends Error {
  constructor() {
    super("MONITOR_WEBHOOK_URL is not set");
  }
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

/**
 * What a finished monitor run found, as stored changes. Only pages on the monitor's own domains; a monitor with
 * `maxAgeDays` (service news) keeps only pages published within that many days (undated pages are dropped).
 */
export function resultsOf(
  monitor: Pick<MonitorRec, "id" | "stepId" | "topic" | "domains" | "maxAgeDays">,
  run: { id: string; completedAt?: string | null; output?: { results?: Record<string, unknown>[] | null } | null },
  baseline: boolean,
  nowMs: number = Date.now(),
): ChangeRec[] {
  const out: ChangeRec[] = [];
  for (const r of run.output?.results ?? []) {
    const url = typeof r.url === "string" ? r.url : "";
    if (!url || !onDomain(url, monitor.domains)) continue;
    const highlights = Array.isArray(r.highlights) ? (r.highlights as unknown[]).filter((h): h is string => typeof h === "string") : [];
    const published = typeof r.publishedDate === "string" ? r.publishedDate : undefined;
    if (monitor.maxAgeDays !== undefined) {
      const at = published ? Date.parse(published) : NaN;
      if (!Number.isFinite(at) || nowMs - at > monitor.maxAgeDays * 86_400_000) continue;
    }
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

/**
 * One monitor per key topic, plus the service-news monitor; all weekly. A first run then learns what is already
 * there (the baseline). All or nothing: if one call fails, the monitors already created are deleted again.
 */
export async function createPlanMonitors(run: Pick<RunRecord, "runId" | "steps" | "criticalPath" | "profile">): Promise<MonitorStore> {
  const target = webhookTarget();
  if (!target.url) throw new WebhookNotConfigured();
  const topics = [...monitorTopics(run), newsTopic(run)];
  const store = newStore(run.runId, { url: target.url, public: target.public });
  try {
    for (const t of topics) {
      const m = await exa().monitors.create({
        name: `Unblock: ${t.topic}`,
        search: { query: t.query, numResults: 5, includeDomains: t.domains, contents: { highlights: true } },
        trigger: INTERVAL,
        webhook: { url: target.url, events: ["monitor.run.completed"] },
        metadata: { runId: run.runId, stepId: t.stepId },
      });
      store.monitors.push({
        id: m.id,
        stepId: t.stepId,
        topic: t.topic,
        domains: t.domains,
        secret: m.webhookSecret,
        seenRuns: [],
        ...(t.kind ? { kind: t.kind } : {}),
        ...(t.maxAgeDays !== undefined ? { maxAgeDays: t.maxAgeDays } : {}),
        pending: { before: null, since: new Date().toISOString() },
      });
      // The first run only tells us what is already published: it is the baseline, not a change.
      await exa().monitors.trigger(m.id).catch(() => undefined);
    }
  } catch (e) {
    await deletePlanMonitors(store);
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
