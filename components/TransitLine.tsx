"use client";
// The answer drawn as one continuous line. x is proportional to the real dates; visits on the same day
// are one station ("1 Dec · Migri + Vero" above, what you do below); waiting is a lighter dashed stretch
// with its label above. Every station looks the same; only "Set up" at the end is filled, with a check.
import type { DayEntry } from "@/lib/ui/days";
import { calendarDaysBetween } from "@/lib/graph/dates";
import { fmtDay } from "@/lib/ui/format";
import { Marker } from "./line/Marker";

export type Stop = {
  date: string;
  /** Offices on this day, e.g. "Migri + Vero". */
  label: string;
  /** What you do there, e.g. "Register + tax card". */
  what: string;
  stepId?: string;
  critical: boolean;
  end?: boolean;
};

const join = (xs: string[]) => [...new Set(xs)].join(" + ");
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(DVV|Vero|Kela|Migri|EU|ID)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** One stop per day with a visit (same-day visits merged), then "Set up". */
export function stopsFrom(entries: DayEntry[]): Stop[] {
  const stops: Stop[] = [];
  for (const e of entries) {
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
  const t = days >= 10 ? `~${Math.round(days / 7)} weeks` : `~${days} days`;
  return `${t} waiting${office ? ` for ${office.split(" + ").pop()!.replace(/^Your /, "your ")}` : ""}`;
}

const PAD = 80; // px kept free at both ends for labels
const GAP = 160; // minimum px between neighbouring stations
const WAIT_DAYS = 4; // gaps of at least this many calendar days are drawn as waiting

export function TransitLine({ entries, onOpen }: { entries: DayEntry[]; onOpen: (id: string) => void }) {
  const stops = stopsFrom(entries);
  if (stops.length < 2) return null;
  const n = stops.length;
  const seg = 1 / (n - 1); // equal spacing; dates are in the labels, waits are drawn as dashes
  const at = (f: number) => `calc(${PAD}px + (100% - ${2 * PAD}px) * ${f})`;
  const top = 44; // y of the line

  return (
    <div className="-mx-2 overflow-x-auto overflow-y-hidden px-2 pb-2">
      <div className="relative" style={{ height: top + 76, minWidth: (n - 1) * GAP + 2 * PAD }} role="list" aria-label="Your visits in order">
        {stops.slice(0, -1).map((s, i) => {
          const gap = calendarDaysBetween(s.date, stops[i + 1].date);
          const waiting = gap >= WAIT_DAYS;
          const left = at(i * seg);
          const width = `calc((100% - ${2 * PAD}px) * ${seg})`;
          return (
            <div key={`l${i}`} aria-hidden>
              {waiting ? (
                <div className="absolute border-t-[3px] border-dashed border-accent/35" style={{ left, width, top: top - 1.5 }} />
              ) : (
                <div className="absolute h-[4px] bg-accent" style={{ left, width, top: top - 2 }} />
              )}
              {waiting && (
                <div className="absolute w-[150px] -translate-x-1/2 text-center text-[13px] leading-tight text-muted" style={{ left: `calc(${left} + ${width} / 2)`, top: top - 40 }}>
                  {waitLabel(gap, s.label)}
                </div>
              )}
            </div>
          );
        })}
        {stops.map((s, i) => {
          const body = s.end ? <Marker kind="end" /> : <Station />;
          return (
            <div key={i} role="listitem">
              <div className="absolute w-36 -translate-x-1/2 text-center" style={{ left: at(i * seg), top: 0 }}>
                <span className={`num block text-[14px] leading-tight ${s.end ? "font-bold text-ink" : "text-muted"}`}>{fmtDay(s.date)}</span>
              </div>
              <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: at(i * seg), top }}>
                {s.stepId ? (
                  <button type="button" onClick={() => onOpen(s.stepId!)} aria-label={`${fmtDay(s.date)}, ${s.what}: show details`} className="block rounded-full">
                    {body}
                  </button>
                ) : (
                  body
                )}
              </div>
              <div className="absolute w-36 -translate-x-1/2 text-center" style={{ left: at(i * seg), top: top + 24 }}>
                <span className={`line-clamp-2 text-[15px] leading-tight text-ink ${s.end ? "font-bold" : ""}`}>{s.what}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Every station alike: a ring in the line's blue. */
function Station() {
  return <span aria-hidden className="block h-[18px] w-[18px] rounded-full border-[3.5px] border-accent bg-paper" />;
}
