import { describe, expect, it } from "vitest";
import type { Step } from "../types";
import { describeVisitAlternative } from "./describe";
import { buildGraph, criticalPath, schedule } from "./index";

function step(id: string, requires: string[] = [], extra: Partial<Step> = {}): Step {
  return { id, title: id, authority: "X", mode: "in_person", requires, citations: [], ...extra };
}
const TODAY = "2026-11-14";

describe("same visit (shared visitId)", () => {
  // Marta's shape: the tax card needs an ID code; Vero can issue the code at the same desk visit.
  const base = (visitId?: string) =>
    buildGraph([
      step("eu_registration"),
      step("dvv_registration", ["eu_registration"]),
      step("vero_identity_code", [], { visitId }),
      step("personal_identity_code", [], { milestone: true, requiresAnyOf: [["dvv_registration", "vero_identity_code"]] }),
      step("tax_card", ["personal_identity_code"], { visitId }),
      step("bank_account", ["personal_identity_code"]),
    ]);
  const estimates = {
    eu_registration: { durationDays: 1, waitDays: 0 },
    dvv_registration: { durationDays: 1, waitDays: 5 },
    vero_identity_code: { durationDays: 1, waitDays: 3 },
    tax_card: { durationDays: 1, waitDays: 3 },
    bank_account: { durationDays: 1, waitDays: 10 },
  };

  it("without a shared visit the tax card waits for the code's processing", () => {
    const s = schedule(base(), { arrivalDate: "2026-12-01" }, { today: TODAY, estimates });
    expect(s.items.tax_card.startIndex).toBe(4);
  });

  it("with a shared visit the tax card is done on day 1, at the same desk visit", () => {
    const g = base("visit:vero");
    expect(g.nodes.find((n) => n.id === "tax_card")!.visitId).toBe("visit:vero");
    const s = schedule(g, { arrivalDate: "2026-12-01" }, { today: TODAY, estimates });
    expect(s.items.tax_card).toMatchObject({ startIndex: 0, startDate: "2026-12-01", visitId: "visit:vero" });
    expect(s.items.vero_identity_code.startIndex).toBe(0);
    // others still wait for the code's processing time: the code is only *usable* elsewhere later
    expect(s.items.bank_account.startIndex).toBe(4);
  });

  it("picks SEPARATE when that ends the plan earlier, and reports merged as the alternative", () => {
    const g = buildGraph([
      step("slow_prereq"),
      step("a", ["slow_prereq"], { visitId: "v" }),
      step("b", [], { visitId: "v" }),
    ]);
    const s = schedule(g, {}, { today: "2026-09-01", holidays: [], estimates: { slow_prereq: { durationDays: 1, waitDays: 4 }, a: { durationDays: 1, waitDays: 0 }, b: { durationDays: 1, waitDays: 2 } } });
    // merged: both on day 5, b ready day 8 -> plan end 8; separate: b day 0 (ready 3), a day 5 (ready 6) -> end 6
    expect(s.items.b).toMatchObject({ startIndex: 0, visitGroup: "v" });
    expect(s.items.b.visitId).toBeUndefined();
    expect(s.items.a.startIndex).toBe(5);
    const [choice] = s.visitChoices;
    expect(choice.chosen).toMatchObject({ mode: "separate", visits: 2 });
    expect(choice.alternative).toMatchObject({ mode: "merged", visits: 1, planEndShift: { workingDays: 2 } });
    expect(choice.alternative.members.b.startDate).toBe("2026-09-08");
    expect(criticalPath(g, s).stepIds).toEqual(["slow_prereq", "a"]);
  });

  it("tie on the plan end: fewer visits wins", () => {
    const g = buildGraph([step("a", [], { visitId: "v" }), step("b", [], { visitId: "v" }), step("c")]);
    const s = schedule(g, {}, { today: "2026-09-01", holidays: [], estimates: { a: { durationDays: 1, waitDays: 0 }, b: { durationDays: 1, waitDays: 0 }, c: { durationDays: 1, waitDays: 9 } } });
    expect(s.visitChoices[0].chosen.mode).toBe("merged");
    expect(s.visitChoices[0].alternative).toMatchObject({ mode: "separate", visits: 2, planEndShift: { workingDays: 0, calendarDays: 0 } });
  });

  it("Marta's bank: merged on 10 Dec beats opening the account alone on 7 Dec", () => {
    const g = buildGraph([
      step("eu_registration"),
      step("dvv_registration", ["eu_registration"]),
      step("vero_identity_code"),
      step("personal_identity_code", [], { milestone: true, requiresAnyOf: [["dvv_registration", "vero_identity_code"]] }),
      step("bank_account", ["personal_identity_code"], { visitId: "visit:bank" }),
      step("strong_identification", ["personal_identity_code", "dvv_registration", "bank_account"], { visitId: "visit:bank" }),
    ]);
    const est = {
      eu_registration: { durationDays: 1, waitDays: 0 },
      dvv_registration: { durationDays: 1, waitDays: 5 },
      vero_identity_code: { durationDays: 1, waitDays: 3 },
      bank_account: { durationDays: 1, waitDays: 10 },
      strong_identification: { durationDays: 1, waitDays: 10 },
    };
    const s = schedule(g, { arrivalDate: "2026-12-01" }, { today: "2026-11-14", estimates: est });
    // merged: both on Thu 10 Dec (DVV ready), ready 29 Dec (24-26 Dec are holidays)
    expect(s.items.bank_account).toMatchObject({ startDate: "2026-12-10", readyDate: "2026-12-29", visitId: "visit:bank" });
    expect(s.items.strong_identification).toMatchObject({ startDate: "2026-12-10", readyDate: "2026-12-29", visitId: "visit:bank" });
    const choice = s.visitChoices.find((c) => c.visitId === "visit:bank")!;
    expect(choice.chosen).toMatchObject({ mode: "merged", visits: 1, planEnd: "2026-12-29" });
    // separate: account on 7 Dec, ready 22 Dec; strong ID then waits for the account -> ready 12 Jan
    expect(choice.alternative).toMatchObject({
      mode: "separate",
      visits: 2,
      planEnd: "2027-01-12",
      planEndShift: { calendarDays: 14 },
      members: {
        bank_account: { startDate: "2026-12-07", readyDate: "2026-12-22" },
        strong_identification: { readyDate: "2027-01-12" },
      },
      memberShift: { bank_account: { readyDays: -7 }, strong_identification: { readyDays: 14 } },
    });
    expect(describeVisitAlternative(choice, (id) => ({ bank_account: "the bank account", strong_identification: "strong ID" })[id] ?? id)).toBe(
      "Alternative: do the bank account on 7 Dec separately → the bank account ready 1 week earlier, but strong ID 2 weeks later and 1 extra visit. Whole plan ends 2 weeks later.",
    );
  });

  it("does not drop a requirement whose visit-mate can never be done", () => {
    const g = buildGraph([
      step("x", ["x"], { visitId: "v" }), // self-deadlocked
      step("y", ["x"], { visitId: "v" }),
    ]);
    const s = schedule(g, {}, { today: "2026-09-01" });
    expect(s.items.y).toBeUndefined();
  });
});
