// Regression: run mwgiunwf-37c4f9759584 ("I'm Czech … University of Helsinki on Erasmus for next semester").
// 7 steps and 73 verified quotes, but an empty plan: four soft and hard requirements closed a loop
// (EU registration → enrolment → identity code → DVV → EU registration) and every step was blocked.
// Fixture = the steps exactly as that run saved them (tests/fixtures), no network.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { breakCycles, requirementStrength } from "../../lib/agent/breakCycles";
import { semesterStart } from "../../lib/agent/semester";
import { resolveArrival } from "../../lib/agent/parseProfileLlm";
import { parseProfileDeterministic } from "../../lib/agent/parseProfile";
import { buildGraph, schedule, topoOrder } from "../../lib/graph";
import type { Profile, Step } from "../../lib/types";
import { assumptionLabel, assumptionPhrase } from "../../lib/ui/assumptionLabel";
import { profileParts } from "../../lib/ui/profileSentence";
import { fallbackSteps } from "../../lib/ui/days";
import { initialRunState, type RunState } from "../../lib/ui/runState";

const run = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/run-mwgiunwf-37c4f9759584.json"), "utf8")) as {
  text: string;
  profile: Profile;
  assumptions: string[];
  steps: Step[];
};

describe("run mwgiunwf: requirement loop", () => {
  it("reproduces: the saved steps deadlock and nothing is scheduled", () => {
    const topo = topoOrder(buildGraph(run.steps));
    expect(topo.order).toEqual([]);
    expect(topo.deadlocks).toHaveLength(1);
  });

  it("breaks the loop at its weakest link only (the 'needed for various services' sentence)", () => {
    const { steps, relaxed } = breakCycles(run.steps);
    expect(relaxed.map((r) => [r.stepId, r.requires])).toEqual([["university_enrolment", "personal_identity_code"]]);
    // The verified claim is kept; only the ordering edge is dropped.
    const uni = steps.find((s) => s.id === "university_enrolment")!;
    expect(uni.requires).not.toContain("personal_identity_code");
    expect(uni.relaxedRequires).toEqual(["personal_identity_code"]);
    expect(uni.claims!.some((c) => c.kind === "requires" && c.value === "personal_identity_code")).toBe(true);
    // Hard gates stay: EU registration only after studies start, DVV needs the EU registration certificate.
    expect(steps.find((s) => s.id === "eu_registration")!.requires).toContain("university_enrolment");
    expect(steps.find((s) => s.id === "dvv_registration")!.requires).toContain("eu_registration");
  });

  it("schedules every step after the break", () => {
    const { steps } = breakCycles(run.steps);
    const profile = { ...run.profile, arrivalDate: "2027-01-01" };
    const sched = schedule(buildGraph(steps), profile, { today: "2026-11-14" });
    expect(sched.deadlocks).toEqual([]);
    expect(sched.blocked).toEqual([]);
    expect(Object.keys(sched.items).sort()).toEqual(run.steps.map((s) => s.id).sort());
    expect(sched.startDate).toBe("2027-01-04"); // 1 Jan is a holiday, then a weekend
  });

  it("leaves a graph without cycles untouched", () => {
    const { steps } = breakCycles(run.steps);
    const again = breakCycles(steps);
    expect(again.relaxed).toEqual([]);
    expect(again.steps).toBe(steps);
  });

  it("scores gate wording above soft wording", () => {
    const byId = new Map(run.steps.map((s) => [s.id, s]));
    expect(requirementStrength(byId.get("eu_registration")!, "university_enrolment")).toBeGreaterThan(
      requirementStrength(byId.get("university_enrolment")!, "personal_identity_code"),
    );
  });
});

describe("next semester / next term", () => {
  it.each([
    ["on Erasmus for next semester", "2026-11-14", "2027-01-01"],
    ["coming for the next term", "2026-03-10", "2026-09-01"],
    ["for the spring semester", "2026-11-14", "2027-01-01"],
    ["for the autumn semester", "2026-11-14", "2027-09-01"],
    ["next fall semester", "2026-02-01", "2026-09-01"],
    ["starting next semester", "2026-12-31", "2027-01-01"],
  ])("%s (today %s) -> %s", (text, today, date) => expect(semesterStart(text, today)).toBe(date));

  it("ignores text without a term", () => expect(semesterStart("moving next month", "2026-11-14")).toBeUndefined());

  it("is an assumption, not 'today', in both parsers", () => {
    const det = parseProfileDeterministic(run.text, "2026-11-14");
    expect(det.ok && det.profile.arrivalDate).toBe("2027-01-01");
    expect(det.ok && det.assumptions.some((a) => /today/.test(a))).toBe(false);
    expect(det.ok && det.assumptions.map(assumptionLabel)).toContain("arriving 1 January");
    // The LLM path: the model returns no date for "next semester"; resolveArrival alone still says today,
    // parseProfileLlm then reads the term from the text (covered end to end by the invariant matrix).
    expect(resolveArrival({ kind: "none" } as never, "2026-11-14").date).toBeUndefined();
  });
});

describe("assumption labels", () => {
  it("names the city and the day, never a bare kind word", () => {
    const profile = { ...run.profile, arrivalDate: "2027-01-01" };
    const assumptions = [run.assumptions[0], "Semester start read as 2027-01-01; arrival assumed on that day."];
    const text = profileParts(profile, assumptions, run.text)
      .map((p) => ("t" in p ? p.t : p.value))
      .join("");
    expect(text).toBe("You're a Czech citizen, studying in Helsinki from 1 January. Assumed: Helsinki, arriving 1 January.");
    expect(assumptionPhrase(run.assumptions[0])).toBe("Helsinki");
    expect(text).not.toMatch(/I assumed/);
  });
});

describe("UI fallback: steps but no dated plan", () => {
  const state = (items: Record<string, unknown>): RunState => ({
    ...initialRunState,
    phase: "done",
    steps: Object.fromEntries(run.steps.map((s) => [s.id, s])),
    stepOrder: run.steps.map((s) => s.id),
    schedule: { schedule: { items, order: [], blocked: [], deadlocks: [], startDate: "2026-11-16", visitChoices: [] }, criticalPath: { stepIds: [], totalDays: 0, calendarDays: 0 }, visitChoices: [] },
  }) as unknown as RunState;

  it("lists every actionable step when the schedule is empty", () => {
    const list = fallbackSteps(state({}));
    expect(list?.map((s) => s.id)).toEqual(run.steps.filter((s) => !s.milestone).map((s) => s.id));
    expect(list!.every((s) => s.title.trim())).toBe(true);
  });

  it("is off when the schedule has dated steps", () => {
    expect(fallbackSteps(state({ eu_registration: {} }))).toBeNull();
  });
});
