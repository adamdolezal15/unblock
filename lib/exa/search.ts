// Typed, cached wrappers around Exa /search and /contents. All Exa traffic goes through here.
// Request shapes follow .agents/skills/build-with-exa: highlights inside `contents`,
// `objective` on every pipeline search, includeDomains only for the official layer.
import type { ExaDoc } from "../types";
import { cached } from "./cache";
import { exa } from "./client";
import { cityDomains, officialDomains, trustOf, UNIVERSITY } from "./domains";

/** Dev budget from CLAUDE.md: numResults <= 5. */
export const DEFAULT_NUM_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEEP_TIMEOUT_MS = 60_000;

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
    const res = await exa().search(query, { ...options, timeout } as never);
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
  return { docs: toDocs(response, meta.fetchedAt, cityDomains(args.city)), meta };
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
    contents: { highlights: true },
  });
  return { docs: toDocs(response, meta.fetchedAt, cityDomains(args.city)), meta };
}

/**
 * /contents for known URLs: full page text, used when highlights miss the sentence an edge needs.
 * On /contents, `text` is top-level (not nested in `contents`).
 */
export async function fetchContents(
  urls: string[],
  maxCharacters = 20_000,
  extraOfficial: string[] = [],
): Promise<{ docs: ExaDoc[]; meta: SearchMeta }> {
  const r = await cached<RawSearchResponse>(
    { endpoint: "contents", urls: [...urls].sort(), text: { maxCharacters } },
    async () => {
      const res = await exa().getContents(urls, { text: { maxCharacters }, timeout: DEFAULT_TIMEOUT_MS });
      return JSON.parse(JSON.stringify(res)) as RawSearchResponse;
    },
  );
  return {
    docs: toDocs(r.response, r.fetchedAt, extraOfficial),
    meta: { hit: r.hit, ms: r.ms, requestId: r.response.requestId, costUsd: r.response.costDollars?.total, fetchedAt: r.fetchedAt },
  };
}
