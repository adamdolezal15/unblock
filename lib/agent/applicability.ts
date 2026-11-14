// Which citizenship class a piece of text is meant for. Official pages list documents for everyone at once
// ("passport or identity card (or, if neither, a residence permit card)", "residence permit (for non-EU
// citizens)"); the person should only see what applies to their class. Classification of wording only: no
// fact is added, a clause for another class is removed, an item only for another class is dropped.
import type { Profile, VerifiedClaim } from "../types";

export type CitizenshipClass = "EU" | "NORDIC" | "NON_EU" | "TP";

/** Temporary protection is its own path whatever the passport. */
export const citizenshipClass = (p: Pick<Profile, "citizenship" | "temporaryProtection">): CitizenshipClass =>
  p.temporaryProtection ? "TP" : p.citizenship;

/** Wording that concerns only some classes. */
const CLASS_PHRASES: { only: CitizenshipClass[]; re: RegExp }[] = [
  { only: ["NON_EU", "TP"], re: /\bresidence (permit|card)\b|\bvisa\b|\bnon-?\s?(EU|EEA|Nordic)\b|third[- ]country/i },
  { only: ["EU", "NORDIC"], re: /(?<!non-?\s?)\b(EU|EEA) citizens?\b|(?<!non-?\s?)citizens? of (an? |the )?(EU|EEA|European Union)\b|(?<!non-?\s?)\bEU\b[^,;]{0,20}identity card/i },
  { only: ["EU"], re: /registration (certificate )?of (an? |the )?(EU citizen'?s? )?right of residence|right of residence registration|\bEU registration\b/i },
  { only: ["NORDIC"], re: /\bNordic (citizens?|move|registration|notification)|inter-?Nordic/i },
  { only: ["TP"], re: /temporary protection/i },
];

const mentionsOther = (text: string, cls: CitizenshipClass) => CLASS_PHRASES.some((p) => !p.only.includes(cls) && p.re.test(text));
const mentionsOwn = (text: string, cls: CitizenshipClass) => CLASS_PHRASES.some((p) => p.only.includes(cls) && p.re.test(text));

/**
 * A document item as it applies to `cls`: parenthetical and semicolon clauses for another class are removed;
 * null when what is left is only for another class.
 */
export function documentForClass(value: string, cls: CitizenshipClass): string | null {
  let v = value.replace(/\s*\(([^()]*)\)/g, (m, inner: string) => (mentionsOther(inner, cls) && !mentionsOwn(inner, cls) ? "" : m));
  v = v
    .split(/\s*;\s*/)
    .filter((clause, i, all) => all.length === 1 || !(mentionsOther(clause, cls) && !mentionsOwn(clause, cls)))
    .join("; ")
    .replace(/\s*[,;:]\s*$/, "")
    .trim();
  if (!v) return null;
  if (mentionsOther(v, cls) && !mentionsOwn(v, cls)) return null;
  return v;
}

/** Document claims narrowed to the person's class (other claims unchanged). */
export function documentsForClass(claims: VerifiedClaim[], cls: CitizenshipClass): VerifiedClaim[] {
  const out: VerifiedClaim[] = [];
  for (const c of claims) {
    if (c.kind !== "document") {
      out.push(c);
      continue;
    }
    const value = documentForClass(c.value, cls);
    if (value) out.push(value === c.value ? c : { ...c, value });
  }
  return out;
}
