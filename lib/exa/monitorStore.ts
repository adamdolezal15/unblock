// What the monitors found, per plan (runId): .cache/monitors/<runId>.json (OS temp dir where that is read-only).
// The file holds each monitor's webhook secret, so it never leaves the server: `publicView` strips it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RUN_ID } from "../agent/runStore";
import type { Trust } from "../types";

export type ChangeRec = {
  url: string;
  title: string;
  /** YYYY-MM-DD: the page's published date, else the day the run found it. */
  date: string;
  quote?: string;
  monitorId: string;
  stepId: string;
  topic: string;
  trust: Trust;
  /** True for what the first run found (already published when the plan was made): not a change. */
  baseline: boolean;
  /** The Exa monitor run that returned it. */
  runId: string;
  foundAt: string;
};

export type MonitorRec = {
  id: string;
  stepId: string;
  topic: string;
  domains: string[];
  /** The service-news monitor: results older than `maxAgeDays` are not kept. */
  kind?: "news";
  maxAgeDays?: number;
  /** Returned once by Exa at creation; verifies this monitor's webhooks. Never sent to the browser. */
  secret: string;
  /** Exa run ids already ingested (webhook and polling can both deliver the same run). */
  seenRuns: string[];
  /** The first run ingested is the baseline. */
  baselineRunId?: string;
  /** A run was triggered and its result has not been read yet; `before` = the newest run at that moment. */
  pending?: { before: string | null; since: string };
  lastError?: string;
  lastCheckedAt?: string;
};

export type MonitorStore = {
  runId: string;
  createdAt: string;
  webhookUrl: string;
  /** False on localhost: Exa cannot reach it, so results arrive by "Check now". */
  webhookPublic: boolean;
  monitors: MonitorRec[];
  results: ChangeRec[];
};

export type PublicStore = Omit<MonitorStore, "monitors" | "webhookUrl"> & { monitors: Omit<MonitorRec, "secret" | "seenRuns">[]; pending: number };

export const newStore = (runId: string, target: { url: string; public: boolean }): MonitorStore => ({
  runId,
  createdAt: new Date().toISOString(),
  webhookUrl: target.url,
  webhookPublic: target.public,
  monitors: [],
  results: [],
});

export function publicView(s: MonitorStore): PublicStore {
  return {
    runId: s.runId,
    createdAt: s.createdAt,
    webhookPublic: s.webhookPublic,
    results: s.results,
    pending: s.monitors.filter((m) => m.pending).length,
    monitors: s.monitors.map(({ secret: _s, seenRuns: _r, ...m }) => (void _s, void _r, m)),
  };
}

const dirs = () => [...(process.env.VERCEL ? [] : [path.join(process.cwd(), ".cache", "monitors")]), path.join(os.tmpdir(), "unblock-monitors")];

export async function saveStore(s: MonitorStore): Promise<void> {
  if (!RUN_ID.test(s.runId)) throw new Error("invalid runId");
  for (const dir of dirs()) {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${s.runId}.json`), JSON.stringify(s, null, 2), "utf8");
      return;
    } catch {
      // next location
    }
  }
  throw new Error("no writable location for monitors");
}

export async function loadStore(runId: string): Promise<MonitorStore | null> {
  if (!RUN_ID.test(runId)) return null;
  for (const dir of dirs()) {
    try {
      return JSON.parse(await readFile(path.join(dir, `${runId}.json`), "utf8")) as MonitorStore;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return null;
}

// A webhook and a poll can touch the same plan at once: one writer at a time per runId (single server process).
const queues = new Map<string, Promise<unknown>>();
export function withStore<T>(runId: string, fn: (s: MonitorStore | null) => Promise<T>): Promise<T> {
  const next = (queues.get(runId) ?? Promise.resolve()).catch(() => undefined).then(async () => fn(await loadStore(runId)));
  queues.set(runId, next);
  return next;
}

type RunLike = { id: string; status: string; completedAt?: string | null; failReason?: string | null; output?: { results?: Record<string, unknown>[] | null } | null };

/**
 * Reads one finished run into the store. The first run a monitor delivers is its baseline; later runs hold
 * only what Exa had not returned before (dedup), so those are the changes. Same page again: kept once.
 */
export function ingestRun(
  store: MonitorStore,
  monitor: MonitorRec,
  run: RunLike,
  toResults: (m: MonitorRec, run: RunLike, baseline: boolean) => ChangeRec[],
): void {
  if (monitor.seenRuns.includes(run.id)) return;
  monitor.seenRuns.push(run.id);
  monitor.lastCheckedAt = new Date().toISOString();
  if (run.status !== "completed") {
    monitor.lastError = run.failReason ?? run.status;
    return;
  }
  delete monitor.lastError;
  const baseline = !monitor.baselineRunId;
  if (baseline) monitor.baselineRunId = run.id;
  const known = new Set(store.results.map((r) => `${r.monitorId}|${r.url}`));
  for (const r of toResults(monitor, run, baseline)) {
    if (known.has(`${r.monitorId}|${r.url}`)) continue;
    known.add(`${r.monitorId}|${r.url}`);
    store.results.push(r);
  }
}
