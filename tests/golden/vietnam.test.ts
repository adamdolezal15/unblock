// Golden test for "Vietnamese nurse moving to Oulu in February": a non-EU worker outside Helsinki.
// Offline from the cache (EXA_CACHE=read, LLM_CACHE=read). If it fails with "no cached response", run once with network:
//   npm run warm-demo -- vietnam
import { beforeAll, describe, expect, it } from "vitest";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

const TEXT = "Vietnamese nurse moving to Oulu in February";
const TODAY = "2026-11-14"; // a Saturday: the first working day is Monday 2026-11-16

type State = import("../../lib/ui/runState").RunState;
type Doc = import("../../lib/ui/letter").LetterDoc;
let state: State;
let doc: Doc;

const text = (segs: { t?: string; ref?: { n: number } }[]) => segs.map((s) => s.t ?? `[${s.ref!.n}]`).join("");

beforeAll(async () => {
  const { runStream, readEvents } = await import("../../lib/agent/runStream");
  const { initialRunState, runReducer } = await import("../../lib/ui/runState");
  const { buildLetter } = await import("../../lib/ui/letter");
  state = runReducer(initialRunState, { type: "start", text: TEXT, at: 0 });
  for await (const event of readEvents(runStream(TEXT, { fast: true, persist: false, today: TODAY }))) {
    state = runReducer(state, { type: "event", event, at: 1 });
  }
  doc = buildLetter(state);
}, 120_000);

const items = () => state.schedule!.schedule.items;

describe("golden: Vietnamese nurse, Oulu", () => {
  it("parses as a non-EU worker arriving in Oulu on 1 February", () => {
    expect(state.profile!.profile).toMatchObject({ citizenship: "NON_EU", city: "Oulu", arrivalDate: "2027-02-01" });
    expect(state.phase).toBe("done");
    expect(state.stubs).toEqual([]);
  });

  it("1. the residence permit is applied for before arrival; everything else starts on arrival or later", () => {
    expect(state.steps.residence_permit.beforeArrival).toBe(true);
    expect(items().residence_permit.startDate).toBe("2026-11-16");
    expect(items().residence_permit.readyDate < "2027-02-01").toBe(true);
    for (const [id, it] of Object.entries(items())) if (id !== "residence_permit") expect(it.startDate >= "2027-02-01", id).toBe(true);
  });

  it("1. the headline says to apply before you travel; a permit that is too slow puts the arrival date at risk", async () => {
    const h = text(doc.letter!.headline);
    expect(h).toContain("Apply for the residence permit before you travel");
    expect(h).not.toContain("at risk");

    // The same run, but arriving before the permit can be ready.
    const { buildLetter } = await import("../../lib/ui/letter");
    const soon = { ...state, profile: { ...state.profile!, profile: { ...state.profile!.profile, arrivalDate: "2026-11-23" } } };
    const risky = text(buildLetter(soon).letter!.headline);
    expect(risky).toMatch(/Your arrival on 23 November is at risk: the permit is expected around \d+ \w+/);
  });

  it("2. the residence permit provides the identity code (with an official quote); no Vero shortcut, no 'days sooner'", async () => {
    const permit = state.steps.residence_permit;
    const provides = permit.claims!.filter((c) => c.kind === "provides" && c.value === "personal_identity_code");
    expect(provides.length).toBeGreaterThan(0);
    for (const c of provides) {
      expect(c.citation.trust).toBe("official");
      expect(c.citation.quote.toLowerCase()).toMatch(/residence permit/);
      expect(c.citation.quote.toLowerCase()).toMatch(/identity code/);
    }
    const group = state.steps.personal_identity_code.requiresAnyOf!.flat();
    expect(group).toContain("residence_permit");
    expect(state.steps.vero_identity_code).toBeUndefined();
    expect(items().vero_identity_code).toBeUndefined();
    expect(state.schedule!.baseline).toBeUndefined();
    const { compareWithUsual } = await import("../../lib/ui/compare");
    expect(compareWithUsual(state, doc.ref)).toBeNull();
    expect(text(doc.letter!.headline)).not.toMatch(/not at DVV|sooner/);
  });

  it("3. identification at the police is an in-person step of its own before strong ID, with its quote; not a Bring item", () => {
    // Either the derived "identification at the police" or the searched police ID card step: a police visit.
    const id = state.steps.police_identification ? "police_identification" : "police_id_card";
    const police = state.steps[id];
    expect(police).toMatchObject({ mode: "in_person", authority: "Police" });
    expect(police.citations.length).toBeGreaterThan(0);
    // The derived step's quotes all name the police; the searched step has the police's own pages among its sources.
    const aboutPolice = (c: { quote: string; url: string }) => /police|poliisi/.test(`${c.quote} ${c.url}`.toLowerCase());
    if (police.derived) expect(police.citations.every(aboutPolice)).toBe(true);
    else expect(police.citations.some(aboutPolice)).toBe(true);
    const strong = state.steps.strong_identification;
    expect(strong.requires).toContain(id);
    // A police item in Bring is only fine as the output of that required police step (the card), never instead of it.
    const policeDocs = strong.visitPack?.documents.filter((d) => /police/i.test(d)) ?? [];
    if (policeDocs.length) expect(id).toBe("police_id_card");
    expect(items()[id].readyIndex).toBeLessThanOrEqual(items().strong_identification.startIndex);
    expect(items()[id].startDate < items().strong_identification.startDate).toBe(true);
    // the derived step gets no community search and no conflict probe of its own
    if (police.derived) expect(state.tips.some((t) => t.stepId === id)).toBe(false);
  });

  it("3. the police ID card for a foreigner is in person, from a verified sentence", () => {
    const card = state.steps.police_id_card;
    expect(card.mode).toBe("in_person");
    const mode = card.claims!.filter((c) => c.kind === "mode");
    expect(mode.every((c) => c.value === "in_person")).toBe(true);
    expect(mode[0].citation.quote.toLowerCase()).toMatch(/police station/);
  });

  it("4. no filler or duplicate lines: no 'applies to your situation', one wait line per visit, 'If you skip it' only for consequences", async () => {
    const { buildDays, entrySteps } = await import("../../lib/ui/days");
    const days = buildDays(state, doc.ref);
    for (const s of days.flatMap(entrySteps)) {
      const why = text(s.whyNow as never);
      expect(why, s.id).not.toMatch(/applies to your situation|If it waits/);
      if (/If you skip it:/.test(why)) expect(why, s.id).not.toMatch(/If you skip it: (cannot|can't|need|must)/i);
    }
    expect(text(days.flatMap(entrySteps).find((s) => s.id === "residence_permit")!.whyNow as never)).not.toMatch(/confirmed employment/);
  });

  it("4. the calendar's Why line lists the same steps as the day card", async () => {
    const { buildDays } = await import("../../lib/ui/days");
    const days = buildDays(state, doc.ref);
    let compared = 0;
    for (const e of days) {
      if (e.kind !== "visit") continue;
      for (const s of e.steps) {
        const ev = state.calendar!.events.find((x) => x.kind === "visit" && x.stepId === s.id);
        if (!ev) continue;
        const why = ev.details.split("\n").find((l) => l.startsWith("Why:"));
        const expected = s.unlocks.length ? `Why: unblocks ${s.unlocks.map((id) => state.steps[id].title).join(", ")}` : "Why: nothing else depends on this step";
        expect(why, s.id).toBe(expected);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(2);
  });

  it("5. office addresses are never from another city's source when the person is in Oulu", () => {
    for (const s of Object.values(state.steps)) {
      const address = s.visitPack?.address;
      if (address) expect(address, s.id).not.toMatch(/Helsinki|Espoo|Vantaa/);
    }
  });
});
