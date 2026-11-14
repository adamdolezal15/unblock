// The letter for Marta, built from a real cached run (offline: EXA_CACHE=read, LLM_CACHE=read).
// Checks the answer-first headline, the money sentence, and that every footnote points at a quote the
// pipeline verified (never at text the letter made up).
import { beforeAll, describe, expect, it } from "vitest";
import type { Citation } from "../../lib/types";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

const MARTA = "I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR, and starting a master's at Aalto";

type Doc = import("../../lib/ui/letter").LetterDoc;
type State = import("../../lib/ui/runState").RunState;
let doc: Doc;
let state: State;

const text = (segs: { t?: string; ref?: { n: number } }[]) => segs.map((s) => s.t ?? `[${s.ref!.n}]`).join("");

beforeAll(async () => {
  const { runStream, readEvents } = await import("../../lib/agent/runStream");
  const { initialRunState, runReducer } = await import("../../lib/ui/runState");
  const { buildLetter } = await import("../../lib/ui/letter");
  state = runReducer(initialRunState, { type: "start", text: MARTA, at: 0 });
  for await (const event of readEvents(runStream(MARTA, { fast: true, persist: false, today: "2026-11-14" }))) {
    state = runReducer(state, { type: "event", event, at: 1 });
  }
  doc = buildLetter(state);
}, 60_000);

describe("letter: Marta", () => {
  it("answers first: when, and where to start", () => {
    const h = text(doc.letter!.headline);
    expect(h).toMatch(/^You can be fully set up by 13 January 2027\./);
    expect(h).toContain("Get your Finnish personal identity code at Vero on 1 December, not at DVV.");
  });

  it("states money at stake from the verified 60% quote and the stated salary", () => {
    const money = doc.letter!.paras.find((p) => p.key === "money")!;
    expect(text(money.segs)).toContain("60% of your salary is withheld");
    expect(text(money.segs)).toContain("€1,920");
    const ref = money.segs.find((s) => "ref" in s) as { ref: { citation: Citation } };
    expect(ref.ref.citation.quote).toMatch(/60% of your salary/);
  });

  it("only cites quotes the pipeline verified, numbered by source page", () => {
    const verified = new Set<string>();
    for (const s of Object.values(state.steps)) {
      for (const c of s.claims ?? []) verified.add(c.citation.quote);
      for (const c of s.citations) verified.add(c.quote);
    }
    for (const t of state.tips) verified.add(t.citation.quote);
    for (const c of state.conflicts) [c.a, c.b].forEach((x) => verified.add(x.quote));

    const refs = [doc.letter!.headline, ...doc.letter!.paras.map((p) => p.segs)].flat().filter((s) => "ref" in s) as { ref: { n: number; citation: Citation } }[];
    expect(refs.length).toBeGreaterThanOrEqual(5);
    for (const { ref } of refs) {
      expect(verified.has(ref.citation.quote)).toBe(true);
      expect(doc.sources[ref.n - 1].url).toBe(ref.citation.url);
    }
    // Numbers are 1..n in reading order.
    const firstSeen = [...new Set(refs.map((r) => r.ref.n))];
    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
    expect(firstSeen[0]).toBe(1);
  });

  it("names the conflict and the estimates", () => {
    const keys = doc.letter!.paras.map((p) => p.key);
    expect(keys).toEqual(["shortcut", "money", "conflict", "estimates"]);
    expect(text(doc.letter!.paras[2].segs)).toMatch(/^Sources disagree on whether a Finnish personal identity code is needed to open a bank account\./);
    expect(text(doc.letter!.paras[3].segs)).toContain("2 of the 9 dates are my estimates");
  });
});

describe("profile sentence", () => {
  it("reads as one sentence with the assumption inline", async () => {
    const { profileParts } = await import("../../lib/ui/profileSentence");
    const parts = profileParts(state.profile!.profile, state.profile!.assumptions, MARTA);
    const s = parts.map((p) => ("t" in p ? p.t : p.value)).join("");
    expect(s).toBe("You're a Czech citizen, working and studying in Helsinki from 1 December, on €3,200 a month (I assumed gross).");
  });
});

describe("side panel: Marta", () => {
  it("every arrow on the map has a verified quote behind it", async () => {
    const { edgeEvidence } = await import("../../lib/ui/panel");
    for (const e of state.graph!.graph.edges) {
      const q = edgeEvidence(state, e.source, e.target);
      expect(q.length, e.id).toBeGreaterThan(0);
      for (const c of q) expect(doc.ref(c).n).toBeGreaterThan(0);
    }
  });

  it("explains what the Vero ID code unblocks through the milestone", async () => {
    const { unblocks, milestoneOptions } = await import("../../lib/ui/panel");
    expect(unblocks(state, "vero_identity_code").via).toMatchObject({ milestone: "personal_identity_code" });
    expect(unblocks(state, "vero_identity_code").via!.steps).toContain("bank_account");
    expect(milestoneOptions(state, "personal_identity_code").map((o) => o.id).sort()).toEqual(["dvv_registration", "vero_identity_code"]);
  });
});
