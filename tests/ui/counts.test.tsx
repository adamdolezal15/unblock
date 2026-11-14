// Every count the page shows (header, closing sentence, activity log, sources list) comes from lib/ui/counts and
// says the same thing in the same words. Marta from the demo cache (offline), as /?demo=marta renders it, with
// and without a refinement. Also: a replay never shows its own (replay) time.
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
let text: string;

beforeAll(async () => {
  const { POST } = await import("../../app/api/run/route");
  const { initialRunState, runReducer } = await import("../../lib/ui/runState");
  text = (await import("../../lib/demo/sentences")).DEMO_SENTENCES.marta;
  const res = await POST(
    new Request("http://localhost/api/run?fast=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }),
  );
  run = runReducer(initialRunState, { type: "start", text, at: 0 });
  for (const l of (await res.text()).split("\n").filter(Boolean)) run = runReducer(run, { type: "event", event: JSON.parse(l), at: 1 });
  expect(run.phase).toBe("done");
  expect(run.summary!.calls.exaLive + run.summary!.calls.llmLive).toBe(0); // a replay: everything from cache
}, 120_000);

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ").trim();

async function page(answers: RefineKey[]) {
  const rs = await import("../../lib/ui/refineState");
  const { buildLetter } = await import("../../lib/ui/letter");
  const { compareWithUsual } = await import("../../lib/ui/compare");
  const { planNumbers } = await import("../../lib/ui/counts");
  const { Hero } = await import("../../components/Hero");
  const { Closing } = await import("../../components/letter/Closing");
  const { ActivityFeed } = await import("../../components/ActivityFeed");
  const { SourcesList } = await import("../../components/letter/SourcesList");
  const state = rs.refineState(run, answers, rs.refineInput(run));
  const doc = buildLetter(state);
  const n = planNumbers(state);
  const r = (el: Parameters<typeof renderToStaticMarkup>[0]) => plain(renderToStaticMarkup(el));
  return {
    state,
    n,
    hero: r(createElement(Hero, { state, doc, comparison: compareWithUsual(state, doc.ref), onOpen: () => {} })),
    closing: r(createElement(Closing, { summary: state.summary!, numbers: n })),
    feed: r(
      createElement(ActivityFeed, {
        // The per-search progress lines ("Found 5 official sources") count one search; the summary lines are checked here,
        // the status lines' step counts in their own test below.
        statuses: [],
        notes: [],
        running: false,
        elapsedMs: n.durationMs ?? undefined,
        collapsed: false,
        onToggle: () => {},
        activity: state.summary!.activity,
        numbers: n,
      }),
    ),
    sources: r(createElement(SourcesList, { sources: doc.sources })),
  };
}

/** Every "<number> <noun>" in a text, e.g. all(text, "verified quotes?") -> [90]. */
// Tags are stripped, so words can touch ("5 visits4 online"): the noun ends where letters end.
const all = (t: string, noun: string) => [...t.matchAll(new RegExp(`(?<!\\d)(\\d+) ${noun}(?![a-z])`, "g"))].map((m) => Number(m[1]));

describe.each([[[] as RefineKey[]], [["has_code"] as RefineKey[]]])("one set of numbers (answers: %j)", (answers) => {
  it("steps, visits, verified quotes, dropped claims and sources match everywhere they are shown", async () => {
    const p = await page(answers);
    const { n, state } = p;
    const s = state.summary!;
    // The summary (pipeline, or the refined plan) and the shared counts agree.
    expect(n).toMatchObject({ steps: s.steps, visits: s.inPersonVisits, online: s.online, quotes: s.verifiedQuotes, dropped: s.droppedClaims });
    expect(n.steps).toBeGreaterThan(0);

    const shown = [p.hero, p.closing, p.feed, p.sources].join(" | ");
    for (const v of all(shown, "visits?")) expect(v).toBe(n.visits);
    for (const v of all(shown, "verified quotes?")) expect(v).toBe(n.quotes);
    for (const v of all(shown, "claims? dropped")) expect(v).toBe(n.dropped);
    for (const v of all(shown, "sources?")) expect(v).toBe(n.sources);
    expect(all(p.closing, "steps?")).toEqual([n.steps]);
    expect(all(p.closing, "verified quotes?")).toEqual([n.quotes]);
    expect(all(p.feed, "verified quotes?")).toEqual([n.quotes]);
    expect(all(p.hero, "visits?")).toEqual([n.visits]);
    expect(all(p.sources, "sources?")[0]).toBe(n.sources);
    expect(all(p.hero, "sources?")).toEqual([n.sources]);
    // The sources list is the same set the summary counts.
    expect(n.sources).toBe(p.sources.match(/(\d+) sources?, (\d+) of them official/)!.slice(1).map(Number)[0]);
    expect(Number(p.sources.match(/(\d+) of them official/)![1])).toBe(n.official);
    // Old, divergent wordings are gone.
    expect(shown).not.toMatch(/quotes? checked|\d+ pages,|rejected \d+ claims?|quotes verified against/);
  });

  it("the activity log's step counts are the plan's (no milestones), for the unrefined run", async () => {
    if (answers.length) return; // the log is the original run; a refinement re-plans in the browser
    const p = await page(answers);
    const msgs = p.state.statuses.map((x) => x.message).join("\n");
    for (const v of all(msgs, "steps?")) expect(v).toBe(p.n.steps);
    expect(all(msgs, "steps?").length).toBeGreaterThanOrEqual(2); // "Linked N steps", "Scheduled N steps"
  });
});

describe("duration", () => {
  it("a replay shows the original live run's time from demo-cache/runs, or no time at all; never its own", async () => {
    const { readLiveRun } = await import("../../lib/demo/liveRuns");
    const rec = await readLiveRun(text);
    const p = await page([]);
    const { fmtSeconds } = await import("../../lib/ui/format");
    if (rec) {
      expect(p.n.durationMs).toBe(rec.totalMs);
      expect(p.closing).toContain(`The live run took ${fmtSeconds(rec.totalMs)}.`);
      expect(p.feed).toContain(` in ${fmtSeconds(rec.totalMs)}.`);
    } else {
      expect(p.n.durationMs).toBeNull();
      expect(p.closing).not.toMatch(/took/);
      expect(p.feed).not.toMatch(/ in \d+(\.\d)? s/);
    }
    expect(p.closing).not.toContain(fmtSeconds(run.summary!.totalMs) + ".");
  });
});

describe("refinement chip", () => {
  it("shows each active answer under the profile sentence with an Undo", async () => {
    const { RefinementChips } = await import("../../components/RefinementChips");
    const t = plain(renderToStaticMarkup(createElement(RefinementChips, { answers: ["has_code"], onChange: () => {} })));
    expect(t).toBe("Using your answer: you already have an ID code · Undo");
    expect(renderToStaticMarkup(createElement(RefinementChips, { answers: [], onChange: () => {} }))).toBe("");
  });

  it("Undo clears that answer (and only that one)", async () => {
    const { RefinementChips } = await import("../../components/RefinementChips");
    const got: RefineKey[][] = [];
    const el = RefinementChips({ answers: ["has_code", "no_bank"], onChange: (k) => got.push(k) })!;
    const buttons: { props: { onClick: () => void } }[] = [];
    const walk = (x: unknown): void => {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach(walk);
      const e = x as { type?: unknown; props?: { children?: unknown; onClick?: () => void } };
      if (e.type === "button" && e.props?.onClick) buttons.push(e as never);
      walk(e.props?.children);
    };
    walk(el);
    buttons[0].props.onClick();
    expect(got).toEqual([["no_bank"]]);
  });
});
