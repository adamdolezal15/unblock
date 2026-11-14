import { describe, expect, it } from "vitest";
import { sortSteps } from "@/components/StepsPreview";
import type { Step } from "@/lib/types";
import { assumptionLabel } from "./assumptionLabel";
import { DIAMOND, layoutGraph, NODE_W } from "./graphLayout";
import type { Graph, ScheduledStep } from "@/lib/graph/types";
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

describe("layoutGraph", () => {
  const node = (id: string, authority: string, milestone = false) => ({ id, title: id, authority, mode: "in_person" as const, unresolved: false, milestone });
  const graph: Graph = {
    nodes: [node("reg", "DVV"), node("vero", "Vero"), node("tax", "Vero"), node("bank", "Bank"), node("code", "any", true)],
    edges: [
      { id: "reg->code#any0", source: "reg", target: "code", anyOf: "code#any0" },
      { id: "vero->code#any0", source: "vero", target: "code", anyOf: "code#any0" },
      { id: "code->tax", source: "code", target: "tax" },
      { id: "code->bank", source: "code", target: "bank" },
    ],
  };
  const it_ = (startIndex: number, readyIndex: number, startDate: string, visitId?: string) =>
    ({ startIndex, readyIndex, startDate, estimated: false, ...(visitId ? { visitId } : {}) }) as ScheduledStep;
  const items = { reg: it_(1, 9, "2026-12-02"), vero: it_(0, 4, "2026-12-01", "v1"), tax: it_(0, 1, "2026-12-01", "v1"), bank: it_(4, 8, "2026-12-07") };

  it("places columns by start date, the milestone as an any-of diamond, lanes by authority", () => {
    const L = layoutGraph({ graph, steps: {}, items, criticalPath: ["vero", "bank"] });
    const x = (id: string) => L.nodes.find((n) => n.id === id)!.x;
    expect(x("vero")).toBe(x("tax"));
    expect(x("vero")).toBeLessThan(x("reg"));
    expect(x("reg")).toBeLessThan(x("code"));
    expect(x("code")).toBeLessThan(x("bank"));
    expect(L.nodes.find((n) => n.id === "code")!.type).toBe("anyof");
    expect(L.nodes.filter((n) => n.type === "lane").map((n) => (n.data as { label: string }).label)).toEqual(["Vero", "DVV", "Bank"]);
    expect(L.nodes.filter((n) => n.type === "tick").map((n) => (n.data as { label: string }).label)).toEqual(["2026-12-01", "2026-12-02", "2026-12-07"]);
    expect(L.nodes.some((n) => n.type === "frame")).toBe(true);
  });

  it("does not draw a requirement met inside a framed visit, but reports it as hidden", () => {
    const L = layoutGraph({ graph, steps: {}, items });
    expect(L.edges.find((x) => x.id === "code->tax")).toBeUndefined();
    expect(L.hiddenEdges).toEqual(["code->tax"]);
    expect(L.edges).toHaveLength(graph.edges.length - 1);
  });

  it("routes edges orthogonally and never through a node", () => {
    for (const L of [layoutGraph({ graph, steps: {}, items }), layoutGraph({ graph, steps: {} })]) {
      const boxes = L.nodes
        .filter((n) => n.type === "step" || n.type === "anyof")
        .map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.type === "step" ? NODE_W : DIAMOND, h: n.type === "step" ? (n.data as { height: number }).height : DIAMOND }));
      for (const e of L.edges) {
        e.points.slice(1).forEach((b, i) => {
          const a = e.points[i];
          expect(a.x === b.x || a.y === b.y).toBe(true);
          for (const r of boxes) {
            if (r.id === e.source || r.id === e.target) continue;
            const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
            const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
            const hit = x1 < r.x + r.w && x2 > r.x && y1 < r.y + r.h && y2 > r.y;
            expect(hit, `${e.id} crosses ${r.id}`).toBe(false);
          }
        });
      }
    }
  });

  it("falls back to topological depth before the schedule exists", () => {
    const L = layoutGraph({ graph, steps: {} });
    const x = (id: string) => L.nodes.find((n) => n.id === id)!.x;
    expect(L.dated).toBe(false);
    expect(x("reg")).toBeLessThan(x("code"));
    expect(x("code")).toBeLessThan(x("bank"));
    expect(L.edges.every((e) => !e.backward)).toBe(true);
  });
});
