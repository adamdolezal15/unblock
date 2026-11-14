// The parsed profile as one sentence with editable parts ("You're a Czech citizen, working and
// studying in Helsinki from 1 December, on €3,200 a month (I assumed gross)."). The nationality word is
// taken from the person's own sentence when it names one; otherwise the citizenship group is used.
import type { Profile } from "@/lib/types";
import { assumptionLabel } from "./assumptionLabel";
import { longDate } from "./letter";

export type Part = { t: string } | { field: Field; value: string; title?: string };
export type Field = "citizenship" | "purpose" | "city" | "arrival" | "salary" | "family" | `assumption:${number}`;

const DEMONYMS =
  "Afghan Albanian Algerian American Argentinian Armenian Australian Austrian Bangladeshi Belarusian Belgian Brazilian British Bulgarian Cameroonian Canadian Chilean Chinese Colombian Croatian Cypriot Czech Danish Dutch Egyptian Estonian Ethiopian Filipino Finnish French Georgian German Ghanaian Greek Hungarian Icelandic Indian Indonesian Iranian Iraqi Irish Israeli Italian Japanese Kenyan Korean Latvian Lebanese Lithuanian Luxembourgish Malaysian Maltese Mexican Moldovan Moroccan Nepali Nigerian Norwegian Pakistani Peruvian Polish Portuguese Romanian Russian Serbian Singaporean Slovak Slovenian Somali Spanish Sri Lankan Swedish Swiss Syrian Thai Tunisian Turkish Ugandan Ukrainian Venezuelan Vietnamese".split(" ");

export function nationalityIn(text: string): string | undefined {
  for (const d of DEMONYMS) if (new RegExp(`\\b${d}\\b`, "i").test(text)) return d;
  return undefined;
}

const GROUP: Record<Profile["citizenship"], string> = { EU: "EU citizen", NON_EU: "non-EU citizen", NORDIC: "Nordic citizen" };
const DOING: Record<Profile["purpose"][number], string> = { work: "working", study: "studying", family: "joining family" };

const article = (w: string) => (/^[aeiou]/i.test(w) && !/^eu\b/i.test(w) ? "an" : "a");

export function profileParts(p: Profile, assumptions: string[], text: string): Part[] {
  const nat = nationalityIn(text);
  const whoText = nat ? `${nat} citizen` : GROUP[p.citizenship];
  // "with your family" already says it; don't also say "joining family".
  const purposes = p.purpose.filter((x) => !(x === "family" && p.hasFamily && p.purpose.length > 1)).map((x) => DOING[x]);
  const doing = purposes.length > 1 ? `${purposes.slice(0, -1).join(", ")} and ${purposes[purposes.length - 1]}` : (purposes[0] ?? "moving");

  const salaryIdx = assumptions.findIndex((a) => /salary|gross|net\b/i.test(a));
  const dayIdx = assumptions.findIndex((a) => /only the month/i.test(a));
  const parts: Part[] = [
    { t: `You're ${article(whoText)} ` },
    { field: "citizenship", value: whoText },
    { t: ", " },
    { field: "purpose", value: doing },
    { t: " in " },
    { field: "city", value: p.city },
  ];
  if (p.arrivalDate) {
    parts.push({ t: " from " }, { field: "arrival", value: longDate(p.arrivalDate) });
    if (dayIdx >= 0) parts.push({ t: " (I assumed " }, { field: `assumption:${dayIdx}`, value: "the 1st", title: assumptions[dayIdx] }, { t: ")" });
  }
  if (p.monthlySalaryEur) {
    parts.push({ t: ", on " }, { field: "salary", value: `€${p.monthlySalaryEur.toLocaleString("en-GB")} a month` });
    if (salaryIdx >= 0) {
      const gross = /\bnet\b/i.test(assumptions[salaryIdx]) ? "net" : "gross";
      parts.push({ t: " (I assumed " }, { field: `assumption:${salaryIdx}`, value: gross, title: assumptions[salaryIdx] }, { t: ")" });
    }
  }
  if (p.hasFamily) parts.push({ t: ", " }, { field: "family", value: "with your family" });
  parts.push({ t: "." });
  const rest = assumptions.map((a, i) => ({ a, i })).filter(({ i }) => i !== salaryIdx && i !== dayIdx);
  if (rest.length) {
    parts.push({ t: " I assumed " });
    rest.forEach(({ a, i }, k) => {
      if (k > 0) parts.push({ t: k === rest.length - 1 ? " and " : ", " });
      parts.push({ field: `assumption:${i}`, value: assumptionPhrase(a), title: a });
    });
    parts.push({ t: "." });
  }
  return parts;
}

/** Short phrase for "I assumed …". */
function assumptionPhrase(sentence: string): string {
  const l = assumptionLabel(sentence);
  if (/^city /.test(l)) return `you mean ${l.slice(5)}`;
  if (l === "arrival date") return "you arrive today";
  if (l === "arrival on the 1st") return "the 1st of the month";
  if (l === "purpose: work" || /\b(interpreted|treated) as (moving to Finland )?for work\b/i.test(sentence)) return "you are coming to work";
  if (l === "PhD as study") return "your PhD counts as study";
  if (/nationality|wife|husband|spouse|partner/i.test(sentence)) return "your partner has the same citizenship";
  // Unknown kind: the whole sentence, not four truncated words.
  const whole = sentence.trim().replace(/\.$/, "");
  return whole[0].toLowerCase() + whole.slice(1);
}

/** The correction appended to the sentence when an editable part changes. */
export function correction(field: Field, value: string, assumptions: string[]): string {
  if (field.startsWith("assumption:")) {
    const a = assumptions[Number(field.split(":")[1])] ?? "";
    return `Correction to "${a}": ${value}.`;
  }
  const name: Record<string, string> = {
    citizenship: "My citizenship is",
    purpose: "I am moving for",
    city: "The city is",
    arrival: "I arrive on",
    salary: "My salary is",
    family: "Family:",
  };
  return `${name[field] ?? field} ${value}.`;
}
