import { HELSINKI_TZ } from "../graph/dates";

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: HELSINKI_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Helsinki's UTC offset in minutes at an instant (120 in winter, 180 in summer). */
function offsetMinutes(instant: Date): number {
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, Number(x.value)]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** Converts a Helsinki wall-clock date+time to a UTC instant, DST-aware. */
export function helsinkiToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset around transitions.
  let guess = naive - offsetMinutes(new Date(naive - 3 * 3600_000)) * 60_000;
  guess = naive - offsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess);
}

/** 20261026T080000Z */
export function utcBasic(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 20261026T100000 (no zone, for use with TZID). */
export function localBasic(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

/** Local end of an event that starts on `date` at `time` and lasts `minutes` (may roll over midnight). */
export function addMinutesLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  const iso = t.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
