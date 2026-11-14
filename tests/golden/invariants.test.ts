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

  it("headline office is the chosen identity-code option's authority", async () => {
    const { buildLetter } = await import("../../lib/ui/letter");
    const headline = (buildLetter(state).letter?.headline ?? []).map((s) => ("t" in s ? s.t : "")).join("");
    const m = headline.match(/Get your .+? at (.+?) on d+ w+, not at /);
    if (!m) return;
    const items = state.schedule!.schedule.items;
    const skipped = state.schedule!.baseline?.skipped ?? [];
    const chosen = state.graph!.graph.edges
      .filter((e) => e.anyOf && e.target === "personal_identity_code" && skipped.includes(e.source) && items[e.source])
      .map((e) => e.source)
      .sort((a, b) => items[a].readyIndex - items[b].readyIndex)[0];
    expect(chosen, headline).toBeDefined();
    expect(m[1].toLowerCase(), headline).toBe(state.steps[chosen].authority.toLowerCase());
  });

  it.each(IDS)("%s", (id) => {
    expect(violations.filter((v) => v.id === id).map((v) => v.detail), INVARIANTS[id]).toEqual([]);
  });
});
