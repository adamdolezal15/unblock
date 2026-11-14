"use client";
// The answer drawn as a transit line: each in-person visit is a stop (date above, office below), the
// leg into a stop on the slowest chain is thick Finnish blue, the terminus is "Set up". The one bold
// element of the results page; everything around it stays quiet.
import type { DayEntry } from "@/lib/ui/days";
import { fmtDay } from "@/lib/ui/format";

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
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <ol className="flex min-w-[560px]" aria-label="Your visits in order">
        {stops.map((s, i) => {
          const into = i > 0 ? (s.critical ? "h-[5px] bg-accent" : "h-[3px] bg-rule-strong") : "";
          const out = i < stops.length - 1 ? (stops[i + 1].critical ? "h-[5px] bg-accent" : "h-[3px] bg-rule-strong") : "";
          const body = (
            <>
              <span className={`num block text-[15px] leading-none ${s.end ? "font-bold text-ink" : "font-semibold text-muted"}`}>{fmtDay(s.date)}</span>
              <span className="relative mt-3 flex h-7 items-center justify-center">
                {i > 0 && <span className={`absolute left-0 right-1/2 top-1/2 -translate-y-1/2 ${into}`} aria-hidden />}
                {i < stops.length - 1 && <span className={`absolute left-1/2 right-0 top-1/2 -translate-y-1/2 ${out}`} aria-hidden />}
                {s.end ? (
                  <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-accent bg-raised">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m3.5 8.5 3 3 6-6.5" />
                    </svg>
                  </span>
                ) : (
                  <span className={`relative h-4 w-4 rounded-full border-[3px] bg-raised ${s.critical ? "border-accent" : "border-ink"} transition-transform group-hover:scale-125`} />
                )}
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
