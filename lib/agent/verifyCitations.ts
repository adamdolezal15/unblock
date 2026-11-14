// Every quote shown to a user must appear in text Exa actually returned for that URL.
// Check order per claim: highlights already in hand (free) -> full page via getPages (cached).
// Match: exact normalised token sequence (score 1), else best sliding window with multiset token
// overlap >= 0.9 whose negation/restriction tokens equal the quote's exactly. The shown quote is replaced by the matched span of the page, so displayed text is
// always the page's own words.
import { getPages } from "../exa/search";
import { trustOf } from "../exa/domains";
import type { ClaimKind, DroppedClaim, ExaDoc, RawClaim, Step, VerifiedClaim } from "../types";

export const MATCH_THRESHOLD = 0.9;
export const MIN_QUOTE_TOKENS = 5;
export const MAX_QUOTE_TOKENS = 60;
const PAGE_MAX_CHARS = 50_000;

type Token = { t: string; start: number; end: number };

/** Lowercased word tokens with offsets into `text`. Punctuation, quotes, markdown and whitespace drop out. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    out.push({ t: m[0].normalize("NFKC").toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function onDomains(url: string, domains: readonly string[]): boolean {
  const host = hostOf(url);
  return !!host && domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export type Match = { score: number; span: string };

/**
 * Negation and restriction words. Fuzzy matching may never add, drop or reorder them: "you can apply"
 * vs "you cannot apply" differ by one token but mean the opposite. "t" is the tail of n't contractions
 * (can't, don't) after tokenizing. Finnish: the negation verb ei and its person forms.
 */
export const CRITICAL_TOKENS: ReadonlySet<string> = new Set([
  "not", "no", "never", "cannot", "t", "without", "only", "except", "unless",
  "ei", "en", "et", "emme", "ette", "eivät",
]);

const criticalSeq = (tokens: readonly string[]) => tokens.filter((t) => CRITICAL_TOKENS.has(t)).join(" ");

/** Find `quote` in `text`. Returns the best score and the matched original span (whitespace collapsed). */
export function findQuote(quote: string, text: string): Match {
  const q = tokenize(quote).map((x) => x.t);
  const page = tokenize(text);
  const n = q.length;
  if (n === 0 || page.length === 0) return { score: 0, span: "" };
  const spanOf = (i: number, len: number) =>
    text.slice(page[i].start, page[i + len - 1].end).replace(/\s+/g, " ").trim();

  // Pass 1: exact token sequence.
  const words = page.map((x) => x.t);
  outer: for (let i = 0; i + n <= words.length; i++) {
    for (let j = 0; j < n; j++) if (words[i + j] !== q[j]) continue outer;
    return { score: 1, span: spanOf(i, n) };
  }

  // Pass 2: sliding windows of length n-1..n+2, score = multiset overlap / max(n, window).
  // Multisets ignore order, so equal scores are tie-broken by shared bigrams (prefers the aligned window).
  // A window only counts if its negation/restriction tokens equal the quote's exactly, in order.
  const qCritical = criticalSeq(q);
  const criticalOk = (i: number, len: number) => criticalSeq(words.slice(i, i + len)) === qCritical;
  const need = new Map<string, number>();
  for (const w of q) need.set(w, (need.get(w) ?? 0) + 1);
  const qBigrams = new Set(q.slice(1).map((w, i) => `${q[i]} ${w}`));
  const bigramHits = (i: number, len: number) => {
    let hits = 0;
    for (let k = i + 1; k < i + len; k++) if (qBigrams.has(`${words[k - 1]} ${words[k]}`)) hits++;
    return hits;
  };
  let best: Match = { score: 0, span: "" };
  let bestBigrams = -1;
  for (const len of [n, n - 1, n + 1, n + 2]) {
    if (len < 1 || len > words.length) continue;
    const have = new Map<string, number>();
    let overlap = 0;
    const add = (w: string) => {
      const c = (have.get(w) ?? 0) + 1;
      have.set(w, c);
      if (c <= (need.get(w) ?? 0)) overlap++;
    };
    const remove = (w: string) => {
      const c = have.get(w)!;
      have.set(w, c - 1);
      if (c <= (need.get(w) ?? 0)) overlap--;
    };
    for (let i = 0; i < len; i++) add(words[i]);
    for (let i = 0; ; i++) {
      const score = overlap / Math.max(n, len);
      if ((score > best.score || (score === best.score && score > 0)) && criticalOk(i, len)) {
        const bg = bigramHits(i, len);
        if (score > best.score || bg > bestBigrams) {
          best = { score, span: spanOf(i, len) };
          bestBigrams = bg;
        }
      }
      if (i + len >= words.length) break;
      remove(words[i]);
      add(words[i + len]);
    }
  }
  return best;
}

export type PageFetcher = (url: string) => Promise<string | null>;

/** getPages-backed fetcher, memoised per run so two steps citing one URL cost one call. */
export function createPageFetcher(extraOfficial: string[] = []): PageFetcher {
  const memo = new Map<string, Promise<string | null>>();
  return (url) => {
    const key = normalizeUrl(url);
    let p = memo.get(key);
    if (!p) {
      p = getPages([url], { maxCharacters: PAGE_MAX_CHARS, extraOfficial })
        .then(({ docs }) => docs[0]?.text?.trim() || null)
        .catch(() => null);
      memo.set(key, p);
    }
    return p;
  };
}

const MODES: Record<string, Step["mode"]> = {
  online: "online",
  in_person: "in_person",
  "in person": "in_person",
  "in-person": "in_person",
  either: "either",
  both: "either",
};

/** Normalise a claim's value per kind. null = invalid. */
function cleanValue(
  kind: ClaimKind,
  value: string,
  stepId: string,
  knownIds: ReadonlySet<string>,
  milestoneIds: ReadonlySet<string>,
): string | null | "unknown_id" {
  const v = value.trim();
  if (!v) return null;
  if (kind === "same_visit") {
    const id = v.toLowerCase();
    return knownIds.has(id) && !milestoneIds.has(id) && id !== stepId ? id : "unknown_id";
  }
  if (kind === "provides") {
    const id = v.toLowerCase();
    return milestoneIds.has(id) ? id : "unknown_id";
  }
  if (kind === "requires") {
    const id = v.toLowerCase();
    return knownIds.has(id) && id !== stepId ? id : "unknown_id";
  }
  if (kind === "mode") return MODES[v.toLowerCase()] ?? null;
  return v;
}

/**
 * The quote proves the page says something; this checks the extracted value is what it says.
 * Every number in the value ("60 %", "2 months", "Pasilanraitio 11") must appear in the quote.
 */
export function numbersSupported(value: string, quote: string): boolean {
  const inQuote = new Set(quote.match(/\d+/g) ?? []);
  return (value.match(/\d+/g) ?? []).every((n) => inQuote.has(n));
}

export type VerifyOptions = {
  /** Domains the quote's URL must be on (the domains this extraction was allowed to read). */
  allowedDomains: readonly string[];
  /** City domains labelled official for this run. */
  extraOfficial?: string[];
  /** Canonical ids a `requires` value may name (steps and milestones). */
  knownStepIds: ReadonlySet<string>;
  /** Milestone ids a `provides` value may name. */
  milestoneIds?: ReadonlySet<string>;
  fetchPage?: PageFetcher;
};

/**
 * Check every claim's quote against the text Exa returned for its URL.
 * `docs` = everything already in hand (auto-search results and the extractor's own sources).
 */
export async function verifyCitations(
  claims: RawClaim[],
  docs: ExaDoc[],
  opts: VerifyOptions,
): Promise<{ verified: VerifiedClaim[]; dropped: DroppedClaim[] }> {
  const fetchPage = opts.fetchPage ?? createPageFetcher(opts.extraOfficial);
  const byUrl = new Map<string, { highlights: string[]; text?: string; fetchedAt: string }>();
  for (const d of docs) {
    const key = normalizeUrl(d.url);
    const e = byUrl.get(key) ?? { highlights: [], fetchedAt: d.fetchedAt };
    e.highlights.push(...d.highlights);
    if (d.text) e.text = d.text;
    byUrl.set(key, e);
  }

  const seen = new Set<string>();
  const unique = claims.filter((c) => {
    const k = `${c.stepId}|${c.kind}|${c.value}|${normalizeUrl(c.url)}|${c.quote}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const results = await Promise.all(
    unique.map(async (c): Promise<VerifiedClaim | DroppedClaim> => {
      const drop = (reason: DroppedClaim["reason"], bestScore?: number): DroppedClaim => ({ ...c, reason, bestScore });

      const value = cleanValue(c.kind, c.value, c.stepId, opts.knownStepIds, opts.milestoneIds ?? new Set());
      if (value === "unknown_id") return drop("unknown_step_id");
      if (value === null) return drop("invalid_value");
      if (!onDomains(c.url, opts.allowedDomains)) return drop("url_not_allowed");
      const nTokens = tokenize(c.quote).length;
      if (nTokens < MIN_QUOTE_TOKENS) return drop("too_short");
      if (nTokens > MAX_QUOTE_TOKENS) return drop("merged_sentences");

      const inHand = byUrl.get(normalizeUrl(c.url));
      let best: Match = { score: 0, span: "" };
      const sources = [...(inHand?.highlights ?? []), ...(inHand?.text ? [inHand.text] : [])];
      for (const s of sources) {
        const m = findQuote(c.quote, s);
        if (m.score > best.score) best = m;
        if (best.score === 1) break;
      }
      let fetchedAt = inHand?.fetchedAt ?? new Date().toISOString();
      if (best.score < MATCH_THRESHOLD) {
        const page = await fetchPage(c.url);
        if (page) {
          const m = findQuote(c.quote, page);
          if (m.score > best.score) best = m;
          fetchedAt = new Date().toISOString();
        } else if (sources.length === 0) {
          return drop("page_unavailable");
        }
      }
      if (best.score < MATCH_THRESHOLD) return drop("quote_not_found", Math.round(best.score * 100) / 100);
      // Extracted value adds numbers the quote doesn't have: if the quote states numbers itself, show
      // the quote's own words as the value; if it has none, the value was invented -> drop.
      let shownValue = value;
      if (!numbersSupported(value, best.span)) {
        if (!/\d/.test(best.span)) return drop("value_not_in_quote");
        shownValue = best.span;
      }

      return {
        stepId: c.stepId,
        kind: c.kind,
        value: shownValue,
        matchScore: Math.round(best.score * 100) / 100,
        citation: { url: c.url, quote: best.span, trust: trustOf(c.url, opts.extraOfficial ?? []), fetchedAt },
      };
    }),
  );

  const verified: VerifiedClaim[] = [];
  const dropped: DroppedClaim[] = [];
  for (const r of results) ("reason" in r ? dropped : verified).push(r as never);
  return { verified, dropped };
}
