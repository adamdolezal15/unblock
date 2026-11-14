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
    expect(refs.length).toBeGreaterThanOrEqual(4);
    for (const { ref } of refs) {
      expect(verified.has(ref.citation.quote)).toBe(true);
      expect(doc.sources[ref.n - 1].url).toBe(ref.citation.url);
    }
    // Numbers are 1..n in reading order.
    const firstSeen = [...new Set(refs.map((r) => r.ref.n))];
    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
    expect(firstSeen[0]).toBe(1);
  });

  it("is at most three short paragraphs, one source number each, at the end", () => {
    for (const p of doc.letter!.paras) {
      expect(text(p.segs).split(/\s+/).length, p.key).toBeLessThanOrEqual(25);
      expect(p.segs.filter((x) => "ref" in x).length, p.key).toBeLessThanOrEqual(1);
    }
  });

  it("names the conflict", () => {
    const keys = doc.letter!.paras.map((p) => p.key);
    expect(keys).toEqual(["shortcut", "money", "conflict"]);
    expect(text(doc.letter!.paras[2].segs)).toMatch(/^Official sources disagree on whether a Finnish personal identity code is needed to open a bank account\./);
    expect(text(doc.letter!.paras[0].segs)).toMatch(/^Vero can give you the identity code 13 working days before DVV, and your tax card in the same visit\.\[\d+\]$/);
  });
});

describe("profile sentence", () => {
  it("reads as one sentence with the assumption inline", async () => {
    const { profileParts } = await import("../../lib/ui/profileSentence");
    const parts = profileParts(state.profile!.profile, state.profile!.assumptions, MARTA);
    const s = parts.map((p) => ("t" in p ? p.t : p.value)).join("");
    expect(s).toBe("You're a Czech citizen, working and studying in Helsinki from 1 December, on €3,200 a month (assumed: gross).");
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

describe("day by day: Marta", () => {
  it("has one entry per visit, every step footnoted, and ends on the set-up date", async () => {
    const { buildDays, entrySteps } = await import("../../lib/ui/days");
    const days = buildDays(state, doc.ref);
    const visits = days.filter((d) => d.kind === "visit");
    expect(visits.map((v) => v.kind === "visit" && v.authority)).toContain("Migri");
    const vero = visits.find((v) => v.kind === "visit" && v.steps.some((s) => s.id === "vero_identity_code"));
    expect(vero && vero.kind === "visit" && vero.steps.map((s) => s.id).sort()).toEqual(["tax_card", "vero_identity_code"]);
    for (const s of days.flatMap(entrySteps)) {
      // A line, when there is one, carries its footnote; a step with no verified why shows no line at all.
      const hasRef = s.whyNow.some((x) => "ref" in x);
      expect(hasRef || s.noSource || s.whyNow.length === 0, s.id).toBe(true);
      expect(s.whyNow.map((x) => ("t" in x ? x.t : "")).join(""), s.id).not.toMatch(/applies to your situation|If it waits/);
    }
    expect(days[days.length - 1]).toEqual({ kind: "done", date: "2027-01-13" });
    expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort());
  });
});

describe("usual order vs your order: Marta", () => {
  it("the usual order (DVV only, nothing merged) finishes later with one visit fewer", () => {
    const bl = state.schedule!.baseline!;
    expect(bl.skipped).toEqual(["vero_identity_code"]);
    expect(bl.endDate).toBe("2027-01-28");
    expect(bl.visits).toBe(4); // the police identity card for a foreigner is in person (a visit of its own)
    expect(bl.startDates.tax_card > state.schedule!.schedule.items.tax_card.startDate).toBe(true);
  });

  it("says how much sooner, what it costs, and marks the step that creates the gain", async () => {
    const { compareWithUsual } = await import("../../lib/ui/compare");
    const c = compareWithUsual(state, doc.ref)!;
    expect(text(c.sentence as never)).toMatch(/^The usual order \(DVV first\) gets you set up by 28 January\. Your order: 13 January, 15 days sooner, for 1 extra visit\.\[\d+\]$/);
    expect(c.shortcuts.map((s) => s.id)).toEqual(["vero_identity_code"]);
    expect(text(c.shortcuts[0].text as never)).toMatch(/^Gets you the personal identity code 21 days before DVV would\[\d+\]\.$/);
  });
});

describe("gain threshold", () => {
  it("says nothing when the usual order is less than 3 working days behind", async () => {
    const { compareWithUsual } = await import("../../lib/ui/compare");
    const bl = state.schedule!.baseline!;
    const close = { ...state, schedule: { ...state.schedule!, baseline: { ...bl, endDate: "2027-01-14" } } }; // yours: 13 January
    expect(compareWithUsual(close, doc.ref)).toBeNull();
  });
});

describe("key insights: Marta", () => {
  it("skips the shortcut (the answer says it) and keeps money and the disagreement, each footnoted", () => {
    const ins = doc.letter!.insights;
    expect(ins.map((i) => i.key)).toEqual(["money", "conflict"]);
    expect(text(ins[0].segs)).toMatch(/^Without the tax card, 60% of your salary is withheld: €1,920 of your €3,200 a month\.\[\d+\]$/);
    for (const i of ins) {
      expect(i.segs.some((x) => "ref" in x)).toBe(true);
      expect(i.stepId).toBeTruthy();
    }
  });
});

describe("transit line: Marta", () => {
  it("has one stop per visit in date order and ends at 'Set up' on the finish date", async () => {
    const { buildDays } = await import("../../lib/ui/days");
    const { stopsFrom } = await import("../../components/TransitLine");
    const stops = stopsFrom(buildDays(state, doc.ref));
    expect(stops[0]).toMatchObject({ date: "2026-12-01", critical: true });
    expect(stops.flatMap((s) => s.label.split(" + "))).toContain("Vero");
    expect(stops[stops.length - 1]).toMatchObject({ what: "Set up", date: "2027-01-13", end: true });
    expect(stops.map((s) => s.date)).toEqual([...stops.map((s) => s.date)].sort());
  });
});

describe("metro map: Marta", () => {
  it("fits 1000px with labels in their own columns and no route through another station", async () => {
    const { layoutMetro, hits } = await import("../../lib/ui/metroLayout");
    const L = layoutMetro({
      graph: state.graph!.graph,
      steps: state.steps,
      items: state.schedule!.schedule.items,
      criticalPath: state.schedule!.criticalPath.stepIds,
      conflicts: state.conflicts,
      width: 1000,
    });
    expect(L.width).toBeGreaterThanOrEqual(1000);
    expect(L.height).toBeLessThan(640);
    expect(new Set(L.stations.map((s) => s.col)).size).toBe(L.stations.length);
    for (const e of L.edges) expect(hits(e.points, L.stations, new Set([e.source, e.target])), e.id).toBe(0);
    const { crossings } = await import("../../lib/ui/metroLayout");
    for (let i = 0; i < L.edges.length; i++)
      for (let j = i + 1; j < L.edges.length; j++) {
        const [a, b] = [L.edges[i], L.edges[j]];
        const shared = [a.source, a.target].filter((x) => x === b.source || x === b.target).map((x) => L.stations.find((s) => s.id === x)!);
        expect(crossings(a.points, b.points, shared, L.stations.find((s) => s.row === 0)?.y), `${a.id} x ${b.id}`).toBe(0);
      }
    expect(L.stations.filter((s) => s.row === 0).map((s) => s.id)).toEqual(["eu_registration", "dvv_registration", "strong_identification"]);
    expect(L.stations.find((s) => s.id === "bank_account")?.conflict).toBe(true);
  });
});
