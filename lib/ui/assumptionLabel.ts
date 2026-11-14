// Short chip label for an assumption sentence ("Salary of 3200 EUR is treated as gross per month." ->
// "gross salary"). The full sentence stays available as the chip's tooltip. Labels only, no new facts.
// parseProfileLlm keeps only assumptions of a known kind (assumptionKind), so every label is one of these.
const RULES: [RegExp, (m: RegExpMatchArray, s: string) => string][] = [
  [/\b(gross|net)\b.*\b(salary|pay|income)\b|\b(salary|pay|income)\b.*\b(gross|net)\b/i, (m) => `${(m[1] ?? m[4]).toLowerCase()} salary`],
  [/\bsalary\b/i, () => "salary"],
  [/\bphd\b|doctoral/i, () => "PhD as study"],
  [/assumed (\p{Lu}[\p{L}-]+) from the university/u, (m) => `city ${m[1]}`],
  [/\bcity\b|municipality/i, (_m, s) => `city ${s.match(/assumed (\p{Lu}[\p{L}-]+)/u)?.[1] ?? ""}`.trim()],
  [/only the month/i, () => "arrival on the 1st"],
  [/arrival|planning from today/i, () => "arrival date"],
  [/\b(EEA|Swiss)\b/, () => "EEA as EU"],
  [/finnish citizen/i, () => "Nordic path"],
  // Family before citizenship: "Citizenship of the spouse not stated" is about the family member.
  [/\b(spouse|wife|husband|partner|child|children|kids?|son|daughter|family)\b/i, () => "family citizenship"],
  [/citizenship|nationality|dual/i, () => "citizenship"],
  [/purpose|\b(interpreted|treated|read|taken|assumed)\b.*\b(work|working|employment|job)\b|\b(occupation|profession|job title)\b/i, () => "purpose: work"],
  [/typo|spelling|meant/i, () => "typo corrected"],
];

/** The rule-based label, or null when the sentence matches no known kind of assumption. */
export function assumptionKind(sentence: string): string | null {
  for (const [re, label] of RULES) {
    const m = sentence.match(re);
    if (m) return label(m, sentence);
  }
  return null;
}

export function assumptionLabel(sentence: string): string {
  const known = assumptionKind(sentence);
  if (known) return known;
  const words = sentence.replace(/[.;:,]+$/, "").split(/\s+/);
  return words.length <= 4 ? words.join(" ") : `${words.slice(0, 4).join(" ")}…`;
}

/** Short phrase after "I assumed …" in the profile sentence; written here, never taken from the model. */
export function assumptionPhrase(sentence: string): string {
  const l = assumptionLabel(sentence);
  if (/^city /.test(l)) return `you mean ${l.slice(5)}`;
  switch (l) {
    case "arrival date":
      return "you arrive today";
    case "arrival on the 1st":
      return "the 1st of the month";
    case "purpose: work":
      return "you are coming to work";
    case "PhD as study":
      return "your PhD counts as study";
    case "EEA as EU":
      return "EEA counts as EU";
    case "Nordic path":
      return "the Nordic path";
    case "family citizenship":
      if (/non-EU/i.test(sentence)) return "your family is non-EU";
      return /\b(spouse|wife|husband|partner)\b/i.test(sentence) ? "your partner has the same citizenship" : "your family has your citizenship";
    case "citizenship":
      return /non-EU/i.test(sentence) ? "you are not an EU citizen" : "the more favourable citizenship";
    case "typo corrected":
      return "a typo was corrected";
    case "gross salary":
    case "net salary":
    case "salary":
      return l;
    default:
      return l;
  }
}
