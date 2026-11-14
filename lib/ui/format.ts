// Display formatting. Dates are YYYY-MM-DD Helsinki calendar days; formatted without time zones.
import type { RunActivity } from "@/lib/types";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "13 Jan 2027" */
export function fmtDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "1 Dec" */
export function fmtDay(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Tue" */
export function fmtDow(iso: string): string {
  return DAYS[parts(iso).dow];
}

/** "Tue 1 Dec" */
export function fmtWeekday(iso: string): string {
  return `${fmtDow(iso)} ${fmtDay(iso)}`;
}

/** Hostname without www. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

export function fmtEur(n: number): string {
  return `€${Math.round(n).toLocaleString("en-GB")}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The activity feed's last line: what each actor did in the run. */
export function activityLine(a: RunActivity): string {
  return `Exa: ${plural(a.searches, "search", "searches")}, ${plural(a.pagesRead, "page")} read · Claude: ${plural(a.extractions, "extraction")} · ${plural(a.quotesChecked, "quote")} checked, ${a.quotesDropped} dropped`;
}

/** "Researched live with Exa: 12 searches, 30 pages read, 9 sources" from the run summary. */
export function exaLine(s: { activity: RunActivity; sourcesByTrust: Record<string, number> }): string {
  const sources = Object.values(s.sourcesByTrust).reduce((a, b) => a + b, 0);
  return `Researched live with Exa: ${plural(s.activity.searches, "search", "searches")}, ${plural(s.activity.pagesRead, "page")} read, ${plural(sources, "source")}`;
}

export function fmtSeconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Tuesday 1 December" */
export function fmtLongDay(iso: string): string {
  const { m, d, dow } = parts(iso);
  return `${LONG_DAYS[dow]} ${d} ${LONG_MONTHS[m - 1]}`;
}
