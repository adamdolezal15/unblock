// How far the run is, from what the agent has actually done (status lines and events), 0..1.
// The run announces its work up front ("Searching official sources for <step>…" once per step), so
// each phase is measured against its own count instead of a guessed total.
import type { RunState } from "./runState";

const count = (state: RunState, re: RegExp) => state.statuses.filter((s) => re.test(s.message)).length;
const ratio = (done: number, total: number) => (total > 0 ? Math.min(1, done / total) : 0);

export type Progress = { value: number; label: string };

export function runProgress(state: RunState): Progress {
  if (state.phase === "done") return { value: 1, label: "Done" };
  if (state.phase === "idle") return { value: 0, label: "" };

  const steps = count(state, /^Searching official sources for /);
  const extracted = count(state, /^Extracting cited steps/);
  const verified = count(state, /^Verifying /);
  const confirmed = state.stepOrder.filter((id) => !state.steps[id].milestone).length + state.stubs.length;
  const forums = count(state, /^Searching forums/);
  const tipsRead = count(state, /^Extracting community/);
  const compared = count(state, /^Comparing /);

  const research = ratio(extracted + verified + confirmed, 3 * steps);
  const tips = state.schedule ? 1 : ratio(tipsRead, forums);
  const conflicts = ratio(compared, steps);

  const value =
    0.03 + // started
    (state.profile ? 0.07 : 0) +
    0.5 * research +
    (state.graph ? 0.05 : 0) +
    0.15 * tips +
    (state.schedule ? 0.05 : 0) +
    0.13 * conflicts;

  const label = !state.profile
    ? "Reading your situation"
    : !state.graph
      ? `Reading official sources: ${confirmed} of ${Math.max(steps, confirmed)} steps confirmed`
      : !state.schedule
        ? "Checking what people who did it say"
        : "Cross-checking sources for disagreements";
  return { value: Math.min(0.99, value), label };
}
