// The demo sentences. Their cache entries live in demo-cache/ (npm run warm-demo), so the demo and the
// golden test run offline on a fresh clone.
export const DEMO_SENTENCES = {
  marta:
    "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto",
  brazil: "Brazilian PhD student moving to Tampere with my wife in January",
  india: "Indian software engineer, arriving in Helsinki next week, no residence permit card yet",
} as const;

export type DemoKey = keyof typeof DEMO_SENTENCES;
