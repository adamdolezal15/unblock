// The demo sentences. Their cache entries live in demo-cache/ (npm run warm-demo), so the demo and the
// golden test run offline on a fresh clone.
export const DEMO_SENTENCES = {
  marta:
    "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto",
  brazil: "Brazilian PhD student moving to Tampere with my wife in January",
  india: "Indian software engineer, arriving in Helsinki next week, no residence permit card yet",
  // Not on the landing page: a non-EU worker outside Helsinki, the golden test for the permit-before-arrival rules.
  vietnam: "Vietnamese nurse moving to Oulu in February",
} as const;

export type DemoKey = keyof typeof DEMO_SENTENCES;

/**
 * The day the saved demos were recorded (npm run warm-demo). A demo sentence always runs as of this day, so its
 * relative dates ("next week") and every cache key match demo-cache/ on any later day: the replay never goes live.
 */
export const DEMO_TODAY = "2026-11-14";

const DEMO_TEXTS: ReadonlySet<string> = new Set(Object.values(DEMO_SENTENCES));

/** True for the exact text of a saved demo (these runs replay from demo-cache/, no passcode needed). */
export function isDemoSentence(text: string): boolean {
  return DEMO_TEXTS.has(text.trim());
}
