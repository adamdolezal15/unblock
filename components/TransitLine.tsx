"use client";
// The answer drawn as one continuous line. x is proportional to the real dates; visits on the same day
// are one station ("1 Dec · Migri + Vero" above, what you do below); waiting is a lighter dashed stretch
// with its label above. Every station looks the same; only "Set up" at the end is filled, with a check.
import type { DayEntry } from "@/lib/ui/days";
import { calendarDaysBetween } from "@/lib/graph/dates";
import { fmtDay } from "@/lib/ui/format";

export type Stop = {
  date: string;
  /** Offices on this day, e.g. "Migri + Vero". */
  label: string;
  /** What you do there, e.g. "Register + tax card". */
  what: string;
  stepId?: string;
  /** The row's text is complete as it stands ("Apply for the residence permit before you travel"). */
  plain?: boolean;
  critical: boolean;
  end?: boolean;
};

const join = (xs: string[]) => [...new Set(xs)].join(" + ");
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(DVV|Vero|Kela|Migri|EU|ID)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** One stop per day with a visit (same-day visits merged), then "Set up". */
export function stopsFrom(entries: DayEntry[]): Stop[] {
  const stops: Stop[] = [];
  for (const e of entries) {
    const pre = e.kind === "visit" || e.kind === "online" ? e.steps.find((s) => s.beforeArrival) : undefined;
    if (pre) {
      stops.push({ date: e.date, label: pre.authority, what: `Apply for the ${lower(pre.short)} before you travel`, stepId: pre.id, plain: true, critical: true });
      continue;
    }
    if (e.kind === "visit") {
      const names = e.steps.map((s) => s.short);
      const what = names.length > 2 ? `${names.slice(0, 2).map((n, i) => (i ? lower(n) : n)).join(" + ")} + ${names.length - 2} more` : names.map((n, i) => (i ? lower(n) : n)).join(" + ");
      const prev = stops[stops.length - 1];
      const critical = e.steps.some((s) => s.critical);
      if (prev && !prev.end && prev.date === e.date) {
        prev.label = join([...prev.label.split(" + "), e.authority]);
        prev.what = `${prev.what} + ${lower(what)}`;
        prev.critical ||= critical;
      } else stops.push({ date: e.date, label: e.authority, what, stepId: e.steps[0]?.id, critical });
    }
    if (e.kind === "done") stops.push({ date: e.date, label: "", what: "Set up", critical: true, end: true });
  }
  return stops;
}

function waitLabel(days: number, office: string): string {
  const t = days >= 10 ? `about ${Math.round(days / 7)} weeks` : `about ${days} days`;
  return `${t} waiting${office ? ` for ${office.split(" + ").pop()!.replace(/^Your /, "your ")}` : ""}`;
}

const WAIT_DAYS = 4; // gaps of at least this many calendar days get a waiting line

/** "Migri and Vero: EU registration, …"; just the action when it already names the office. */
function rowText(s: Stop): string {
  if (s.end) return "Done";
  if (s.plain) return s.what;
  const offices = s.label.split(" + ");
  const named = offices.some((o) => s.what.toLowerCase().includes(o.toLowerCase()));
  return named ? s.what : `${offices.join(" and ")}: ${s.what}`;
}

/** The route as a timetable: date, then what you do; waits are a quiet line between rows. */
export function TransitLine({ entries, onOpen }: { entries: DayEntry[]; onOpen: (id: string) => void }) {
  const stops = stopsFrom(entries);
  if (stops.length < 2) return null;
  const t = { rule: "border-rule", muted: "text-muted", ink: "text-ink", hover: "hover:bg-sunk/60" };
  const gapAt = (i: number) => (i > 0 && i < stops.length ? calendarDaysBetween(stops[i - 1].date, stops[i].date) : 0);
  return (
    <ol className={`max-w-[58ch] border-t ${t.rule}`} aria-label="Your visits in order">
      {stops.map((s, i) => {
        const gap = gapAt(i);
        // A step and the wait that follows it read as one row: no rule between them.
        const waitFollows = gapAt(i + 1) >= WAIT_DAYS;
        const row = (
          <>
            <span className={`num w-[80px] shrink-0 text-[17px] ${s.end ? "font-bold text-accent" : s.critical ? "text-accent" : t.muted}`}>{fmtDay(s.date)}</span>
            <span className={`text-[17px] leading-snug ${t.ink} ${s.end ? "font-bold" : ""}`}>{rowText(s)}</span>
          </>
        );
        return (
          <li key={i}>
            {gap >= WAIT_DAYS && (
              <p className={`border-b ${t.rule} pb-2 pl-[100px] text-[13px] italic leading-snug ${t.muted}`}>{waitLabel(gap, stops[i - 1].label)}</p>
            )}
            <div className={waitFollows ? "" : `border-b ${t.rule}`}>
              {s.stepId ? (
                <button type="button" onClick={() => onOpen(s.stepId!)} aria-label={`${fmtDay(s.date)}, ${rowText(s)}: show details`} className={`flex w-full items-baseline text-left ${waitFollows ? "pb-1 pt-3" : "py-3"} ${t.hover}`}>
                  {row}
                </button>
              ) : (
                <div className={`flex items-baseline ${waitFollows ? "pb-1 pt-3" : "py-3"}`}>{row}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
