import { describe, expect, it } from "vitest";
import { coverage, coverageGaps, coverageSentence } from "../../lib/ui/coverage";
import type { Profile } from "../../lib/types";

const eu: Profile = { citizenship: "EU", purpose: ["work"], city: "Helsinki" };
const nonEu: Profile = { citizenship: "NON_EU", purpose: ["work"], city: "Helsinki" };
const ids = (t: string, p: Profile = eu, people: Profile[] = [p], steps: { id: string }[] = []) => coverageGaps(t, p, people, steps).map((g) => g.id);

describe("coverage notice", () => {
  it("is silent for a covered profile", () => {
    expect(coverage("Czech citizen moving to Helsinki on 1 December for a job", eu)).toBeNull();
    expect(coverage("Brazilian student moving to Tampere in August", { ...nonEu, purpose: ["study"] }, undefined, [])).toBeNull();
  });
  it.each([
    ["I am self-employed and moving to Helsinki", "self_employed"],
    ["freelance designer moving to Espoo", "self_employed"],
    ["Polish nurse moving to Oulu in March with two kids", "children"],
    ["moving to Helsinki, need daycare for my son", "children"],
    ["Ukrainian under temporary protection moving to Helsinki", "temporary_protection"],
    ["I live in Finland but I am moving to Sweden next month", "other_country"],
  ])("flags %s", (text, id) => expect(ids(text)).toContain(id));
  it("flags a non-EU family member and police identification", () => {
    const spouse: Profile = { ...nonEu, relation: "spouse" };
    expect(ids("Czech citizen moving to Helsinki with my husband", eu, [{ ...eu, relation: "self" }, spouse])).toContain("non_eu_family");
    expect(ids("Indian engineer moving to Helsinki", nonEu, [nonEu], [{ id: "police_identification" }])).toContain("police_id");
    expect(ids("Czech citizen moving to Helsinki", eu, [eu], [{ id: "police_identification" }])).not.toContain("police_id");
  });
  it("names every gap, in a calm sentence with an official link", () => {
    const c = coverage("Self-employed with two kids moving to Helsinki", eu)!;
    expect(coverageSentence(c)).toBe("Some parts of your situation aren't covered yet: self-employment or running a business, children and daycare. Check these with");
    expect(c.link.url).toMatch(/^https:\/\/(www\.)?(infofinland|migri)\.fi/);
  });
  it("uses the permit authority only when every gap is about permits", () => {
    expect(coverage("Ukrainian under temporary protection moving to Helsinki", { ...nonEu, temporaryProtection: true })!.link.url).toContain("migri.fi");
    expect(coverage("Ukrainian under temporary protection with a kid", { ...nonEu, temporaryProtection: true })!.link.url).toContain("infofinland.fi");
  });
});
