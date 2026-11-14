import { addMinutesLocal, helsinkiToUtc, utcBasic } from "./time";
import type { CalEvent } from "./types";
import { truncateDetails } from "./visitPack";

/** Google Calendar "add event" template link. Dates are UTC basic format. */
export function googleTemplateUrl(event: CalEvent): string {
  const end = addMinutesLocal(event.date, event.startTime, event.durationMinutes);
  const start = utcBasic(helsinkiToUtc(event.date, event.startTime));
  const stop = utcBasic(helsinkiToUtc(end.date, end.time));
  const enc = encodeURIComponent;
  const parts = [
    "action=TEMPLATE",
    `text=${enc(event.title)}`,
    `dates=${start}/${stop}`, // the slash stays literal
    `details=${enc(truncateDetails(event.details))}`,
  ];
  if (event.location) parts.push(`location=${enc(event.location)}`);
  return `https://calendar.google.com/calendar/render?${parts.join("&")}`;
}
