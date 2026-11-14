import { describe, expect, it } from "vitest";
import type { Step } from "../types";
import { buildGraph, easterSunday, finnishHolidays, schedule } from "./index";

describe("Finnish public holidays", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2038)).toBe("2038-04-25"); // latest-possible-ish case
  });

  it("2026", () => {
    expect(finnishHolidays(2026)).toEqual([
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-01-06", name: "Epiphany" },
      { date: "2026-04-03", name: "Good Friday" },
      { date: "2026-04-06", name: "Easter Monday" },
      { date: "2026-05-01", name: "May Day" },
      { date: "2026-05-14", name: "Ascension Day" },
      { date: "2026-06-19", name: "Midsummer Eve" },
      { date: "2026-06-20", name: "Midsummer Day" },
      { date: "2026-10-31", name: "All Saints' Day" },
      { date: "2026-12-06", name: "Independence Day" },
      { date: "2026-12-24", name: "Christmas Eve" },
      { date: "2026-12-25", name: "Christmas Day" },
      { date: "2026-12-26", name: "Boxing Day" },
    ]);
  });

  it("2027", () => {
    const byName = Object.fromEntries(finnishHolidays(2027).map((h) => [h.name, h.date]));
    expect(byName).toMatchObject({
      "Good Friday": "2027-03-26",
      "Easter Monday": "2027-03-29",
      "Ascension Day": "2027-05-06",
      "Midsummer Eve": "2027-06-25",
      "Midsummer Day": "2027-06-26",
      "All Saints' Day": "2027-11-06",
      "Christmas Eve": "2027-12-24",
    });
    expect(finnishHolidays(2027)).toHaveLength(13);
  });
});

describe("schedule() with holidays", () => {
  const step = (id: string, requires: string[] = []): Step => ({ id, title: id, authority: "X", mode: "in_person", requires, citations: [] });
  const graph = buildGraph([step("a"), step("b", ["a"])]);

  it("skips Finnish holidays by default and says which holiday pushed a step", () => {
    // a: Wed 23 Dec, 1 day + 0 wait -> b would start Thu 24 Dec (Christmas Eve) -> Mon 28 Dec
    const s = schedule(graph, { arrivalDate: "2026-12-23" }, {
      today: "2026-11-14",
      estimates: { a: { durationDays: 1, waitDays: 0 }, b: { durationDays: 1, waitDays: 0 } },
    });
    expect(s.items.a.startDate).toBe("2026-12-23");
    expect(s.items.a.movedBy).toBeUndefined();
    expect(s.items.b).toMatchObject({ startDate: "2026-12-28", movedBy: { from: "2026-12-24", holiday: "Christmas Eve" } });
  });

  it("reports the holiday when the arrival day itself is one", () => {
    const s = schedule(graph, { arrivalDate: "2026-12-06" }, { today: "2026-11-14" }); // Independence Day is a Sunday in 2026
    expect(s.items.a.movedBy).toBeUndefined(); // a Sunday holiday pushes nothing a weekend wouldn't
    const ny = schedule(graph, { arrivalDate: "2027-01-01" }, { today: "2026-11-14" }); // Fri
    expect(ny.items.a).toMatchObject({ startDate: "2027-01-04", movedBy: { from: "2027-01-01", holiday: "New Year's Day" } });
  });

  it("holidays: [] turns them off", () => {
    const s = schedule(graph, { arrivalDate: "2026-12-24" }, { today: "2026-11-14", holidays: [] });
    expect(s.items.a.startDate).toBe("2026-12-24");
  });
});
