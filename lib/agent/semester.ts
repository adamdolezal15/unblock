// "next semester" / "next term" / "for the spring semester": the start of that term, never "today".
// Finnish terms: spring from early January, autumn from early September. We use the 1st of the month and
// say so as an assumption. Pure date arithmetic on the person's own words.
const pad = (n: number) => String(n).padStart(2, "0");
const SPRING = 1;
const AUTUMN = 9;

const TERM = String.raw`(?:semester|term|study period)`;
const NEXT = new RegExp(String.raw`\b(?:next|coming|upcoming|following)\s+(?:(spring|autumn|fall|winter|summer)\s+)?${TERM}\b`, "i");
const NAMED = new RegExp(String.raw`\b(?:the|this|for|in)\s+(spring|autumn|fall|winter)\s+${TERM}\b`, "i");

/** First term start strictly after `today` (YYYY-MM-DD) in one of `months`. */
function nextStart(today: string, months: number[]): string {
  const y = Number(today.slice(0, 4));
  for (const year of [y, y + 1]) {
    for (const m of months) {
      const d = `${year}-${pad(m)}-01`;
      if (d > today) return d;
    }
  }
  return `${y + 1}-${pad(months[0])}-01`;
}

/** The term start the text refers to, or undefined when it names no term. */
export function semesterStart(text: string, today: string): string | undefined {
  const m = text.match(NEXT) ?? text.match(NAMED);
  if (!m) return undefined;
  const season = (m[1] ?? "").toLowerCase();
  if (season === "spring" || season === "winter") return nextStart(today, [SPRING]);
  if (season === "autumn" || season === "fall") return nextStart(today, [AUTUMN]);
  return nextStart(today, [SPRING, AUTUMN]);
}

const TERM_STAY = new RegExp(
  String.raw`\berasmus\b|\bexchange (student|semester|studies|period|program(me)?)\b|\b(on|an|for an?) exchange\b|\b(for|during) (the |a |one |next |this |coming )?(spring |autumn |fall )?${TERM}\b|\bone[- ]${TERM}\b`,
  "i",
);
const LONG_STAY = /\b(degree|bachelor|master'?s|phd|doctoral|permanent(ly)?|for good|years)\b/i;

/** The text describes a one-term stay (Erasmus, exchange, "for next semester"), not a degree. */
export function isTermStay(text: string): boolean {
  return TERM_STAY.test(text) && !LONG_STAY.test(text);
}

export const TERM_STAY_ASSUMPTION = "Stay read as one semester, under 12 months.";

/** The assumption sentence for a term start (labelled by lib/ui/assumptionLabel as "arriving <date>"). */
export function semesterAssumption(date: string): string {
  return `Semester start read as ${date}; arrival assumed on that day.`;
}
