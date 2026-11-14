import { describe, expect, it } from "vitest";
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
