// LLM profile parser. The model reads the sentence into ProfileExtraction (lib/prompts/parseProfile.ts);
// everything else is code: date arithmetic, validation, defaults. Each default becomes an assumption.
// Goes through lib/llm extract(), so it is disk-cached (LLM_CACHE) and the cache key does not depend on today.
import { extract } from "../llm";
import { addCalendarDays } from "../graph/dates";
import { ProfileExtraction, parseProfileTask } from "../prompts/parseProfile";
import type { Profile } from "../types";
import { assumptionKind } from "../ui/assumptionLabel";

export type LlmParse =
  | { ok: true; profile: Profile; assumptions: string[]; people: Profile[] }
  | { ok: false; outOfScope: string };

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Resolve the model's structured arrival against `today`. Returns an ISO date or why there is none. */
export function resolveArrival(a: ProfileExtraction["arrival"], today: string): { date?: string; assumption?: string } {
  const none = { assumption: "Arrival date not stated; planning from today." };
  if (a.kind === "relative") {
    if (a.offsetDays && a.offsetDays > 0 && a.offsetDays <= 400) return { date: addCalendarDays(today, Math.round(a.offsetDays)) };
    return none;
  }
  if (a.kind !== "date" || !a.month || a.month < 1 || a.month > 12) return none;
  const month = Math.round(a.month);
  const ty = Number(today.slice(0, 4));
  if (a.year && a.year < ty) return { assumption: `Arrival year ${Math.round(a.year)} is already past; planning from today.` };
  const year = a.year && a.year <= ty + 3 ? Math.round(a.year) : undefined;
  const y0 = year ?? ty;
  const dayOk = !!a.day && a.day >= 1 && a.day <= daysIn(y0, month);
  const day = dayOk ? Math.round(a.day!) : 1;
  let date = `${y0}-${pad(month)}-${pad(day)}`;
  if (date < today) {
    if (year) return { assumption: `Arrival date ${date} is already past; planning from today.` };
    date = `${ty + 1}-${pad(month)}-${pad(Math.min(day, daysIn(ty + 1, month)))}`;
  }
  return { date, ...(dayOk ? {} : { assumption: `Only the month was given; assumed the 1st (${date}).` }) };
}

export async function parseProfileLlm(text: string, today: string): Promise<LlmParse> {
  const res = await extract(
    parseProfileTask,
    { query: text, context: "", includeDomains: [], docs: [] },
    ProfileExtraction,
  );
  const d = res.data;
  if (!d) throw new Error("LLM returned no schema-valid profile");
  if (d.outOfScope) return { ok: false, outOfScope: d.reason.trim() || "This is not about moving to Finland." };

  // Only the model's interpretations of a known kind are kept: each is shown as a short label written in
  // code (lib/ui/assumptionLabel), never as the model's free text.
  const assumptions = d.assumptions.map((a) => a.trim()).filter((a) => a && assumptionKind(a));
  const self = d.people.find((p) => p.relation === "self") ?? d.people[0];
  if (!self) throw new Error("LLM returned no person");

  let city = d.city?.trim();
  if (!city) {
    city = "Helsinki";
    assumptions.push("No Finnish city named; assumed Helsinki.");
  }
  const arrival = resolveArrival(d.arrival, today);
  if (arrival.assumption) assumptions.push(arrival.assumption);

  const build = (p: (typeof d.people)[number]): Profile => {
    let citizenship: Profile["citizenship"];
    if (p.citizenship === "UNKNOWN") {
      citizenship = "NON_EU";
      assumptions.push(
        p.relation === "self"
          ? "Citizenship not stated; assumed non-EU (the stricter path). Add your nationality to refine."
          : `Citizenship of the ${p.relation} not stated; assumed non-EU (the stricter path).`,
      );
    } else citizenship = p.citizenship;
    const purpose = [...new Set(p.purpose)];
    if (purpose.length === 0) {
      purpose.push(p.relation === "self" ? "work" : "family");
      if (p.relation === "self") assumptions.push("Purpose not stated; assumed work.");
    }
    const salary = p.monthlySalaryEur && p.monthlySalaryEur > 0 ? Math.round(p.monthlySalaryEur) : undefined;
    const stay = p.stayMonths && p.stayMonths > 0 ? Math.round(p.stayMonths) : undefined;
    return {
      citizenship,
      purpose,
      city: city!,
      ...(arrival.date ? { arrivalDate: arrival.date } : {}),
      ...(salary ? { monthlySalaryEur: salary } : {}),
      ...(p.temporaryProtection ? { temporaryProtection: true } : {}),
      ...(stay ? { stayMonths: stay } : {}),
      relation: p.relation,
    };
  };

  const { relation: _self, ...profile } = build(self); // the main applicant carries no relation
  const others = d.people.filter((p) => p !== self).map(build);
  if (others.length) {
    profile.hasFamily = true;
    if (!profile.purpose.includes("family")) profile.purpose.push("family");
  }
  if (d.alreadyDone.length) profile.alreadyDone = [...new Set(d.alreadyDone)];
  return { ok: true, profile, assumptions: [...new Set(assumptions)], people: [profile, ...others] };
}
