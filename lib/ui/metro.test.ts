import { describe, expect, it } from "vitest";
import type { Graph, ScheduledStep } from "@/lib/graph/types";
import { crossings, hits, layoutMetro, wrap } from "./metroLayout";

const node = (id: string, authority: string, milestone = false) => ({ id, title: id, authority, mode: "in_person" as const, unresolved: false, milestone });
const graph: Graph = {
  nodes: [node("reg", "DVV"), node("vero", "Vero"), node("tax", "Vero"), node("bank", "Your bank"), node("strong", "Your bank"), node("code", "any", true)],
  edges: [
    { id: "reg->code#any0", source: "reg", target: "code", anyOf: "code#any0" },
    { id: "vero->code#any0", source: "vero", target: "code", anyOf: "code#any0" },
    { id: "code->tax", source: "code", target: "tax" },
    { id: "code->bank", source: "code", target: "bank" },
    { id: "reg->strong", source: "reg", target: "strong" },
    { id: "bank->strong", source: "bank", target: "strong" },
    { id: "code->strong", source: "code", target: "strong" },
  ],
};
const it_ = (startIndex: number, startDate: string, visitId?: string, estimated = false) =>
  ({ startIndex, readyIndex: startIndex + 1, startDate, estimated, ...(visitId ? { visitId } : {}) }) as ScheduledStep;
const items = {
  vero: it_(0, "2026-12-01", "v1"),
  tax: it_(0, "2026-12-01", "v1"),
  reg: it_(1, "2026-12-02"),
  code: it_(4, "2026-12-07"),
  bank: it_(4, "2026-12-07", undefined, true),
  strong: it_(17, "2026-12-28"),
};

export function expectNoCrossings(L: ReturnType<typeof layoutMetro>) {
  const at = new Map(L.stations.map((s) => [s.id, s]));
  for (let i = 0; i < L.edges.length; i++) {
    for (let j = i + 1; j < L.edges.length; j++) {
      const a = L.edges[i];
      const b = L.edges[j];
      const shared = [a.source, a.target].filter((x) => x === b.source || x === b.target).map((x) => at.get(x)!);
      expect(crossings(a.points, b.points, shared, L.stations.find((s) => s.row === 0)?.y), `${a.id} x ${b.id}`).toBe(0);
    }
  }
}

describe("layoutMetro", () => {
  const L = layoutMetro({ graph, steps: {}, items, criticalPath: ["reg", "strong"], width: 1000 });
  const at = (id: string) => L.stations.find((s) => s.id === id)!;

  it("puts the slowest chain on row 0 and gives every station its own column in date order", () => {
    expect(at("reg").row).toBe(0);
    expect(at("strong").row).toBe(0);
    expect(new Set(L.stations.map((s) => s.col)).size).toBe(L.stations.length);
    expect(at("vero").x).toBeLessThan(at("reg").x);
    expect(at("reg").x).toBeLessThan(at("code").x);
    expect(at("code").x).toBeLessThan(at("strong").x);
  });

  it("draws the any-of milestone as the interchange, a shared visit as one pill, an estimate hollow", () => {
    expect(at("code").kind).toBe("interchange");
    expect(L.pills).toHaveLength(1);
    expect(at("vero").row).toBe(at("tax").row);
    expect(Math.abs(at("vero").col - at("tax").col)).toBe(1);
    expect(L.hidden).toContain("code->tax");
    expect(at("bank")).toMatchObject({ hollow: true, estimate: true });
  });

  it("hides only redundant edges and routes the rest horizontally and vertically, through no station, crossing nothing", () => {
    expect(L.hidden).toContain("code->strong"); // code -> bank -> strong already says it
    for (const e of L.edges) {
      e.points.slice(1).forEach((b, i) => expect(b.x === e.points[i].x || b.y === e.points[i].y, e.id).toBe(true));
      expect(hits(e.points, L.stations, new Set([e.source, e.target])), e.id).toBe(0);
    }
    expect(L.edges.find((e) => e.id === "reg->strong")?.main).toBe(true);
    expectNoCrossings(L);
  });

  it("explains each station on hover", () => {
    expect(at("code").hint).toBe("Needs: either reg or vero. Unlocks: tax, bank, strong.");
    expect(at("vero").hint).toMatch(/^Needs: nothing first\. Unlocks: /);
  });

  it("is deterministic", () => {
    expect(layoutMetro({ graph, steps: {}, items, criticalPath: ["reg", "strong"], width: 1000 })).toEqual(L);
  });
});

describe("wrap", () => {
  it("keeps labels to two lines and never truncates", () => {
    expect(wrap("DVV registration", 12)).toEqual(["DVV", "registration"]);
    expect(wrap("Tax card", 12)).toEqual(["Tax card"]);
    const long = wrap("a very long label that goes on and on", 10);
    expect(long).toHaveLength(2);
    expect(long.join(" ")).toBe("a very long label that goes on and on");
  });
});
