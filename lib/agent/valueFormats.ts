// Shape checks for claim values that are shown as a specific kind of fact. A value that fails is not that
// kind of fact (an address that is a sentence, "hours" that are a deadline, a processing time with no
// duration), so verifyCitations drops it as invalid_value. Shape only: the quote check is separate.

/** A street address: has a number (house number or postcode), no URL, not a sentence. */
export function looksLikeAddress(v: string): boolean {
  return (
    /\d/.test(v) &&
    v.length >= 6 &&
    v.length <= 140 &&
    !/https?:|www\./i.test(v) &&
    !/\b(you|your|can|must|please|should|apply|book|regardless|any)\b/i.test(v)
  );
}

/** Opening hours: a time range, or a weekday with a time, or "closed". */
export function looksLikeHours(v: string): boolean {
  const range = /\b\d{1,2}([.:]\d{2})?\s*(–|-|—|to)\s*\d{1,2}([.:]\d{2})?\b/;
  const dayTime = /\b(mon|tue|wed|thu|fri|sat|sun|weekdays?)\w*\b.*\d/i;
  return v.length <= 140 && (range.test(v) || dayTime.test(v) || /\bclosed\b/i.test(v));
}

/** A processing time: an amount of time, or "immediately" / "during the visit". */
export function looksLikeDuration(v: string): boolean {
  const amount =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a few|several|a|an)\s*((-|–|to)\s*\d+\s*)?(working |business |banking |calendar )?(days?|weeks?|months?|hours?|years?)\b/i;
  return v.length <= 160 && (amount.test(v) || /\b(immediate(ly)?|same day|right away|on the spot|during the (appointment|visit))\b/i.test(v));
}

const VENUE_MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
/** "28 & 29 August" -> month number (1-12), or undefined. Day-month only: the year is never stated. */
export function venueMonth(value: string): number | undefined {
  const m = value.match(new RegExp(`\\b(${VENUE_MONTHS})\\b`, "i"));
  return m ? VENUE_MONTHS.split("|").findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) + 1 : undefined;
}
