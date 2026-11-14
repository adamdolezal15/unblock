"use client";
// The answer drawn as a transit line: each in-person visit is a stop (date above, office below), the
// slowest chain is the thick Finnish-blue line (components/line/legs.ts), the terminus is "Set up". The one bold
// element of the results page; everything around it stays quiet.
import type { DayEntry } from "@/lib/ui/days";
import { fmtDay } from "@/lib/ui/format";
import { Marker } from "./line/Marker";
import { mainLegs } from "./line/legs";

type Stop = { date: string; label: string; stepId?: string; critical: boolean; end?: boolean };

export function stopsFrom(entries: DayEntry[]): Stop[] {
  const stops: Stop[] = [];
  for (const e of entries) {
    if (e.kind === "visit") stops.push({ date: e.date, label: e.authority, stepId: e.steps[0]?.id, critical: e.steps.some((s) => s.critical) });
    if (e.kind === "done") stops.push({ date: e.date, label: "Set up", critical: true, end: true });
  }
  return stops;
}

export function TransitLine({ entries, onOpen }: { entries: DayEntry[]; onOpen: (id: string) => void }) {
  const stops = stopsFrom(entries);
  if (stops.length < 2) return null;
  const legs = mainLegs(stops.map((s) => s.critical));
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <ol className="flex min-w-[560px]" aria-label="Your visits in order">
        {stops.map((s, i) => {
          const leg = (blue: boolean) => (blue ? "h-[4px] bg-accent" : "h-[2px] bg-rule-strong");
          const into = i > 0 ? leg(legs[i - 1]) : "";
          const out = i < stops.length - 1 ? leg(legs[i]) : "";
          const body = (
            <>
              <span className={`num block text-[15px] leading-none ${s.end ? "font-bold text-ink" : "font-semibold text-muted"}`}>{fmtDay(s.date)}</span>
              <span className="relative mt-3 flex h-7 items-center justify-center [&>span:last-child]:transition-transform group-hover:[&>span:last-child]:scale-110">
                {i > 0 && <span className={`absolute left-0 right-1/2 top-1/2 -translate-y-1/2 ${into}`} aria-hidden />}
                {i < stops.length - 1 && <span className={`absolute left-1/2 right-0 top-1/2 -translate-y-1/2 ${out}`} aria-hidden />}
                <span className="relative">
                  <Marker kind={s.end ? "end" : s.critical ? "main" : "station"} />
                </span>
              </span>
              <span className={`mt-2 block text-[15px] leading-tight ${s.end ? "font-bold text-ink" : "text-ink"}`}>{s.label}</span>
            </>
          );
          return (
            <li key={i} className="min-w-[96px] flex-1 text-center">
              {s.stepId ? (
                <button type="button" onClick={() => onOpen(s.stepId!)} className="group w-full rounded-[6px] px-1 py-1 hover:bg-sunk/60" aria-label={`${fmtDay(s.date)}, ${s.label}: show details`}>
                  {body}
                </button>
              ) : (
                <div className="px-1 py-1">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
