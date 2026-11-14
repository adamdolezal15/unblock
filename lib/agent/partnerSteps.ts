// Partner / family support without a multi-person graph: findSteps plans for the main applicant (their profile
// already has hasFamily, so the family-member step is researched). Here we only LIST which taxonomy steps differ
// for each other person because their citizenship or purpose differs. Labels are neutral search hints, not facts:
// nothing here is searched or cited, so the UI must say "not researched for them, check <authority>".
import type { Profile } from "../types";
import { STEP_TAXONOMY, selectSteps } from "./stepTaxonomy";

export type PartnerDifference = {
  relation: NonNullable<Profile["relation"]>;
  citizenship: Profile["citizenship"];
  /** Steps that apply to them but not to the main applicant (e.g. residence permit for a non-EU spouse of an EU citizen). */
  extra: { id: string; label: string }[];
  /** Steps the main applicant has that do not apply to them (e.g. EU registration for a non-EU spouse). */
  notNeeded: { id: string; label: string }[];
  summary: string;
};

/** Steps decided by citizenship / protection status (not by what someone does for a living), so safe to compare. */
const PATH_IDS: ReadonlySet<string> = new Set(["eu_registration", "nordic_registration", "residence_permit", "temporary_protection"]);

const WHO: Record<NonNullable<Profile["relation"]>, string> = { self: "You", spouse: "Your partner", child: "Your child", other: "A family member" };

/** `people[0]` is the main applicant; the rest are compared against it. Empty when everyone is on the same path. */
export function partnerDifferences(people: Profile[]): PartnerDifference[] {
  const [main, ...others] = people;
  if (!main) return [];
  const label = (id: string) => STEP_TAXONOMY.find((s) => s.id === id)?.label ?? id;
  const mine = new Set(selectSteps({ ...main, alreadyDone: undefined }).map((s) => s.id));
  const out: PartnerDifference[] = [];
  for (const p of others) {
    const theirs = new Set(
      selectSteps({ ...p, hasFamily: false, alreadyDone: undefined, city: main.city }).map((s) => s.id),
    );
    const extra = [...theirs].filter((id) => PATH_IDS.has(id) && !mine.has(id)).map((id) => ({ id, label: label(id) }));
    const notNeeded = [...mine].filter((id) => PATH_IDS.has(id) && !theirs.has(id)).map((id) => ({ id, label: label(id) }));
    if (extra.length === 0 && notNeeded.length === 0) continue;
    const relation = p.relation ?? "other";
    const parts: string[] = [];
    if (extra.length) parts.push(`also needs: ${extra.map((s) => s.label).join("; ")}`);
    if (notNeeded.length) parts.push(`does not need: ${notNeeded.map((s) => s.label).join("; ")}`);
    out.push({
      relation,
      citizenship: p.citizenship,
      extra,
      notNeeded,
      summary: `${WHO[relation]} (${p.citizenship.replace("_", "-")}) ${parts.join(" / ")}. Not researched for them: check the authorities.`,
    });
  }
  return out;
}
