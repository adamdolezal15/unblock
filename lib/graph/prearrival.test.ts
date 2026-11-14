import { describe, expect, it } from "vitest";
import type { Step } from "../types";
import { buildGraph } from "./buildGraph";
import { workingDaysBetween } from "./dates";
import { schedule } from "./schedule";

const step = (id: string, extra: Partial<Step> = {}): Step => ({ id, title: id, authority: "A", mode: "in_person", requires: [], citations: [], ...extra });

describe("steps applied for before arrival", () => {
  const steps = [step("permit", { beforeArrival: true }), step("dvv", { requires: ["permit"] }), step("bank")];
  const est = { permit: { waitDays: 10, durationDays: 1 } };

  it("start today; everything else starts on arrival or later", () => {
    const s = schedule(buildGraph(steps), { arrivalDate: "2027-02-01" }, { today: "2026-11-16", estimates: est, holidays: [] });
    expect(s.startDate).toBe("2026-11-16");
    expect(s.items.permit.startDate).toBe("2026-11-16");
    expect(s.items.permit.readyDate < "2027-02-01").toBe(true);
    expect(s.items.dvv.startDate).toBe("2027-02-01");
    expect(s.items.bank.startDate).toBe("2027-02-01"); // independent of the permit, still not before arrival
  });

  it("a permit that is not ready by arrival delays what needs it, not what does not", () => {
    const s = schedule(buildGraph(steps), { arrivalDate: "2026-11-23" }, { today: "2026-11-16", estimates: est, holidays: [] });
    expect(s.items.dvv.startDate).toBe(s.items.permit.readyDate);
    expect(s.items.dvv.startDate > "2026-11-23").toBe(true);
    expect(s.items.bank.startDate).toBe("2026-11-23");
  });

  it("without such a step the plan still starts on the arrival day", () => {
    const s = schedule(buildGraph([step("a"), step("b", { requires: ["a"] })]), { arrivalDate: "2027-02-01" }, { today: "2026-11-16", holidays: [] });
    expect(s.startDate).toBe("2027-02-01");
  });
});

describe("workingDaysBetween", () => {
  it("counts working days in (from, to]", () => {
    expect(workingDaysBetween("2026-11-16", "2026-11-20")).toBe(4);
    expect(workingDaysBetween("2026-11-20", "2026-11-23")).toBe(1); // over a weekend
    expect(workingDaysBetween("2026-11-20", "2026-11-23", new Set(["2026-11-23"]))).toBe(0);
    expect(workingDaysBetween("2026-11-23", "2026-11-20")).toBe(-1);
  });
});
