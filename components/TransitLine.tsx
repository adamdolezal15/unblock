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

const PAD = 90; // px kept free at both ends for labels
const MIN_GAP = 0.17; // stations closer than this (share of the width) stagger their labels
const WAIT_DAYS = 4; // gaps of at least this many calendar days are drawn as waiting

export function TransitLine({ entries, onOpen }: { entries: DayEntry[]; onOpen: (id: string) => void }) {
  const stops = stopsFrom(entries);
  if (stops.length < 2) return null;
  const span = Math.max(1, calendarDaysBetween(stops[0].date, stops[stops.length - 1].date));
  const frac = stops.map((s) => calendarDaysBetween(stops[0].date, s.date) / span);
  const at = (f: number) => `calc(${PAD}px + (100% - ${2 * PAD}px) * ${f})`;
  // Stagger: a station too close to the previous one on its row moves its labels onto the other row.
  const row: number[] = [];
  const lastOn = [-1, -1];
  stops.forEach((_, i) => {
    const r = lastOn[0] < 0 || frac[i] - frac[lastOn[0]] >= MIN_GAP ? 0 : lastOn[1] < 0 || frac[i] - frac[lastOn[1]] >= MIN_GAP ? 1 : 0;
    row.push(r);
    lastOn[r] = i;
  });
  const staggered = row.some((r) => r === 1);
  const top = staggered ? 96 : 62; // y of the line
  const height = top + (staggered ? 112 : 58);

  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <div className="relative min-w-[640px]" style={{ height }} role="list" aria-label="Your visits in order">
        {/* the line: solid between stations, lighter dashed while waiting */}
        {stops.slice(0, -1).map((s, i) => {
          const gap = calendarDaysBetween(s.date, stops[i + 1].date);
          const waiting = gap >= WAIT_DAYS;
          const style = { left: at(frac[i]), width: `calc((100% - ${2 * PAD}px) * ${frac[i + 1] - frac[i]})`, top: top - 2 };
          return (
            <div key={`l${i}`} aria-hidden>
              <div className={`absolute ${waiting ? "border-t-[3px] border-dashed border-accent/35" : "h-[4px] bg-accent"}`} style={waiting ? { ...style, top: top - 1.5, height: 0 } : style} />
              {waiting && (
                <div className="absolute -translate-x-1/2 whitespace-nowrap text-[13px] text-muted" style={{ left: `calc(${at(frac[i])} + (100% - ${2 * PAD}px) * ${(frac[i + 1] - frac[i]) / 2})`, top: top - 28 }}>
                  {waitLabel(gap, s.label)}
                </div>
              )}
            </div>
          );
        })}
        {stops.map((s, i) => {
          const up = row[i] === 1;
          const body = (
            <>
              {s.end ? <Marker kind="end" /> : <Station />}
            </>
          );
          const aboveY = up ? 0 : staggered ? 34 : 0;
          const belowY = up ? top + 66 : top + 22;
          const labelAbove = s.end ? fmtDay(s.date) : <>{fmtDay(s.date)}<span className="mx-1.5">·</span>{s.label}</>;
          const stem = up ? { top: aboveY + 20, height: top - aboveY - 30 } : null;
          const stemBelow = up ? { top: top + 12, height: 50 } : null;
          return (
            <div key={i} role="listitem">
              <div className="absolute w-40 -translate-x-1/2 text-center" style={{ left: at(frac[i]), top: aboveY }}>
                <span className={`num block text-[14px] leading-tight ${s.end ? "font-bold text-ink" : "text-muted"}`}>{labelAbove}</span>
              </div>
              {stemBelow && <div className="absolute w-px -translate-x-1/2 bg-rule-strong" style={{ left: at(frac[i]), ...stemBelow }} aria-hidden />}
              {stem && <div className="absolute w-px -translate-x-1/2 bg-rule-strong" style={{ left: at(frac[i]), ...stem }} aria-hidden />}
              <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: at(frac[i]), top }}>
                {s.stepId ? (
                  <button type="button" onClick={() => onOpen(s.stepId!)} aria-label={`${fmtDay(s.date)}, ${s.what}: show details`} className="block rounded-full">
                    {body}
                  </button>
                ) : (
                  body
                )}
              </div>
              <div className="absolute w-40 -translate-x-1/2 text-center" style={{ left: at(frac[i]), top: belowY }}>
                <span className={`block text-[15px] leading-tight ${s.end ? "font-bold" : ""} text-ink`}>{s.what}</span>
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
