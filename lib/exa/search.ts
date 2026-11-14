// Typed, cached wrappers around Exa /search and /contents. All Exa traffic goes through here.
// Request shapes follow .agents/skills/build-with-exa: highlights inside `contents`,
// `objective` on every pipeline search, includeDomains only for the official layer.
import type { ExaDoc } from "../types";
import { cached } from "./cache";
import { exa } from "./client";
import { cityDomains, officialDomains, PROVIDER, trustOf, UNIVERSITY } from "./domains";

/** Dev budget from CLAUDE.md: numResults <= 5. */
export const DEFAULT_NUM_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 25_000;
const DEEP_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = 700;

function isRetryable(e: unknown): boolean {
  const err = e as { status?: number; statusCode?: number; name?: string; message?: string };
  const status = err?.status ?? err?.statusCode;
  if (typeof status === "number") return status >= 500;
  if (err?.name === "ExaTimeoutError") return false; // already waited the full timeout
  return /fetch failed|network|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket/i.test(`${err?.name} ${err?.message}`);
}

/** Retry once on network error / 5xx with a short backoff. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isRetryable(e)) throw e;
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    return fn();
  }
}

// In-flight limiter for live Exa calls (cache hits never take a slot). EXA_CONCURRENCY, default 6.
let active = 0;
const waiting: (() => void)[] = [];
function maxConcurrency(): number {
  const n = Number(process.env.EXA_CONCURRENCY);
  return Number.isFinite(n) && n > 0 ? n : 6;
}
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= maxConcurrency()) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Per-run meter: what the pipeline spent on Exa. Reset at the start of a run. */
export type ExaStats = {
  calls: number; // every helper call, cached or live
  live: number;
  cached: number;
  costUsd: number; // live calls only (cache hits are free)
  byHelper: Record<string, { live: number; cached: number; costUsd: number }>;
};
let stats: ExaStats = emptyStats();
function emptyStats(): ExaStats {
  return { calls: 0, live: 0, cached: 0, costUsd: 0, byHelper: {} };
}
export function resetExaStats(): void {
  stats = emptyStats();
}
export function exaStats(): ExaStats {
  return structuredClone(stats);
}

/** One log line per call (EXA_LOG=0 silences it) and one meter entry. Never includes keys. */
function logCall(helper: string, query: string, meta: SearchMeta, results: number) {
  stats.calls++;
  const h = (stats.byHelper[helper] ??= { live: 0, cached: 0, costUsd: 0 });
  if (meta.hit) {
    stats.cached++;
    h.cached++;
  } else {
    stats.live++;
    h.live++;
    stats.costUsd += meta.costUsd ?? 0;
    h.costUsd += meta.costUsd ?? 0;
  }
  if (process.env.EXA_LOG === "0") return;
  const cost = meta.costUsd !== undefined ? ` cost=$${meta.costUsd}` : "";
  console.log(`[exa] ${helper} "${query.slice(0, 80)}" ${meta.ms}ms results=${results}${cost}${meta.hit ? " (cache)" : ""}`);
}

/** Subset of the Exa /search response we rely on (see docs/exa-response-shapes.md). */
export type RawResult = {
  id: string;
  url: string;
  title: string | null;
  publishedDate?: string;
  author?: string;
  highlights?: string[];
  text?: string;
};
export type RawGrounding = {
  field: string;
  citations: { url: string; title: string }[];
  confidence: "low" | "medium" | "high";
};
export type RawSearchResponse = {
  requestId: string;
  results: RawResult[];
  output?: { content: string | Record<string, unknown>; grounding: RawGrounding[] };
  resolvedSearchType?: string;
  searchTime?: number;
  costDollars?: { total?: number } & Record<string, unknown>;
  warnings?: { code: string; path: string; message: string }[];
  notices?: { code: string; path: string; message: string }[];
};

export type SearchMeta = { hit: boolean; ms: number; requestId: string; costUsd?: number; fetchedAt: string };

export type SearchRequest = {
  query: string;
  objective?: string;
  type?: "auto" | "deep" | "deep-lite";
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  outputSchema?: Record<string, unknown>;
  systemPrompt?: string;
  contents?: { highlights?: true; text?: { maxCharacters: number } };
};

/** Low-level cached /search. Prefer searchOfficial / searchCommunity in pipeline code. */
export async function exaSearch(req: SearchRequest): Promise<{ response: RawSearchResponse; meta: SearchMeta }> {
  const { query, ...options } = req;
  const timeout = req.type?.startsWith("deep") ? DEEP_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const r = await cached<RawSearchResponse>({ endpoint: "search", ...req }, async () => {
    // exa-js overloads are keyed on the contents generic; our request type is the narrower contract.
    const res = await limited(() => withRetry(() => exa().search(query, { ...options, timeout } as never)));
    return JSON.parse(JSON.stringify(res)) as RawSearchResponse;
  });
  return {
    response: r.response,
    meta: {
      hit: r.hit,
      ms: r.ms,
      requestId: r.response.requestId,
      costUsd: r.response.costDollars?.total,
      fetchedAt: r.fetchedAt,
    },
  };
}

function toDocs(response: RawSearchResponse, fetchedAt: string, extraOfficial: string[]): ExaDoc[] {
  return response.results.map((r) => ({
    url: r.url,
    title: r.title ?? r.url,
    domain: new URL(r.url).hostname.replace(/^www./, ""),
    trust: trustOf(r.url, extraOfficial),
    highlights: r.highlights ?? [],
    text: r.text,
    publishedDate: r.publishedDate,
    fetchedAt,
  }));
}

/** Official layer: hard allowlist = SPEC official domains + the profile city's municipal domain. */
export async function searchOfficial(args: {
  query: string;
  objective: string;
  city?: string;
  includeUniversities?: boolean;
  numResults?: number;
}): Promise<{ docs: ExaDoc[]; meta: SearchMeta }> {
  const includeDomains = [
    ...officialDomains(args.city),
    ...(args.includeUniversities ? UNIVERSITY : []),
  ];
  const { response, meta } = await exaSearch({
    query: args.query,
    objective: args.objective,
    type: "auto",
    numResults: args.numResults ?? DEFAULT_NUM_RESULTS,
    includeDomains,
    contents: { highlights: true },
  });
  logCall("searchOfficial", args.query, meta, response.results.length);
  return { docs: toDocs(response, meta.fetchedAt, cityDomains(args.city)), meta };
}

/** Provider layer: only bank / service-provider domains, to find what providers themselves state. */
export async function searchProvider(
  query: string,
  opts: { objective?: string; numResults?: number } = {},
): Promise<{ docs: ExaDoc[]; meta: SearchMeta }> {
  const { response, meta } = await exaSearch({
    query,
    objective: opts.objective ?? query,
    type: "auto",
    numResults: opts.numResults ?? DEFAULT_NUM_RESULTS,
    includeDomains: [...PROVIDER],
    contents: { highlights: true },
  });
  logCall("searchProvider", query, meta, response.results.length);
  return { docs: toDocs(response, meta.fetchedAt, []), meta };
}

/** Community layer: no domain filter; source preference lives in `objective`. */
export async function searchCommunity(args: {
  query: string;
  objective: string;
  city?: string;
  numResults?: number;
}): Promise<{ docs: ExaDoc[]; meta: SearchMeta }> {
  const { response, meta } = await exaSearch({
    query: args.query,
    objective: args.objective,
    type: "auto",
    numResults: args.numResults ?? DEFAULT_NUM_RESULTS,
    excludeDomains: officialDomains(args.city),
    contents: { highlights: true },
  });
  logCall("searchCommunity", args.query, meta, response.results.length);
  return { docs: toDocs(response, meta.fetchedAt, cityDomains(args.city)), meta };
}

/**
 * /contents for known URLs: full page text capped by maxCharacters, optional subpage crawl.
 * On /contents, `text` is top-level (not nested in `contents`).
 */
export async function getPages(
  urls: string[],
  opts: { maxCharacters?: number; subpages?: number; subpageTarget?: string | string[]; extraOfficial?: string[] } = {},
): Promise<{ docs: ExaDoc[]; meta: SearchMeta }> {
  const maxCharacters = opts.maxCharacters ?? 20_000;
  const options = {
    text: { maxCharacters },
    ...(opts.subpages ? { subpages: opts.subpages } : {}),
    ...(opts.subpageTarget ? { subpageTarget: opts.subpageTarget } : {}),
  };
  const r = await cached<RawSearchResponse>(
    { endpoint: "contents", urls: [...urls].sort(), ...options },
    async () => {
      const res = await limited(() =>
        withRetry(() => exa().getContents(urls, { ...options, timeout: DEFAULT_TIMEOUT_MS } as never)),
      );
      return JSON.parse(JSON.stringify(res)) as RawSearchResponse;
    },
  );
  const meta: SearchMeta = { hit: r.hit, ms: r.ms, requestId: r.response.requestId, costUsd: r.response.costDollars?.total, fetchedAt: r.fetchedAt };
  logCall("getPages", urls.join(","), meta, r.response.results.length);
  return { docs: toDocs(r.response, r.fetchedAt, opts.extraOfficial ?? []), meta };
}

/**
 * Deep search with structured output (used by lib/llm's exa provider for extraction).
 * Returns the parsed `output.content` plus the result docs Exa read, so callers can verify quotes
 * against them. `output.grounding` is url+title only (no quotes), so it is not used for verification.
 */
export async function searchDeep(args: {
  query: string;
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  includeDomains: string[];
  extraOfficial?: string[];
  numResults?: number;
}): Promise<{ content: unknown; docs: ExaDoc[]; meta: SearchMeta }> {
  const { response, meta } = await exaSearch({
    query: args.query,
    type: "deep",
    numResults: args.numResults ?? DEFAULT_NUM_RESULTS,
    includeDomains: args.includeDomains,
    systemPrompt: args.systemPrompt,
    outputSchema: args.outputSchema,
    contents: { highlights: true },
  });
  logCall("searchDeep", args.query, meta, response.results.length);
  let content: unknown = response.output?.content ?? null;
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch {
      // leave as string; caller's schema validation reports it
    }
  }
  return { content, docs: toDocs(response, meta.fetchedAt, args.extraOfficial ?? []), meta };
}
