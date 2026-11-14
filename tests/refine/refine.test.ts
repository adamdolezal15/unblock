// "Make it more accurate": toggles re-run only necessity + scheduling on a finished run. Marta and the
// Czech Erasmus student come from demo-cache (offline, EXA_CACHE=read); nothing here may touch the network.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_SENTENCES } from "../../lib/demo/sentences";
import type { RefineKey } from "../../lib/refine/refine";
import type { RunState } from "../../lib/ui/runState";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

const ERASMUS = "I'm Czech, studying at Charles University, and I'm going to the University of Helsinki on Erasmus for next semester.";
const TODAY = "2026-11-14";

type Mods = {
  refine: typeof import("../../lib/refine/refine");
  rs: typeof import("../../lib/ui/refineState");
  letter: typeof import("../../lib/ui/letter");
  days: typeof import("../../lib/ui/days");
};
let m: Mods;
let marta: RunState;
let erasmus: RunState;

async function play(text: string): Promise<RunState> {
  const { runStream, readEvents } = await import("../../lib/agent/runStream");
  const { initialRunState, runReducer } = await import("../../lib/ui/runState");
  let st = runReducer(initialRunState, { type: "start", text, at: 0 });
  for await (const event of readEvents(runStream(text, { fast: true, persist: false, today: TODAY }))) st = runReducer(st, { type: "event", event, at: 1 });
  expect(st.phase).toBe("done");
  expect(st.summary?.calls.exaLive).toBe(0);
  return st;
}

/** 'Set up by' as the page shows it: the done date of the last step on the critical path. */
const headlineDate = (st: RunState) => st.schedule!.schedule.items[st.schedule!.criticalPath.stepIds.at(-1)!].doneDate;
const headlineText = (st: RunState) => m.letter.buildLetter(st).letter!.headline.map((s) => ("t" in s ? s.t : "")).join("");
/** 'Set up by', recomputed from scratch: the latest finish among the steps that are neither optional, done nor a state. */
const independentEnd = (st: RunState) =>
  Object.values(st.schedule!.schedule.items)
    .filter((i) => st.steps[i.stepId] && !st.steps[i.stepId].milestone && !st.steps[i.stepId].done && st.steps[i.stepId].necessity !== "optional")
    .map((i) => i.doneDate)
    .sort()
    .at(-1);
const rowIds = (st: RunState, active: RefineKey[] = []) => m.refine.refineRows(m.rs.refineInput(st)!, active).map((r) => r.id);

beforeAll(async () => {
  m = {
    refine: await import("../../lib/refine/refine"),
    rs: await import("../../lib/ui/refineState"),
    letter: await import("../../lib/ui/letter"),
    days: await import("../../lib/ui/days"),
  };
  marta = await play(DEMO_SENTENCES.marta);
  erasmus = await play(ERASMUS);
}, 120_000);

describe("refinement keys in the URL", () => {
  it("parses known keys in canonical order, drops unknown ones, and keeps exclusive answers exclusive", () => {
    const { parseRefinements, serializeRefinements } = m.refine;
    expect(parseRefinements("no_bank,has_code,nonsense")).toEqual(["has_code", "no_bank"]);
    expect(parseRefinements("no_bank,has_bank")).toEqual(["has_bank"]);
    expect(parseRefinements("long_stay,short_stay")).toEqual(["short_stay"]);
    expect(parseRefinements(null)).toEqual([]);
    expect(serializeRefinements(["no_bank", "has_code"])).toBe("has_code,no_bank");
  });

  it("toggling a bank answer clears the other one", () => {
    const { toggleRefinement } = m.refine;
    expect(toggleRefinement(["has_code", "no_bank"], "has_bank")).toEqual(["has_code", "has_bank"]);
    expect(toggleRefinement(["has_bank"], "has_bank")).toEqual([]);
  });
});

describe("re-planning without answers reproduces the run", () => {
  it.each([["Marta", () => marta], ["Erasmus", () => erasmus]])("%s: same dates, steps and counts", (_n, get) => {
    const st = get();
    const r = m.refine.refine(m.rs.refineInput(st)!, []);
    expect(r.plan.schedule.items).toEqual(st.schedule!.schedule.items);
    expect(r.plan.path).toEqual(st.schedule!.criticalPath);
    expect(r.steps.map((s) => [s.id, s.necessity])).toEqual(st.stepOrder.map((id) => [id, st.steps[id].necessity]));
    expect(r.counts).toMatchObject({ steps: st.summary!.steps, optional: st.summary!.optional, inPersonVisits: st.summary!.inPersonVisits, criticalPath: st.summary!.criticalPath });
    expect(r.plan.events.map((e) => e.uid).sort()).toEqual(st.calendar!.events.map((e) => e.uid).sort());
  });

  it("no answers: the very same state object", () => {
    expect(m.rs.refineState(marta, [])).toBe(marta);
  });
});

describe("Marta (job + master's, Czech, Helsinki)", () => {
  it("asks only what would change her plan: at most 3 questions, never the stay length (not a study-only stay)", () => {
    const ids = rowIds(marta);
    expect(ids.length).toBeLessThanOrEqual(3);
    expect(ids).toContain("has_code");
    expect(ids).not.toContain("stay");
    // her bank account is needed by strong identification (and Kela): "I don't need one" would change nothing, so it is not asked
    expect(ids).not.toContain("no_bank");
    expect(m.rs.refineState(marta, ["no_bank"]).steps.bank_account.necessity).toBe("required");
  });

  it("'I already have a personal identity code': the code step is done, Vero's is gone, 'Set up by' is recomputed", () => {
    const st = m.rs.refineState(marta, ["has_code"]);
    expect(st.steps.personal_identity_code.done).toBe(true);
    expect(st.steps.vero_identity_code).toBeUndefined();
    expect(st.schedule!.schedule.items.vero_identity_code).toBeUndefined();
    expect(headlineDate(st)).toBe(independentEnd(st));
    // DVV registration -> strong identification still sets her end date (the code is not what she waits for)
    expect(headlineDate(st)).toBe(headlineDate(marta));
    expect(st.summary!.steps).toBe(marta.summary!.steps - 1);
    expect(st.summary!.alreadyDone).toBe(marta.summary!.alreadyDone + 1);
    expect(headlineText(st)).not.toBe(headlineText(marta));
    // the calendar link carries the answer, so the .ics matches the page
    expect(st.calendar!.icsUrl).toBe(`${marta.calendar!.icsUrl}&r=has_code`);
  });

  it("'I already have a bank account': the step is done and no longer a visit", () => {
    const st = m.rs.refineState(marta, ["has_bank"]);
    expect(st.steps.bank_account.done).toBe(true);
    expect(headlineDate(st)).toBe(independentEnd(st));
    expect(st.summary!.steps).toBe(marta.summary!.steps - 1);
    expect(st.calendar!.events.some((e) => e.stepId === "bank_account")).toBe(false);
  });

  it("answers combine, and the day list follows", () => {
    const st = m.rs.refineState(marta, ["has_code", "has_bank"]);
    expect(headlineDate(st)).toBe(independentEnd(st));
    const ids = m.days.buildDays(st, m.letter.buildLetter(st).ref).flatMap((e) => (e.kind === "visit" || e.kind === "online" ? e.steps.map((s) => s.id) : []));
    expect(ids).not.toContain("personal_identity_code");
    expect(ids).not.toContain("bank_account");
    expect(ids).toContain("strong_identification");
  });
});

describe("one yardstick: the usual order", () => {
  const cmp = (st: RunState) => import("../../lib/ui/compare").then((c) => c.compareWithUsual(st, m.letter.buildLetter(st).ref));
  const sentence = (c: Awaited<ReturnType<typeof cmp>>) => (c ? c.sentence.map((x) => ("t" in x ? x.t : "")).join("") : null);

  it("Marta: with no answer 'N days sooner'; with either answer 'matches', never 'sooner for the tax card'", async () => {
    expect((await cmp(marta))!.gain).toMatchObject({ days: 15, caption: "sooner than the usual order" });
    for (const keys of [["has_code"], ["has_bank"], ["has_code", "has_bank"]] as RefineKey[][]) {
      const c = await cmp(m.rs.refineState(marta, keys));
      expect(sentence(c), keys.join()).toBe("Your order matches the usual order.");
      expect(c!.gain).toBeNull();
      expect(c!.shortcuts).toEqual([]);
    }
  });

  it("'I already have a personal identity code' keeps the tax card in the timetable and on the map", () => {
    const st = m.rs.refineState(marta, ["has_code"]);
    expect(st.steps.tax_card).toBeDefined();
    expect(st.steps.tax_card.done).toBeFalsy();
    const ids = m.days.buildDays(st, m.letter.buildLetter(st).ref).flatMap((e) => (e.kind === "visit" || e.kind === "online" ? e.steps.map((s) => s.id) : []));
    expect(ids).toContain("tax_card");
    expect(st.graph!.graph.nodes.some((n) => n.id === "tax_card")).toBe(true);
  });

  it("a step the person already did never waits on other people's reports (no later 'Set up by' for ticking it)", () => {
    for (const st of [marta, erasmus]) {
      const done = m.rs.refineState(st, ["has_bank"]);
      if (!done.steps.bank_account?.done) continue;
      const it = done.schedule!.schedule.items.bank_account;
      expect(it.waitDays).toBe(0);
      expect(headlineDate(done) <= headlineDate(st)).toBe(true);
    }
  });
});

describe("a toggle is only shown when it visibly changes this run", () => {
  const visible = (st: RunState, k: RefineKey) => {
    const a = m.rs.refineState(st, []);
    const b = m.rs.refineState(st, [k]);
    const req = (x: RunState) => Object.values(x.steps).filter((s) => !s.milestone && !s.done && s.necessity !== "optional").map((s) => s.id).sort().join();
    return headlineDate(a) !== headlineDate(b) || a.summary!.inPersonVisits !== b.summary!.inPersonVisits || req(a) !== req(b);
  };

  it("Marta: the code and the bank answer change visits / required steps and are shown; 'no bank' changes nothing and is not", () => {
    expect(rowIds(marta)).toEqual(["has_code", "has_bank"]);
    expect(visible(marta, "has_code")).toBe(true); // one visit fewer
    expect(visible(marta, "has_bank")).toBe(true); // one required step fewer
    expect(visible(marta, "no_bank")).toBe(false);
  });

  it("Erasmus: only the stay length changes anything", () => {
    expect(visible(erasmus, "long_stay")).toBe(true);
    for (const k of ["has_code", "has_bank", "no_bank"] as const) expect(visible(erasmus, k), k).toBe(false);
  });

  it("Erasmus shows only the stay length: nothing else would change its plan", () => {
    expect(rowIds(erasmus)).toEqual(["stay"]);
  });

  it("an answer that would change nothing is hidden even when the URL holds it; with nothing to ask the block is empty", () => {
    expect(rowIds(erasmus, ["has_code"])).toEqual(["stay"]);
    expect(rowIds(marta, ["no_bank"])).not.toContain("no_bank");
  });
});

describe("Erasmus run (Czech, one semester, study only)", () => {
  it("shows the assumed one-term stay as a checked answer, and nothing about steps that are already optional", () => {
    const rows = m.refine.refineRows(m.rs.refineInput(erasmus)!, []);
    expect(rows.map((r) => [r.id, r.checked])).toEqual([["stay", true]]);
    expect(rows[0].label).toBe("I'm staying less than 12 months");
    expect(rows[0].next).toEqual(["long_stay"]);
  });

  it("unchecking it ('12 months or longer') makes bank, strong ID, police ID card and Kela required and moves 'Set up by'", () => {
    const st = m.rs.refineState(erasmus, ["long_stay"]);
    expect(headlineDate(erasmus)).toBe("2027-02-04");
    expect(headlineDate(st) > headlineDate(erasmus)).toBe(true);
    expect(headlineDate(st)).toBe(independentEnd(st));
    expect(st.summary!.optional).toBe(0);
    expect(st.summary!.steps).toBe(erasmus.summary!.steps + 4);
    expect(Object.values(st.steps).some((s) => s.necessity === "optional")).toBe(false);
    expect(headlineText(st)).not.toBe(headlineText(erasmus));
    // checked again (back to the run's own assumption): the original plan
    expect(headlineDate(m.rs.refineState(erasmus, []))).toBe("2027-02-04");
  });

  it("the unchecked state is still offered, so the person can check it again", () => {
    const rows = m.refine.refineRows(m.rs.refineInput(erasmus)!, ["long_stay"]);
    expect(rows.map((r) => [r.id, r.checked, r.next])).toEqual([["stay", false, []]]);
  });

  it("other answers recompute 'Set up by' from the required steps only (here: it does not move)", () => {
    for (const k of ["has_code", "has_bank", "no_bank"] as const) {
      const st = m.rs.refineState(erasmus, [k]);
      expect(headlineDate(st), k).toBe(independentEnd(st));
      expect(headlineDate(st), k).toBe("2027-02-04");
    }
  });

  it("optional steps carry their reason: a short study stay, or the person's own answer", () => {
    for (const id of ["bank_account", "strong_identification", "police_id_card", "kela_registration"]) {
      expect(erasmus.steps[id].necessity).toBe("optional");
      expect(erasmus.steps[id].optionalReason).toBe("short_stay");
    }
    const none = m.rs.refineState(marta, ["no_bank"]);
    expect(none.steps.bank_account.optionalReason).toBeUndefined(); // still required for Marta: nothing to explain
  });
});

describe("a study run with no stated length (Brazilian PhD student)", () => {
  it("'I'm staying less than 12 months' is only asked when it would change the plan", async () => {
    const st = await play(DEMO_SENTENCES.brazil);
    const stay = rowIds(st).includes("stay");
    const short = m.rs.refineState(st, ["short_stay"]);
    // a non-EU permit holder still needs those steps: nothing changes, so nothing is asked
    expect(stay).toBe(short.summary!.steps !== st.summary!.steps || headlineDate(short) !== headlineDate(st));
    expect(headlineDate(short)).toBe(independentEnd(short));
  }, 60_000);
});

describe("optional steps are labelled where they are", () => {
  it("Erasmus: the timeline lists them on their day with the reason; the plan's own entries are unchanged", () => {
    const doc = m.letter.buildLetter(erasmus);
    const entries = m.days.buildDays(erasmus, doc.ref);
    const optional = entries.flatMap((e) => (e.kind === "optional" ? e.steps : []));
    expect(optional.map((s) => s.id).sort()).toEqual(["bank_account", "kela_registration", "police_id_card", "strong_identification"]);
    for (const s of optional) expect(s.optional).toBe("Not needed for a stay under 12 months.");
    expect(optional.every((s) => !s.critical)).toBe(true);
    const planned = entries.flatMap((e) => (e.kind === "visit" || e.kind === "online" ? e.steps.map((s) => s.id) : []));
    expect(planned).toEqual(["university_enrolment", "eu_registration", "dvv_registration"]);
  });

  it("a step the person says they do not need gets the 'You said' reason (a plan where it was optional by answer)", () => {
    const st = m.rs.refineState(erasmus, ["has_bank"]); // bank done, the other three stay optional by the short stay
    expect(st.steps.bank_account.done).toBe(true);
    const doc = m.letter.buildLetter(st);
    const optional = m.days.buildDays(st, doc.ref).flatMap((e) => (e.kind === "optional" ? e.steps.map((s) => s.id) : []));
    expect(optional).not.toContain("bank_account");
    expect(m.days.optionalReason({ optionalReason: "your_choice" })).toBe("You said you don't need it.");
  });

  it("the map draws optional steps as hollow stations labelled Optional, off the main line", async () => {
    const { layoutMetro } = await import("../../lib/ui/metroLayout");
    const L = layoutMetro({
      graph: erasmus.graph!.graph,
      steps: erasmus.steps,
      items: erasmus.schedule!.schedule.items,
      criticalPath: erasmus.schedule!.criticalPath.stepIds,
      width: 1000,
    });
    const optional = L.stations.filter((s) => s.optional);
    expect(optional.map((s) => s.id).sort()).toEqual(["bank_account", "kela_registration", "police_id_card", "strong_identification"]);
    expect(optional.every((s) => s.hollow && !s.main)).toBe(true);
    expect(L.stations.filter((s) => !s.optional && !s.done).every((s) => !s.optional)).toBe(true);
  });
});

describe("the calendar file follows the answers", () => {
  it("/api/calendar.ics?runId=…&r=… repeats the same re-plan on the server", async () => {
    const { runStream, readEvents } = await import("../../lib/agent/runStream");
    const runId = `refine-test-${Date.now()}`;
    for await (const e of readEvents(runStream(ERASMUS, { fast: true, persist: true, today: TODAY, runId }))) void e;
    const { GET } = await import("../../app/api/calendar.ics/route");
    const events = async (qs: string) => (await (await GET(new Request(`http://x/api/calendar.ics?runId=${runId}${qs}`))).text()).match(/BEGIN:VEVENT/g)?.length ?? 0;
    const plain = await events("");
    expect(plain).toBe(erasmus.summary!.inCalendar + erasmus.summary!.reminders);
    // "12 months or longer": bank, police ID card, strong ID and Kela become visits of the plan
    const longer = await events("&r=long_stay");
    expect(longer).toBe(m.rs.refineState(erasmus, ["long_stay"]).calendar!.events.length);
    expect(longer).toBeGreaterThan(plain);
  }, 60_000);
});

describe("no network, no server code", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new Error("network call during a refinement")));
  afterAll(() => fetchSpy.mockRestore());

  it("refineRows, refine and refineState never call fetch", () => {
    fetchSpy.mockClear();
    const input = m.rs.refineInput(marta)!;
    m.refine.refineRows(input, ["has_code"]);
    m.refine.refineRows(m.rs.refineInput(erasmus)!, ["long_stay"]);
    for (const keys of [["has_code"], ["has_bank"], ["no_bank"], ["has_code", "no_bank"], ["long_stay"]] as const) {
      m.rs.refineState(marta, keys);
      m.refine.refine(input, keys);
    }
    m.rs.refineState(erasmus, ["long_stay"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the modules the browser runs import nothing from lib/exa, lib/llm, lib/prompts, node: or the SDKs", () => {
    const root = path.resolve(__dirname, "../..");
    const seen = new Set<string>();
    const bad: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const [, spec] of src.matchAll(/(?:import|export)[^"'`]*?from\s+["']([^"']+)["']/g)) {
        if (/^(node:|exa-js|@anthropic-ai)/.test(spec)) bad.push(`${path.relative(root, file)} -> ${spec}`);
        const target = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : null;
        if (!target) continue;
        const resolved = [".ts", ".tsx", "/index.ts"].map((e) => target + e).find(existsSync);
        if (!resolved) continue;
        if (/lib[\\/](exa|llm|prompts)[\\/]/.test(resolved)) bad.push(`${path.relative(root, file)} -> ${spec}`);
        visit(resolved);
      }
    };
    visit(path.join(root, "lib/ui/refineState.ts"));
    visit(path.join(root, "lib/refine/refine.ts"));
    expect(bad).toEqual([]);
    expect(seen.size).toBeGreaterThan(10);
  });
});
