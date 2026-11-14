import { addMinutesLocal, localBasic, utcBasic } from "./time";
import { HELSINKI_TZ } from "../graph/dates";
import type { CalEvent } from "./types";

const enc = new TextEncoder();

/** RFC 5545 TEXT escaping. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (never splitting a UTF-8 character); continuation lines start with a space. */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curBytes + n > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // the leading space counts
    }
    cur += ch;
    curBytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// Finland: EEST (+03:00) from the last Sunday of March, EET (+02:00) from the last Sunday of October.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${HELSINKI_TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "TZNAME:EEST",
  "DTSTART:19700329T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "TZNAME:EET",
  "DTSTART:19701025T040000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** One VCALENDAR with every event. `now` is injectable for deterministic output. */
export function toIcs(events: CalEvent[], now: Date = new Date()): string {
  const stamp = utcBasic(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Unblock//Finland arrival plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE,
  ];
  for (const e of events) {
    const end = addMinutesLocal(e.date, e.startTime, e.durationMinutes);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${HELSINKI_TZ}:${localBasic(e.date, e.startTime)}`,
      `DTEND;TZID=${HELSINKI_TZ}:${localBasic(end.date, end.time)}`,
      `SUMMARY:${escapeText(e.title)}`,
      `DESCRIPTION:${escapeText(e.details)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.estimated) lines.push("STATUS:TENTATIVE");
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Tomorrow: ${e.title}`)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
