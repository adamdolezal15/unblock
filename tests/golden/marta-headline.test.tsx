// Marta's answer header as /?demo=marta renders it: POST /api/run (offline from the demo cache) -> the
// browser's reducer -> refinements (none in the URL) -> Hero. The headline names the Vero shortcut and the
// meta line says how many days sooner. Guards the identity/declutter passes, which only touch components.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { RefineKey } from "../../lib/refine/refine";
import type { RunState } from "../../lib/ui/runState";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

let run: RunState;

beforeAll(async () => {
  const { POST } = await import("../../app/api/run/route");
  const { initialRunState, runReducer } = await import("../../lib/ui/runState");
  const text = (await import("../../lib/demo/sentences")).DEMO_SENTENCES.marta;
  const res = await POST(
    new Request("http://localhost/api/run?fast=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }),
  );
  run = runReducer(initialRunState, { type: "start", text, at: 0 });
  for (const l of (await res.text()).split("\n").filter(Boolean)) run = runReducer(run, { type: "event", event: JSON.parse(l), at: 1 });
  expect(run.phase).toBe("done");
}, 120_000);

async function header(answers: RefineKey[] = []) {
  const rs = await import("../../lib/ui/refineState");
  const { buildLetter } = await import("../../lib/ui/letter");
  const { compareWithUsual } = await import("../../lib/ui/compare");
  const { Hero } = await import("../../components/Hero");
  const state = rs.refineState(run, answers, rs.refineInput(run));
  const doc = buildLetter(state);
  const comparison = compareWithUsual(state, doc.ref);
  const html = renderToStaticMarkup(createElement(Hero, { state, doc, comparison, onOpen: () => {} }));
  return {
    headline: doc.letter!.headline.map((s) => ("t" in s ? s.t : "")).join(""),
    gain: comparison?.gain?.days ?? 0,
    page: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
  };
}

describe("golden: Marta's answer header (?demo=marta)", () => {
  it("names the Vero shortcut and a gain of more than 0 days", async () => {
    const h = await header();
    expect(h.headline).toMatch(/Vero/);
    expect(h.gain).toBeGreaterThan(0);
    expect(h.page).toMatch(/Vero/);
    expect(h.page).toMatch(new RegExp(`\\b${h.gain} days sooner\\b`));
    expect(h.page).toMatch(/\b5 visits\b/);
  });

  it("only an 'I already have a code' answer (?r=has_code) takes the shortcut away", async () => {
    const h = await header(["has_code"]);
    expect(h.headline).not.toMatch(/Vero/);
    expect(h.gain).toBe(0);
    expect(h.page).toMatch(/same order as usual/);
  });
});
