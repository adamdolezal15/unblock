// Invariants over the whole profile matrix (lib/eval/profiles.ts), offline from demo-cache/.
// Same checks as scripts/eval-invariants.ts. If a profile fails with "no cached response", refresh with network:
//   npx tsx scripts/eval-invariants.ts --export
import { beforeAll, describe, expect, it } from "vitest";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

import { EVAL_PROFILES, EVAL_TODAY } from "../../lib/eval/profiles";
import { INVARIANTS, type InvariantId, type Violation } from "../../lib/eval/invariants";

type State = import("../../lib/ui/runState").RunState;
const IDS = Object.keys(INVARIANTS) as InvariantId[];

describe.each(EVAL_PROFILES)("invariants: $key ($covers)", (p) => {
  let state: State;
  let violations: Violation[];

  beforeAll(async () => {
    const { runStream, readEvents } = await import("../../lib/agent/runStream");
    const { initialRunState, runReducer } = await import("../../lib/ui/runState");
    const { checkInvariants } = await import("../../lib/eval/invariants");
    state = runReducer(initialRunState, { type: "start", text: p.text, at: 0 });
    for await (const event of readEvents(runStream(p.text, { fast: true, persist: false, today: EVAL_TODAY }))) {
      state = runReducer(state, { type: "event", event, at: 1 });
    }
    violations = checkInvariants(state);
  }, 120_000);

  it("finishes with a plan, entirely from cache", () => {
    expect(state.phase).toBe("done");
    expect(state.summary?.calls.exaLive ?? -1).toBe(0);
    expect(state.summary?.calls.llmLive ?? -1).toBe(0);
    expect(Object.keys(state.steps).length).toBeGreaterThan(0);
  });

  it.each(IDS)("%s", (id) => {
    expect(violations.filter((v) => v.id === id).map((v) => v.detail), INVARIANTS[id]).toEqual([]);
  });
});
