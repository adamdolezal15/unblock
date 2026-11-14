import type { Citation } from "../types";

/** A calendar entry. Times are Helsinki wall-clock; convert with `helsinkiToUtc` where UTC is needed. */
export type CalEvent = {
  /** Stable id, becomes the ICS UID. */
  uid: string;
  kind: "visit" | "reminder";
  stepId: string;
  title: string;
  /** YYYY-MM-DD, Helsinki. */
  date: string;
  /** HH:MM, Helsinki. */
  startTime: string;
  durationMinutes: number;
  /** Full visit pack as plain text, newline separated. */
  details: string;
  location?: string;
  /** Booking page, emitted as the ICS URL property. */
  url?: string;
  /** true when the date comes from an estimate, not a known appointment. */
  estimated: boolean;
  /** Citation behind a reminder. */
  citation?: Citation;
};
