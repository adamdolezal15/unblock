import { describe, expect, it } from "vitest";
import { activityLine } from "./format";

describe("activityLine", () => {
  it("summarises each actor's work in one line", () => {
    expect(activityLine({ searches: 31, pagesRead: 6, extractions: 14, quotesChecked: 120, quotesDropped: 7 })).toBe(
      "Exa: 31 searches, 6 pages read · Claude: 14 extractions · 120 quotes checked, 7 dropped",
    );
    expect(activityLine({ searches: 1, pagesRead: 1, extractions: 1, quotesChecked: 1, quotesDropped: 0 })).toBe(
      "Exa: 1 search, 1 page read · Claude: 1 extraction · 1 quote checked, 0 dropped",
    );
  });
});
import { sortSteps } from "@/components/StepsPreview";
import type { Step } from "@/lib/types";
import { assumptionLabel } from "./assumptionLabel";
import { initialRunState, runReducer } from "./runState";

describe("assumptionLabel", () => {
  it.each([
    ["Salary of 3200 EUR is treated as gross per month.", "gross salary"],
    ["No Finnish city named; assumed Helsinki.", "city Helsinki"],
    ["No city named; assumed Espoo from the university mentioned.", "city Espoo"],
    ["Arrival date not stated; planning from today.", "arrival date"],
    ["Only the month was given; assumed the 1st (2027-01-01).", "arrival on the 1st"],
    ["PhD treated as study; many Finnish doctoral positions are employment, mention it if yours is.", "PhD as study"],
    ["Purpose not stated; assumed work.", "purpose: work"],
    ["Something entirely different was guessed here.", "Something entirely different was…"],
  ])("%s -> %s", (sentence, label) => expect(assumptionLabel(sentence)).toBe(label));
});

const step = (id: string): Step => ({ id, title: id, authority: "X", mode: "online", requires: [], citations: [] });

describe("sortSteps", () => {
  it("orders by scheduled start, then topological order, then arrival", () => {
    const steps = [step("a"), step("b"), step("c"), step("d")];
    const item = (startDate: string) => ({ startDate }) as never;
    const items = { a: item("2026-12-07"), b: item("2026-12-01"), c: item("2026-12-07") };
    expect(sortSteps(steps, items, ["c", "a", "b", "d"]).map((s) => s.id)).toEqual(["b", "c", "a", "d"]);
    expect(sortSteps(steps).map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("runReducer", () => {
  it("upserts steps by id and keeps first-seen order", () => {
    let s = runReducer(initialRunState, { type: "start", text: "x", at: 0 });
    s = runReducer(s, { type: "event", event: { type: "step", step: step("a") }, at: 1 });
    s = runReducer(s, { type: "event", event: { type: "step", step: step("b") }, at: 2 });
    s = runReducer(s, { type: "event", event: { type: "step", step: { ...step("a"), title: "A2" } }, at: 3 });
    expect(s.stepOrder).toEqual(["a", "b"]);
    expect(s.steps.a.title).toBe("A2");
  });

  it("treats a stream that ends without done as an error", () => {
    const s = runReducer(runReducer(initialRunState, { type: "start", text: "x", at: 0 }), { type: "end", at: 1 });
    expect(s.phase).toBe("error");
  });
});

describe("viewFromHash", () => {
  it("reads the view from the URL hash, defaulting to Day by day", async () => {
    const { viewFromHash } = await import("./useView");
    expect(viewFromHash("#map")).toBe("map");
    expect(viewFromHash("#summary")).toBe("summary");
    expect(viewFromHash("")).toBe("days");
    expect(viewFromHash("#nonsense")).toBe("days");
  });
});

describe("profileParts", () => {
  const read = async (p: Parameters<typeof import("./profileSentence").profileParts>[0], a: string[], t: string) => {
    const { profileParts } = await import("./profileSentence");
    return profileParts(p, a, t).map((x) => ("t" in x ? x.t : x.value)).join("");
  };
  it("does not repeat family, and puts the month-only assumption next to the date", async () => {
    expect(
      await read(
        { citizenship: "NON_EU", purpose: ["study", "family"], city: "Tampere", arrivalDate: "2027-01-01", hasFamily: true },
        ["The wife's nationality is assumed to be Brazilian like the writer.", "A PhD is treated as study.", "Only the month was given; assumed the 1st (2027-01-01)."],
        "Brazilian PhD student moving to Tampere with my wife in January",
      ),
    ).toBe("You're a Brazilian citizen, studying in Tampere from 1 January (I assumed the 1st), with your family. I assumed your partner has the same citizenship and your PhD counts as study.");
  });
  it("never shows a truncated assumption", async () => {
    expect(
      await read({ citizenship: "NON_EU", purpose: ["work"], city: "Helsinki", arrivalDate: "2026-11-21" }, ["Software engineer interpreted as moving to Finland for work."], "Indian software engineer"),
    ).toBe("You're an Indian citizen, working in Helsinki from 21 November. I assumed you are coming to work.");
  });
});

describe("runProgress", () => {
  it("moves with the agent's own reported work and never claims done early", async () => {
    const { runProgress } = await import("./progress");
    let s = runReducer(initialRunState, { type: "start", text: "x", at: 0 });
    const status = (message: string) => (s = runReducer(s, { type: "event", event: { type: "status", message, actor: "exa" }, at: 1 }));
    const p0 = runProgress(s).value;
    status("Searching official sources for Tax card…");
    status("Searching official sources for Bank account…");
    status("Extracting cited steps from 5 sources (vero.fi)…");
    const p1 = runProgress(s).value;
    status("Verifying 12 quotes against the source text…");
    status("Extracting cited steps from 4 sources (op.fi)…");
    const p2 = runProgress(s).value;
    expect(p0).toBeLessThan(p1);
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(0.99);
    s = runReducer(s, { type: "event", event: { type: "done", summary: {} as never }, at: 2 });
    expect(runProgress(s).value).toBe(1);
  });
});

describe("mainLegs", () => {
  it("is blue from the first to the last station on the slowest chain", async () => {
    const { mainLegs } = await import("../../components/line/legs");
    expect(mainLegs([true, false, true, true])).toEqual([true, true, true]);
    expect(mainLegs([false, true, false, true, false])).toEqual([false, true, true, false]);
    expect(mainLegs([false, false])).toEqual([false]);
  });
});
