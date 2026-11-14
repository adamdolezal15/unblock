// Plain words for the planner's concepts, each with a one-sentence explanation (shown behind a "?").
import { DEFAULT_ESTIMATE } from "@/lib/graph/schedule";

export const TERMS = {
  slowest: {
    label: "The slowest chain: this decides when you're done",
    short: "On the slowest chain",
    help: "The longest run of steps where each one waits for the one before. A delay on it moves your finish date; a delay elsewhere does not.",
  },
  oneVisit: {
    label: "Do both in one visit",
    short: "Do both in one visit",
    help: "A source says these are handled at the same desk, so one appointment covers both.",
  },
  either: {
    label: "Either one is enough",
    short: "Either one is enough",
    help: "Any one of the arrows into the diamond gets you this. You don't need all of them.",
  },
  disagree: {
    label: "Official sources disagree here, see why",
    short: "Official sources disagree here",
    help: "Two verified sources say different things about this step. Open the step to read both quotes side by side and what to do.",
  },
  estimate: {
    label: "Estimate: no official figure found",
    short: "Estimate: no official figure found",
    help: `No source states how long this step takes, so the date assumes about ${DEFAULT_ESTIMATE.waitDays} working days. Check with the office.`,
  },
} as const;

export type Term = keyof typeof TERMS;

/** "Official sources disagree" only when both sides are official; otherwise just "Sources disagree". */
export function disagreeLabel(bothOfficial: boolean, long = false): string {
  const base = bothOfficial ? "Official sources disagree here" : "Sources disagree here";
  return long ? `${base}, see why` : base;
}
