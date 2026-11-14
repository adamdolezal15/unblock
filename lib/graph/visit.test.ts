import { describe, expect, it } from "vitest";
import type { Step } from "../types";
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

  it("all members start together, on the latest member's earliest day", () => {
    const g = buildGraph([
      step("slow_prereq"),
      step("a", ["slow_prereq"], { visitId: "v" }),
      step("b", [], { visitId: "v" }),
    ]);
    const s = schedule(g, {}, { today: "2026-09-01", estimates: { slow_prereq: { durationDays: 1, waitDays: 4 }, a: { durationDays: 1, waitDays: 0 }, b: { durationDays: 1, waitDays: 2 } } });
    expect(s.items.a.startIndex).toBe(5);
    expect(s.items.b.startIndex).toBe(5);
    // the critical path explains b's late start through its visit-mate's prerequisite
    expect(criticalPath(g, s).stepIds).toEqual(["slow_prereq", "b"]);
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
