// Finnish public holidays (and the de facto closed eves), computed for any year.
// Offices are closed on Christmas Eve and Midsummer Eve too, so both are included.
import { addCalendarDays } from "./dates";

export type Holiday = { date: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Easter Sunday (Gregorian), anonymous/Meeus-Jones-Butcher algorithm. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** First date in [from, from+6] that falls on `weekday` (0 = Sunday … 6 = Saturday). */
function weekdayOnOrAfter(year: number, month: number, day: number, weekday: number): string {
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(year, month - 1, day + i));
    if (d.getUTCDay() === weekday) return d.toISOString().slice(0, 10);
  }
  throw new Error("unreachable");
}

/** Finnish public holidays and closed eves for one year, sorted by date. */
export function finnishHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: ymd(year, 1, 1), name: "New Year's Day" },
    { date: ymd(year, 1, 6), name: "Epiphany" },
    { date: addCalendarDays(easter, -2), name: "Good Friday" },
    { date: addCalendarDays(easter, 1), name: "Easter Monday" },
    { date: ymd(year, 5, 1), name: "May Day" },
    { date: addCalendarDays(easter, 39), name: "Ascension Day" },
    { date: weekdayOnOrAfter(year, 6, 19, 5), name: "Midsummer Eve" }, // Friday 19–25 June
    { date: weekdayOnOrAfter(year, 6, 20, 6), name: "Midsummer Day" }, // Saturday 20–26 June
    { date: weekdayOnOrAfter(year, 10, 31, 6), name: "All Saints' Day" }, // Saturday 31 Oct – 6 Nov
    { date: ymd(year, 12, 6), name: "Independence Day" },
    { date: ymd(year, 12, 24), name: "Christmas Eve" },
    { date: ymd(year, 12, 25), name: "Christmas Day" },
    { date: ymd(year, 12, 26), name: "Boxing Day" },
  ];
  return list.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Holidays for every year from `fromYear` through `toYear` inclusive. */
export function finnishHolidaysBetween(fromYear: number, toYear: number): Holiday[] {
  const out: Holiday[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(...finnishHolidays(y));
  return out;
}
