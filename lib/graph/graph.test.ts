import { describe, expect, it } from "vitest";
import type { Step } from "../types";
import {
  buildGraph,
  costOfDelayUrgency,
  criticalNode,
  criticalPath,
  isWorkingDay,
  priorityScores,
  schedule,
  toHelsinkiDate,
  topoOrder,
} from "./index";

function step(id: string, requires: string[] = [], extra: Partial<Step> = {}): Step {
  return { id, title: id.toUpperCase(), authority: "X", mode: "online", requires, citations: [], ...extra };
}

/** All estimates known, no waiting: one working day per step. */
const oneDay = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { durationDays: 1, waitDays: 0 }]));

// 2026-09-01 is a Tuesday; 2026-09-04 a Friday.
const TODAY = "2026-08-01";

describe("dates", () => {
  it("knows weekends", () => {
    expect(isWorkingDay("2026-09-04")).toBe(true); // Fri
    expect(isWorkingDay("2026-09-05")).toBe(false); // Sat
    expect(isWorkingDay("2026-09-06")).toBe(false); // Sun
    expect(isWorkingDay("2026-09-07")).toBe(true); // Mon
  });

  it("converts timestamps to the Helsinki calendar date", () => {
    expect(toHelsinkiDate("2026-09-01")).toBe("2026-09-01");
    // 22:30 UTC on 31 Aug is 01:30 on 1 Sept in Helsinki (UTC+3 in summer).
    expect(toHelsinkiDate("2026-08-31T22:30:00Z")).toBe("2026-09-01");
    expect(toHelsinkiDate("2026-12-31T21:59:00Z")).toBe("2026-12-31"); // UTC+2 in winter
  });
});

describe("simple chain", () => {
  const steps = [step("a"), step("b", ["a"]), step("c", ["b"])];
  const graph = buildGraph(steps);

  it("builds nodes and prerequisite -> dependent edges", () => {
    expect(graph.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(graph.edges).toEqual([
      { id: "a->b", source: "a", target: "b" },
      { id: "b->c", source: "b", target: "c" },
    ]);
    expect(graph.nodes.every((n) => !n.unresolved)).toBe(true);
  });

  it("orders, finds the critical node and schedules sequentially", () => {
    expect(topoOrder(graph)).toEqual({ order: ["a", "b", "c"], deadlocks: [], blocked: [] });
    expect(criticalNode(graph)).toBe("a");

    const s = schedule(graph, { arrivalDate: "2026-09-01" }, { today: TODAY, estimates: oneDay("a", "b", "c") });
    expect(s.startDate).toBe("2026-09-01");
    expect(s.items.a.startDate).toBe("2026-09-01");
    expect(s.items.b.startDate).toBe("2026-09-02");
    expect(s.items.c.startDate).toBe("2026-09-03");
    expect(Object.values(s.items).every((i) => !i.estimated)).toBe(true);

    expect(criticalPath(graph, s)).toEqual({ stepIds: ["a", "b", "c"], totalDays: 3, calendarDays: 3 });
  });

  it("scores priority as transitive dependents x urgency", () => {
    const g = buildGraph([
      step("tax_card", [], { costOfDelay: "60 % tax withheld from salary" }),
      step("payroll", ["tax_card"]),
      step("bank", ["payroll"]),
    ]);
    expect(priorityScores(g)).toEqual({ tax_card: 2 * 4, payroll: 1 * 1, bank: 0 });
  });
});

describe("parallel branches", () => {
  // a -> {b, c} -> d
  const graph = buildGraph([step("a"), step("b", ["a"]), step("c", ["a"]), step("d", ["b", "c"])]);
  const estimates = { a: { durationDays: 1, waitDays: 0 }, b: { durationDays: 1, waitDays: 4 }, c: { durationDays: 1, waitDays: 0 }, d: { durationDays: 1, waitDays: 0 } };

  it("runs independent steps on the same day and waits for the slowest prerequisite", () => {
    const s = schedule(graph, { arrivalDate: "2026-09-01" }, { today: TODAY, estimates });
    expect(s.items.b.startDate).toBe("2026-09-02");
    expect(s.items.c.startDate).toBe("2026-09-02");
    // b: 1 day of work + 4 working days of wait -> ready Wed 9 Sept (weekend skipped).
    expect(s.items.b.readyDate).toBe("2026-09-09");
    expect(s.items.c.readyDate).toBe("2026-09-03");
    expect(s.items.d.startDate).toBe("2026-09-09");
  });

  it("follows the slow branch on the critical path", () => {
    const s = schedule(graph, { arrivalDate: "2026-09-01" }, { today: TODAY, estimates });
    expect(criticalPath(graph, s)).toEqual({ stepIds: ["a", "b", "d"], totalDays: 7, calendarDays: 9 });
  });

  it("breaks critical-node ties by in_person, then cost of delay", () => {
    const tie = (modes: Step["mode"][], costs: (string | undefined)[] = []) =>
      criticalNode(
        buildGraph([
          step("x", [], { mode: modes[0], costOfDelay: costs[0] }),
          step("y", [], { mode: modes[1], costOfDelay: costs[1] }),
          step("z", ["x", "y"]),
        ]),
      );
    expect(tie(["online", "online"])).toBe("x"); // input order
    expect(tie(["online", "in_person"])).toBe("y");
    expect(tie(["online", "online"], [undefined, "Fine for late registration"])).toBe("y");
    expect(tie(["in_person", "online"], [undefined, "Fine for late registration"])).toBe("x");
  });

  it("returns no critical node when nothing depends on anything", () => {
    expect(criticalNode(buildGraph([step("a"), step("b")]))).toBeNull();
    expect(criticalNode(buildGraph([]))).toBeNull();
  });
});

describe("cycle (deadlock)", () => {
  const steps = [
    step("dvv_registration", [], { title: "Register at DVV", mode: "in_person" }),
    step("police_id_online", ["strong_identification"], { title: "Apply for ID card online" }),
    step("strong_identification", ["bank_account"], { title: "Get strong electronic identification" }),
    step("bank_account", ["police_id_online", "dvv_registration"], { title: "Open a bank account", mode: "in_person" }),
    step("kela_card", ["police_id_online"], { title: "Kela card" }),
  ];
  const graph = buildGraph(steps);

  it("returns the cycle as a deadlock instead of throwing", () => {
    const r = topoOrder(graph);
    expect(r.order).toEqual(["dvv_registration"]);
    expect(r.deadlocks).toHaveLength(1);
    expect(r.deadlocks[0].stepIds).toEqual(["police_id_online", "strong_identification", "bank_account"]);
    expect(r.deadlocks[0].explanation).toContain(
      '"Apply for ID card online" requires "Get strong electronic identification" requires "Open a bank account" requires "Apply for ID card online"',
    );
    expect(r.blocked.sort()).toEqual(["bank_account", "kela_card", "police_id_online", "strong_identification"]);
  });

  it("schedules what it can and leaves blocked steps out", () => {
    const s = schedule(graph, { arrivalDate: "2026-09-01" }, { today: TODAY });
    expect(Object.keys(s.items)).toEqual(["dvv_registration"]);
    expect(s.deadlocks).toHaveLength(1);
    expect(s.blocked).toContain("kela_card");
    expect(criticalPath(graph, s).stepIds).toEqual(["dvv_registration"]);
  });

  it("counts dependents blocked through the cycle", () => {
    // Cycle members each block 3 steps; dvv_registration blocks all 4 others.
    expect(criticalNode(graph)).toBe("dvv_registration");
  });

  it("reports a self-requiring step and multiple independent cycles", () => {
    const r = topoOrder(buildGraph([step("a", ["a"]), step("b", ["c"]), step("c", ["b"]), step("d")]));
    expect(r.order).toEqual(["d"]);
    expect(r.deadlocks.map((d) => d.stepIds)).toEqual([["a"], ["b", "c"]]);
    expect(r.deadlocks[0].explanation).toContain("requires itself");
  });
});

describe("unresolved node", () => {
  const graph = buildGraph([step("work_permit_card", ["residence_permit"]), step("tax_card", ["work_permit_card"])]);

  it("creates a flagged placeholder for unknown requires ids", () => {
    const placeholder = graph.nodes.find((n) => n.id === "residence_permit")!;
    expect(placeholder).toMatchObject({ unresolved: true, title: "Residence permit", authority: "unknown" });
    expect(placeholder.step).toBeUndefined();
    expect(graph.edges).toContainEqual({ id: "residence_permit->work_permit_card", source: "residence_permit", target: "work_permit_card" });
    expect(topoOrder(graph).order).toEqual(["residence_permit", "work_permit_card", "tax_card"]);
  });

  it("schedules placeholders and unknown durations with defaults marked estimated", () => {
    const s = schedule(graph, {}, { today: "2026-09-01", estimates: { tax_card: { durationDays: 1, waitDays: 0 } } });
    expect(s.items.residence_permit).toMatchObject({ durationDays: 1, waitDays: 5, estimated: true });
    expect(s.items.tax_card.estimated).toBe(false);
    // Partial estimate: wait still defaulted, so still estimated.
    const p = schedule(graph, {}, { today: "2026-09-01", estimates: { tax_card: { durationDays: 2 } } });
    expect(p.items.tax_card).toMatchObject({ durationDays: 2, waitDays: 5, estimated: true });
  });

  it("merges duplicate step ids", () => {
    const g = buildGraph([step("a"), step("b", ["a"]), step("b", ["c"])]);
    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(g.nodes.find((n) => n.id === "c")!.unresolved).toBe(true);
    expect(g.edges.map((e) => e.id)).toEqual(["a->b", "c->b"]);
  });
});

describe("weekend skipping", () => {
  const graph = buildGraph([step("a"), step("b", ["a"])]);

  it("pushes the next step past the weekend", () => {
    const s = schedule(graph, { arrivalDate: "2026-09-04" }, { today: TODAY, estimates: oneDay("a", "b") });
    expect(s.items.a.startDate).toBe("2026-09-04"); // Fri
    expect(s.items.b.startDate).toBe("2026-09-07"); // Mon
  });

  it("starts on Monday when arriving on a Saturday", () => {
    const s = schedule(graph, { arrivalDate: "2026-09-05" }, { today: TODAY, estimates: oneDay("a", "b") });
    expect(s.startDate).toBe("2026-09-07");
  });

  it("counts multi-day work and waits in working days only", () => {
    const s = schedule(graph, { arrivalDate: "2026-09-03" }, {
      today: TODAY,
      estimates: { a: { durationDays: 2, waitDays: 1 }, b: { durationDays: 1, waitDays: 0 } },
    });
    expect(s.items.a).toMatchObject({ startDate: "2026-09-03", endDate: "2026-09-04", doneDate: "2026-09-07", readyDate: "2026-09-08" });
    expect(s.items.b.startDate).toBe("2026-09-08");
    expect(criticalPath(graph, s)).toEqual({ stepIds: ["a", "b"], totalDays: 4, calendarDays: 6 });
  });

  it("skips given holidays", () => {
    const s = schedule(graph, { arrivalDate: "2026-12-04" }, {
      today: TODAY,
      estimates: oneDay("a", "b"),
      holidays: ["2026-12-07"],
    });
    expect(s.items.b.startDate).toBe("2026-12-08");
  });
});

describe("arrival date in the past", () => {
  const graph = buildGraph([step("a")]);

  it("starts today instead", () => {
    const s = schedule(graph, { arrivalDate: "2026-01-10" }, { today: "2026-11-13" });
    expect(s.startDate).toBe("2026-11-13");
  });

  it("starts on the next working day when today is a weekend", () => {
    const s = schedule(graph, { arrivalDate: "2026-01-10" }, { today: "2026-11-14" });
    expect(s.startDate).toBe("2026-11-16");
  });

  it("uses today when there is no arrival date", () => {
    expect(schedule(graph, {}, { today: "2026-11-13" }).startDate).toBe("2026-11-13");
  });
});

describe("costOfDelayUrgency", () => {
  it("ranks legal > money > blocking > other > none", () => {
    expect(costOfDelayUrgency("Fine of up to 500 EUR")).toBe(5);
    expect(costOfDelayUrgency("60 % tax withheld from salary")).toBe(4);
    expect(costOfDelayUrgency("Cannot open a bank account")).toBe(3);
    expect(costOfDelayUrgency("Annoying")).toBe(2);
    expect(costOfDelayUrgency(undefined)).toBe(1);
    expect(costOfDelayUrgency("  ")).toBe(1);
  });
});

describe("empty graph", () => {
  it("handles no steps", () => {
    const g = buildGraph([]);
    const s = schedule(g, {}, { today: TODAY });
    expect(topoOrder(g)).toEqual({ order: [], deadlocks: [], blocked: [] });
    expect(criticalPath(g, s)).toEqual({ stepIds: [], totalDays: 0, calendarDays: 0 });
  });
});
