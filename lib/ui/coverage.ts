// Coverage notice: profile features the pipeline does not handle well yet. Pure (text + parsed profile + steps),
// so it is the same for live and cached runs. It only adds a note; the plan is never hidden.
import type { Profile, Step } from "@/lib/types";

export type CoverageGap = { id: string; label: string };
export type Coverage = { gaps: CoverageGap[]; link: { label: string; url: string } };

const INFOFINLAND = { label: "Infofinland", url: "https://www.infofinland.fi" };
const MIGRI = { label: "Migri", url: "https://migri.fi" };

const SELF_EMPLOYED = /\b(self[- ]?employed|freelanc\w*|entrepreneur\w*|sole trader|own (business|company)|start(ing)? (a|my) (own )?(business|company|startup)|business owner)\b/i;
const CHILDREN = /\b(child|children|kids?|son|daughter|baby|toddler|daycare|day[- ]care|kindergarten|preschool)\b/i;
const OTHER_COUNTRIES = ["Sweden", "Norway", "Denmark", "Iceland", "Germany", "France", "Spain", "Italy", "Portugal", "Netherlands", "Belgium", "Austria", "Estonia", "Latvia", "Lithuania", "Poland", "Ireland", "Greece", "Czechia", "Switzerland", "Canada", "Australia", "Japan", "Singapore", "Dubai", "UK", "United Kingdom", "United States", "USA"];
const OTHER_DESTINATION = new RegExp(String.raw`\b(?:mov\w+|relocat\w+|going|go|travel\w*|fly\w*)\s+to\s+(?:the\s+)?(?:${OTHER_COUNTRIES.join("|")})\b`, "i");

/** The features found, in a fixed order, as plain phrases. Empty when everything is covered. */
export function coverageGaps(text: string, profile: Profile | undefined, people: Profile[] = [], steps: Pick<Step, "id">[] = []): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  if (SELF_EMPLOYED.test(text)) gaps.push({ id: "self_employed", label: "self-employment or running a business" });
  const familyNonEu = people.some((p) => p.relation && p.relation !== "self" && p.citizenship === "NON_EU");
  if (familyNonEu) gaps.push({ id: "non_eu_family", label: "a non-EU family member" });
  if (profile?.temporaryProtection || /temporary protection/i.test(text)) gaps.push({ id: "temporary_protection", label: "temporary protection" });
  if (steps.some((s) => s.id === "police_identification" || s.id === "police_id_card") && profile?.citizenship === "NON_EU")
    gaps.push({ id: "police_id", label: "police identification for a non-EEA strong ID" });
  if (CHILDREN.test(text) || people.some((p) => p.relation === "child")) gaps.push({ id: "children", label: "children and daycare" });
  if (OTHER_DESTINATION.test(text)) gaps.push({ id: "other_country", label: "a destination other than Finland" });
  return gaps;
}

export function coverage(text: string, profile: Profile | undefined, people: Profile[] = [], steps: Pick<Step, "id">[] = []): Coverage | null {
  const gaps = coverageGaps(text, profile, people, steps);
  if (!gaps.length) return null;
  const permit = gaps.every((g) => ["non_eu_family", "temporary_protection", "police_id"].includes(g.id));
  return { gaps, link: permit ? MIGRI : INFOFINLAND };
}

export function coverageSentence(c: Coverage): string {
  return `Some parts of your situation aren't covered yet: ${c.gaps.map((g) => g.label).join(", ")}. Check these with`;
}
