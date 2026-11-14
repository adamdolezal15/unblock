// Short chip label for an assumption sentence ("Salary of 3200 EUR is treated as gross per month." ->
// "gross salary"). The full sentence stays available as the chip's tooltip. Labels only, no new facts.
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
  [/citizenship|nationality|dual/i, () => "citizenship"],
  [/purpose/i, () => "purpose: work"],
  [/spouse|wife|husband|partner/i, () => "partner"],
  [/typo|spelling|meant/i, () => "typo corrected"],
];

export function assumptionLabel(sentence: string): string {
  for (const [re, label] of RULES) {
    const m = sentence.match(re);
    if (m) return label(m, sentence);
  }
  const words = sentence.replace(/[.;:,]+$/, "").split(/\s+/);
  return words.length <= 4 ? words.join(" ") : `${words.slice(0, 4).join(" ")}…`;
}
