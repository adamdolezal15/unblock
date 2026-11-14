// Schedule estimates from cited processing times. A wait is only set when a verified
// `processing_time` claim states one; everything else keeps lib/graph's defaults (flagged estimated).
import type { DurationEstimate } from "../graph/types";
import type { Step, Tip } from "../types";

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1,
};
const UNIT: Record<string, number> = { day: 1, week: 5, month: 21 }; // working days

/** Working days of waiting stated in a processing-time text, or undefined if it states none. */
export function parseWaitDays(text: string): number | undefined {
  const t = text.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|an?)\b(?=\s+(?:business |working |banking |calendar )?(?:day|week|month))/g, (w) => String(WORDS[w]));
  if (/\b(immediately|on the spot|right away|at once|same day|during (the|your) (visit|appointment))\b/.test(t)) return 0;
  const unit = "(?:business |working |banking |calendar )?(day|week|month)s?";
  const range = t.match(new RegExp(`(\\d+)\\s*(?:–|-|to)\\s*(\\d+)\\s*${unit}`));
  if (range) return Number(range[2]) * UNIT[range[3]];
  const single = t.match(new RegExp(`(\\d+)\\s*${unit}`));
  if (single) return Number(single[1]) * UNIT[single[2]];
  return undefined;
}

/** step id -> { waitDays } from the most trusted parseable processing_time claim (claims are trust-sorted). */
export function estimatesFromSteps(steps: Step[]): Record<string, DurationEstimate> {
  const out: Record<string, DurationEstimate> = {};
  for (const s of steps) {
    if (s.milestone) continue;
    // A derived step (identification at the police) is done at the desk: nothing is processed afterwards.
    if (s.derived) {
      out[s.id] = { waitDays: 0 };
      continue;
    }
    for (const c of s.claims ?? []) {
      if (c.kind !== "processing_time") continue;
      const wait = parseWaitDays(c.value) ?? parseWaitDays(c.citation.quote);
      if (wait !== undefined) {
        out[s.id] = { waitDays: wait };
        break;
      }
    }
  }
  return out;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Cited processing times first (estimatesFromSteps). Where none exists, verified community wait_time tips
 * fill the wait (median of the reported waits, rounded up), labelled community-sourced in `note`.
 * Steps with neither keep lib/graph's default and stay `estimated: true`.
 */
export function estimatesWithTips(steps: Step[], tips: Pick<Tip, "stepId" | "kind" | "waitDays" | "citation">[]): Record<string, DurationEstimate> {
  const out: Record<string, DurationEstimate> = {};
  for (const [id, e] of Object.entries(estimatesFromSteps(steps))) {
    const step = steps.find((s) => s.id === id);
    if (step?.derived) {
      out[id] = e; // done at the desk: no source, no note
      continue;
    }
    const c = step?.claims?.find((x) => x.kind === "processing_time" && (parseWaitDays(x.value) ?? parseWaitDays(x.citation.quote)) === e.waitDays);
    out[id] = { ...e, waitSource: c?.citation.trust ?? "official", note: `wait from a cited processing time (${c ? hostOf(c.citation.url) : "source"})` };
  }
  const byStep = new Map<string, { days: number; url: string; trust: Tip["citation"]["trust"] }[]>();
  for (const t of tips) {
    if (t.kind !== "wait_time" || t.waitDays === undefined || out[t.stepId]) continue;
    byStep.set(t.stepId, [...(byStep.get(t.stepId) ?? []), { days: t.waitDays, url: t.citation.url, trust: t.citation.trust }]);
  }
  for (const [id, waits] of byStep) {
    const sorted = [...waits].sort((a, b) => a.days - b.days);
    const median = Math.ceil((sorted[(sorted.length - 1) >> 1].days + sorted[sorted.length >> 1].days) / 2);
    const label = sorted.some((w) => w.trust === "community") ? "community" : sorted[0].trust;
    const hosts = [...new Set(sorted.map((w) => hostOf(w.url)))].join(", ");
    out[id] = {
      waitDays: median,
      waitSource: label,
      note: `wait from ${label} reports (${hosts}; ${sorted.length} report${sorted.length === 1 ? "" : "s"}), not an official processing time`,
    };
  }
  return out;
}
