// Per-run event context. lib/agent/run.ts opens one with withRunContext(); lib/exa and lib/llm report
// what they actually do into it (status lines, cost, cache hits), so the activity feed reflects real work.
// AsyncLocalStorage keeps concurrent requests apart without threading a callback through every signature.
// Outside a run (scripts, tests calling the steps directly) every function here is a no-op.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Actor, RunActivity } from "../types";

/** Pipeline progress callback; the caller names who does the work. */
export type Progress = (message: string, actor: Actor) => void;

export type StatusEvent = { type: "status"; message: string; actor: Actor; domain?: string; cached?: boolean };

export type RunMeter = {
  exaCalls: number;
  exaLive: number;
  exaCostUsd: number;
  llmCalls: number;
  llmLive: number;
  /** Non-Exa extractor cost (Exa deep extraction is already in exaCostUsd). */
  llmCostUsd: number;
  activity: RunActivity;
};

export type RunContext = {
  onStatus?: (e: StatusEvent) => void;
  signal?: AbortSignal;
  meter: RunMeter;
};

const storage = new AsyncLocalStorage<RunContext>();

export function newMeter(): RunMeter {
  return { exaCalls: 0, exaLive: 0, exaCostUsd: 0, llmCalls: 0, llmLive: 0, llmCostUsd: 0, activity: { searches: 0, pagesRead: 0, extractions: 0, quotesChecked: 0, quotesDropped: 0 } };
}

export function withRunContext<T>(ctx: RunContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function runContext(): RunContext | undefined {
  return storage.getStore();
}

/** Thrown when the run was aborted (client gone, global timeout) before new work started. */
export class RunAbortedError extends Error {
  constructor() {
    super("run aborted");
    this.name = "RunAbortedError";
  }
}

/** Call before starting a live (paid, slow) call: an aborted run starts no new work. */
export function throwIfAborted(): void {
  if (runContext()?.signal?.aborted) throw new RunAbortedError();
}

/** One line of text: leading/trailing whitespace gone, any run of whitespace (incl. newlines) a single space. */
export const cleanLine = (s: string) => s.replace(/s+/g, " ").trim();

/** One activity-feed line. `actor` is set by the caller, which is the code doing the work. */
export function emitStatus(message: string, extra: { actor: Actor; domain?: string; cached?: boolean }): void {
  const ctx = runContext();
  if (!ctx?.onStatus || ctx.signal?.aborted) return;
  const line = cleanLine(message);
  if (!line) return;
  ctx.onStatus({ type: "status", message: line, actor: extra.actor, ...(extra.domain ? { domain: extra.domain } : {}), ...(extra.cached !== undefined ? { cached: extra.cached } : {}) });
}

/** Count work for the feed's summary line (searches, pages read, extractions, quotes checked/dropped). */
export function countActivity(key: keyof RunActivity, n = 1): void {
  const m = runContext()?.meter;
  if (m) m.activity[key] += n;
}

export function meterExa(hit: boolean, costUsd = 0): void {
  const m = runContext()?.meter;
  if (!m) return;
  m.exaCalls++;
  if (!hit) {
    m.exaLive++;
    m.exaCostUsd += costUsd;
  }
}

export function meterLlm(hit: boolean, costUsd = 0, provider = "anthropic"): void {
  const m = runContext()?.meter;
  if (!m) return;
  m.llmCalls++;
  if (!hit) {
    m.llmLive++;
    if (provider !== "exa") m.llmCostUsd += costUsd;
  }
}

/** "dvv.fi, migri.fi +2" for a status line. */
export function domainList(domains: string[], max = 3): string {
  const unique = [...new Set(domains)];
  return unique.length > max ? `${unique.slice(0, max).join(", ")} +${unique.length - max}` : unique.join(", ");
}
