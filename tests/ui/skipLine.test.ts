// "If you skip it: …" becomes one short "Skip it: …" line on a Day by day card; the full sentence is in Details.
import { describe, expect, it } from "vitest";
import { skipLine } from "../../components/views/DayByDay";

describe("skipLine", () => {
  it("keeps a short consequence whole", () => {
    expect(skipLine("If you skip it: no tax card, so 60% is withheld.")).toEqual({ line: "Skip it: no tax card, so 60% is withheld.", cut: false });
  });

  it("drops a 'such as' aside, then cuts at a clause boundary (Marta's university step)", () => {
    const r = skipLine(
      "If you skip it: some services, such as the student health service account login, are inaccessible until the identity code is reported to the university.",
    )!;
    expect(r.line).toBe("Skip it: some services are inaccessible.");
    expect(r.cut).toBe(true);
  });

  it("cuts a long sentence with no clause boundary at a word, with an ellipsis, never over the limit", () => {
    const r = skipLine(
      "If you skip it: without a Kela card you may not be able to prove your right to Kela reimbursements at private doctors or dentists that cannot check electronically.",
    )!;
    expect(r.cut).toBe(true);
    expect(r.line.length).toBeLessThanOrEqual("Skip it: ".length + 73);
    expect(r.line).toMatch(/^Skip it: without a Kela card you may not be able to prove/);
  });

  it("leaves other reasons alone", () => {
    expect(skipLine("It unlocks DVV registration and Police ID card.")).toBeNull();
  });
});
