/** Date-only helpers. All dates are YYYY-MM-DD strings meaning a calendar day in Helsinki. */

export const HELSINKI_TZ = "Europe/Helsinki";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date in Helsinki for an instant. */
export function helsinkiDate(instant: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HELSINKI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Accepts "YYYY-MM-DD" (taken as-is) or any ISO timestamp (converted to the Helsinki date). */
export function toHelsinkiDate(iso: string): string {
  if (ISO_DATE.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return helsinkiDate(d);
}

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY = 86_400_000;

export function addCalendarDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY);
}

export function calendarDaysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

export function isWorkingDay(date: string, holidays: ReadonlySet<string> = new Set()): boolean {
  const dow = new Date(toUtc(date)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(date);
}

/** The date itself if it is a working day, else the next working day. */
export function nextWorkingDay(date: string, holidays: ReadonlySet<string> = new Set()): string {
  let d = date;
  while (!isWorkingDay(d, holidays)) d = addCalendarDays(d, 1);
  return d;
}

/** Maps working-day offsets to dates, counting from a working-day start. Memoised. */
export function workingDayCalendar(start: string, holidays: ReadonlySet<string> = new Set()) {
  const days = [nextWorkingDay(start, holidays)];
  return (index: number): string => {
    while (days.length <= index) days.push(nextWorkingDay(addCalendarDays(days[days.length - 1], 1), holidays));
    return days[index];
  };
}

/** Working days in the half-open range (from, to]: how many working days later `to` is than `from` (negative if earlier). */
export function workingDaysBetween(from: string, to: string, holidays: ReadonlySet<string> = new Set()): number {
  if (to < from) return -workingDaysBetween(to, from, holidays);
  let n = 0;
  for (let d = addCalendarDays(from, 1); d <= to; d = addCalendarDays(d, 1)) if (isWorkingDay(d, holidays)) n++;
  return n;
}
