// The Journey design's view model (lib/ui/journey) on the saved demos, offline: the route's stops and waits,
// the tickets, Anytime and Worth knowing. It must show every step Day by day shows, and only verified quotes.
import { beforeAll, describe, expect, it } from "vitest";
import type { RunState } from "../../lib/ui/runState";
import { spreadStops, stopLabel, type Journey } from "../../lib/ui/journey";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

const runs: Record<string, { state: RunState; journey: Journey }> = {};

beforeAll(async () => {
  const { POST } = await import("../../app/api/run/route");
  const { initialRunState, runReducer } = await import("../../lib/ui/runState");
  const { DEMO_SENTENCES } = await import("../../lib/demo/sentences");
  const { buildLetter } = await import("../../lib/ui/letter");
  const { compareWithUsual } = await import("../../lib/ui/compare");
  const { buildJourney } = await import("../../lib/ui/journey");
  for (const [key, text] of Object.entries(DEMO_SENTENCES)) {
    const res = await POST(
      new Request("http://localhost/api/run?fast=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }),
    );
    let state = runReducer(initialRunState, { type: "start", text, at: 0 });
    for (const l of (await res.text()).split("\n").filter(Boolean)) state = runReducer(state, { type: "event", event: JSON.parse(l), at: 1 });
    expect(state.phase).toBe("done");
    const doc = buildLetter(state);
    runs[key] = { state, journey: buildJourney(state, doc, compareWithUsual(state, doc.ref)) };
  }
}, 180_000);

describe("spreadStops", () => {
  it("keeps the ends at 0 and 1 and pushes close stops apart", () => {
    expect(spreadStops([0, 0.02, 0.63, 1])).toEqual([0, 0.14, 0.63, 1]);
  });
  it("shrinks the gap when there are many stops", () => {
    const p = spreadStops([0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(p[0]).toBe(0);
    expect(p[8]).toBe(1);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
  });
  it("handles one stop", () => {
    expect(spreadStops([0.5])).toEqual([0]);
  });
});

describe("stopLabel", () => {
  it("joins two offices and shortens 'Your bank'", () => {
    expect(stopLabel(["Your bank", "Police"])).toBe("Bank + Police");
    expect(stopLabel(["Migri", "Vero", "Vero"])).toBe("Migri + Vero");
    expect(stopLabel(["Migri", "Vero", "DVV"])).toBe("Migri + 2 more");
  });
});

describe("Journey for Marta", () => {
  it("has one stop per visit day and the finish", () => {
    const j = runs.marta.journey;
    expect(j.stops.map((s) => [s.date, s.label])).toEqual([
      ["2026-12-01", "Migri + Vero"],
      ["2026-12-02", "DVV"],
      ["2026-12-28", "Bank + Police"],
      ["2027-01-13", "Fully set up"],
    ]);
    expect(j.end).toBe("2027-01-13");
    expect(j.stops[0].pos).toBe(0);
    expect(j.stops[3].pos).toBe(1);
    expect(j.stops[3].finish).toBe(true);
  });

  it("shows the slowest chain's waits between stops", () => {
    expect(runs.marta.journey.waits.map((w) => [w.from, w.text])).toEqual([
      [1, "~3 weeks"],
      [2, "~2 weeks"],
    ]);
  });

  it("marks the Vero visit as the shortcut, on the same day as Migri", () => {
    const [migri, vero] = runs.marta.journey.stops[0].tickets;
    expect([migri.office, migri.mode, migri.shortcut]).toEqual(["Migri", "In person", false]);
    expect([vero.office, vero.mode, vero.shortcut]).toEqual(["Vero", "Same day", true]);
    expect(vero.steps.map((s) => s.id)).toEqual(["vero_identity_code", "tax_card"]);
    expect(vero.bring.length).toBeGreaterThan(0);
    expect(vero.calendarUrl).toMatch(/^https:\/\/calendar\.google\.com\//);
  });

  it("puts the online steps off the slowest chain under Anytime", () => {
    expect(runs.marta.journey.anytime.map((a) => [a.step.id, a.from])).toEqual([
      ["bank_account", "2026-12-07"],
      ["university_enrolment", "2026-12-07"],
      ["kela_registration", "2026-12-22"],
    ]);
  });

  it("puts the money and the conflict on their steps", () => {
    const w = runs.marta.journey.worth;
    expect(w.map((x) => [x.key, x.stepId])).toEqual([
      ["money", "tax_card"],
      ["conflict", "bank_account"],
    ]);
    expect(w[0].strong).toEqual({ lead: "Without the tax card", amount: "€1,920", of: "€3,200" });
  });
});

describe("Journey on every demo", () => {
  it("shows every step Day by day shows, once", async () => {
    const { buildDays, entrySteps } = await import("../../lib/ui/days");
    const { buildLetter } = await import("../../lib/ui/letter");
    for (const [key, { state, journey }] of Object.entries(runs)) {
      const want = buildDays(state, buildLetter(state).ref).flatMap(entrySteps).map((s) => s.id).sort();
      const got = [...journey.stops.flatMap((s) => s.tickets.flatMap((t) => t.steps.map((x) => x.id))), ...journey.anytime.filter((a) => !a.optional).map((a) => a.step.id)].sort();
      expect(got, key).toEqual(want);
    }
  });

  it("only quotes text that is a verified citation of the run", () => {
    for (const [key, { state, journey }] of Object.entries(runs)) {
      const quotes = new Set(
        Object.values(state.steps).flatMap((s) => [...s.citations, ...(s.claims ?? []).map((c) => c.citation), ...(s.forms ?? []).map((f) => f.citation)]).map((c) => c.quote.trim()),
      );
      for (const t of journey.stops.flatMap((s) => s.tickets)) if (t.quote) expect(quotes.has(t.quote.text), `${key} ${t.key}`).toBe(true);
    }
  });

  it("orders stops by date with the finish last", () => {
    for (const [key, { journey }] of Object.entries(runs)) {
      const d = journey.stops.map((s) => s.date);
      expect([...d].sort(), key).toEqual(d);
      expect(journey.stops[journey.stops.length - 1].finish, key).toBe(true);
      for (let i = 1; i < journey.stops.length; i++) expect(journey.stops[i].pos, key).toBeGreaterThan(journey.stops[i - 1].pos);
    }
  });
});
