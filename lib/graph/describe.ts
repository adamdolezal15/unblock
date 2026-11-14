// Plain-English text for schedule choices, for the UI and scripts. Pure; no data beyond the schedule.
import type { VisitChoice } from "./schedule";

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "1 week", "2 weeks", "3 days", "1 day". */
export function spanText(days: number): string {
  const n = Math.abs(days);
  if (n >= 7 && n % 7 === 0) return `${n / 7} week${n === 7 ? "" : "s"}`;
  return `${n} day${n === 1 ? "" : "s"}`;
}

/**
 * e.g. "Alternative: open the bank account on 7 Dec separately → bank account ready 1 week earlier,
 * but strong ID 2 weeks later and 1 extra visit."
 * `name(id)` gives a short lowercase name for a step ("bank account", "strong ID").
 */
export function describeVisitAlternative(choice: VisitChoice, name: (id: string) => string = (id) => id.replace(/_/g, " ")): string {
  const alt = choice.alternative;
  const starts = Object.entries(alt.members).sort(([, a], [, b]) => (a.startDate < b.startDate ? -1 : 1));
  let action: string;
  if (alt.mode === "separate") {
    const [first, at] = starts[0];
    action = `do ${name(first)} on ${fmtDate(at.startDate)} separately`;
  } else {
    action = `do ${choice.members.map(name).join(" and ")} together on ${fmtDate(starts[0][1].startDate)} in one visit`;
  }
  const gains: string[] = [];
  const losses: string[] = [];
  for (const id of choice.members) {
    const d = alt.memberShift[id]?.readyDays ?? 0;
    if (d < 0) gains.push(`${name(id)} ready ${spanText(d)} earlier`);
    if (d > 0) losses.push(`${name(id)} ${spanText(d)} later`);
  }
  const visitDelta = alt.visits - choice.chosen.visits;
  if (visitDelta > 0) losses.push(`${visitDelta} extra visit${visitDelta === 1 ? "" : "s"}`);
  if (visitDelta < 0) gains.push(`${-visitDelta} visit${visitDelta === -1 ? "" : "s"} fewer`);
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const effects = gains.length && losses.length ? `${join(gains)}, but ${join(losses)}` : join(gains.length ? gains : losses) || "no change";
  const end = alt.planEndShift.calendarDays;
  const planNote = end === 0 ? "" : ` Whole plan ends ${spanText(end)} ${end > 0 ? "later" : "earlier"}.`;
  return `Alternative: ${action} → ${effects}.${planNote}`;
}
