// The pre-run clarify step (lib/agent/profileAnswers + components/RunInput): a vague sentence asks for
// citizenship and purpose before any run; a complete one, the saved demos and the homepage examples run directly.
import { describe, expect, it } from "vitest";
import {
  answerClause, applyAnswers, clarifyFields, statedAnswers, submitDecision,
} from "../../lib/agent/profileAnswers";
import { parseProfileDeterministic, type ProfileResult } from "../../lib/agent/parseProfile";
import { DEMO_SENTENCES } from "../../lib/demo/sentences";
import { EXAMPLES } from "../../components/RunInput";

const TODAY = "2026-11-15";
const VAGUE = "I'm moving to Finland";

describe("clarify: when to ask", () => {
  it("a vague sentence asks for citizenship and purpose and does not run", () => {
    expect(clarifyFields(VAGUE, TODAY)).toEqual(["citizenship", "purpose"]);
    expect(submitDecision(VAGUE, {}, TODAY)).toEqual({ kind: "ask", open: ["citizenship", "purpose"] });
    // One answer is not enough.
    expect(submitDecision(VAGUE, { citizenship: { kind: "EU" } }, TODAY)).toEqual({ kind: "ask", open: ["purpose"] });
    // A typed country that is only spaces is not an answer.
    expect(submitDecision(VAGUE, { citizenship: { kind: "country", country: "  " }, purpose: "work" }, TODAY)).toEqual({ kind: "ask", open: ["citizenship"] });
  });

  it("asks only what is missing", () => {
    expect(clarifyFields("German moving to Finland", TODAY)).toEqual(["purpose"]);
    expect(clarifyFields("Moving to Tampere for a job", TODAY)).toEqual(["citizenship"]);
  });

  it("a complete sentence runs directly, unchanged", () => {
    const full = "Czech citizen moving to Helsinki on 1 December for a job";
    expect(clarifyFields(full, TODAY)).toEqual([]);
    expect(submitDecision(full, {}, TODAY)).toEqual({ kind: "run", text: full });
  });

  it("never asks for the saved demos or the homepage examples", () => {
    for (const s of Object.values(DEMO_SENTENCES)) expect(clarifyFields(s, TODAY), s).toEqual([]);
    for (const ex of EXAMPLES) expect(submitDecision(DEMO_SENTENCES[ex.key], {}, TODAY)).toEqual({ kind: "run", text: DEMO_SENTENCES[ex.key] });
  });

  it("an out-of-scope sentence is not asked about (the run explains the scope)", () => {
    expect(clarifyFields("What's the weather in Paris?", TODAY)).toEqual([]);
  });
});

describe("clarify: the answers", () => {
  it("run once both are answered, as one clause on the sentence; a sentence with the clause is not asked again", () => {
    const d = submitDecision(VAGUE, { citizenship: { kind: "NORDIC" }, purpose: "work_study" }, TODAY);
    expect(d).toEqual({ kind: "run", text: "I'm moving to Finland. Citizenship: Nordic. Purpose: work and study." });
    if (d.kind === "run") expect(clarifyFields(d.text, TODAY)).toEqual([]);
  });

  it("round-trip through the clause, including a typed country", () => {
    const a = { citizenship: { kind: "country" as const, country: "Brazil" }, purpose: "family" as const };
    expect(statedAnswers(`x. ${answerClause(a)}`)).toEqual(a);
    expect(statedAnswers("x. Citizenship: EU / EEA / Swiss. Purpose: study.")).toEqual({ citizenship: { kind: "EU" }, purpose: "study" });
  });

  it("override the parser, with no 'not stated' assumption left", () => {
    const text = `${VAGUE}. ${answerClause({ citizenship: { kind: "NORDIC" }, purpose: "work_study" })}`;
    const r = applyAnswers(parseProfileDeterministic(text, TODAY), text);
    expect(r.ok && r.profile.citizenship).toBe("NORDIC");
    expect(r.ok && r.profile.purpose).toEqual(["work", "study"]);
    expect(r.ok && r.assumptions.some((x) => /^(Citizenship|Purpose) not stated|treated as EU/.test(x))).toBe(false);
    expect(r.ok && r.assumptions).toContain("Arrival date not stated; planning from today.");

    const eu = `${VAGUE}. ${answerClause({ citizenship: { kind: "EU" }, purpose: "work" })}`;
    const e = applyAnswers(parseProfileDeterministic(eu, TODAY), eu);
    expect(e.ok && e.profile.citizenship).toBe("EU");
    expect(e.ok && e.assumptions.some((x) => /swiss/i.test(x))).toBe(false);
  });

  it("win over what an LLM parse inferred", () => {
    const text = `I'm moving to Finland from Prague. ${answerClause({ citizenship: { kind: "NON_EU" }, purpose: "study" })}`;
    const llm: ProfileResult = {
      ok: true,
      source: "llm",
      profile: { citizenship: "EU", purpose: ["work"], city: "Helsinki" },
      people: [{ citizenship: "EU", purpose: ["work"], city: "Helsinki" }],
      assumptions: [],
    };
    const r = applyAnswers(llm, text);
    expect(r.ok && r.profile).toMatchObject({ citizenship: "NON_EU", purpose: ["study"] });
    expect(r.ok && r.people[0]).toMatchObject({ citizenship: "NON_EU", purpose: ["study"] });
  });

  it("leave a parse alone when the sentence has no clause", () => {
    const r = parseProfileDeterministic(VAGUE, TODAY);
    expect(applyAnswers(r, VAGUE)).toBe(r);
  });
});
