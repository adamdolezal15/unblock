// Schedule estimates from cited processing times. A wait is only set when a verified
// `processing_time` claim states one; everything else keeps lib/graph's defaults (flagged estimated).
import type { DurationEstimate } from "../graph/types";
import type { Step } from "../types";

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
