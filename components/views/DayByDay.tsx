"use client";
import { useMemo } from "react";
import type { LetterDoc } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { buildDays, lowerName, type DayEntry, type DayStep, type OnlineEntry, type VisitEntry } from "@/lib/ui/days";
import { fmtDay } from "@/lib/ui/format";
import { nodeLabel } from "@/lib/ui/graphLayout";
import { Prose } from "../letter/LetterView";
import { Footnote } from "../letter/Footnote";
import { IconCalendar, IconCheck, IconDownload, IconExternal } from "../icons";

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return LONG_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

type Props = { state: RunState; doc: LetterDoc; onOpen: (id: string) => void; extra?: React.ReactNode; shortcut?: (id: string) => React.ReactNode };

/** The plan as you would live it: one entry per visit, online steps grouped, waits as quiet lines. */
export function DayByDay({ state, doc, onOpen, extra, shortcut }: Props) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  if (!state.schedule) return <DaysSkeleton />;
  const ctx: Ctx = { state, onOpen, shortcut };

  return (
    <section aria-label="Day by day">
      {extra}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-[16px] text-muted">Every visit in order. Click a step for its sources and details.</p>
        {state.calendar && (
          <a href={state.calendar.icsUrl} className="inline-flex items-center gap-1.5 text-[15px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
            <IconDownload className="h-4 w-4" /> Download all (.ics)
          </a>
        )}
      </div>
      <ol className="mt-4 border-t border-rule">
        {entries.map((e, i) => (
          <li key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-5 border-b border-rule py-6">
            <DateCol entry={e} />
            <div className="min-w-0">
              <Entry ctx={ctx} entry={e} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

type Ctx = { state: RunState; onOpen: (id: string) => void; shortcut?: (id: string) => React.ReactNode };

function DateCol({ entry }: { entry: DayEntry }) {
  return (
    <div className="num">
      <p className="text-[14px] text-muted">{entry.kind === "online" ? "From" : dow(entry.date)}</p>
      <p className="font-serif text-[22px] font-semibold leading-tight text-ink">{fmtDay(entry.date)}</p>
    </div>
  );
}

function Entry({ ctx, entry }: { ctx: Ctx; entry: DayEntry }) {
  switch (entry.kind) {
    case "visit":
      return <Visit ctx={ctx} e={entry} />;
    case "online":
      return <Online ctx={ctx} e={entry} />;
    case "reminder":
      return (
        <p className="text-[15px] text-muted">
          Reminder: {entry.title}
          {entry.ref && <Footnote r={entry.ref} />}
        </p>
      );
    case "done":
      return (
        <p className="flex items-center gap-2 font-serif text-[22px] font-semibold text-done">
          <IconCheck className="h-5 w-5" /> You&apos;re fully set up
        </p>
      );
  }
}

const link = "text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";

function StepBlock({ ctx, s, first }: { ctx: Ctx; s: DayStep; first: boolean }) {
  const name = (id: string) => nodeLabel(id, ctx.state.steps[id]?.title ?? id);
  return (
    <div className={first ? "" : "mt-5"}>
      <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left font-serif text-[21px] font-semibold leading-snug text-ink hover:text-accent hover:underline hover:decoration-accent/40 hover:underline-offset-4">
          {s.title}
        </button>
        {ctx.shortcut?.(s.id)}
      </h3>
      <p className="mt-1 text-[16px] leading-relaxed text-ink">
        {s.noSource ? <span className="text-muted">No official source found.</span> : <Prose segs={s.whyNow} />}
      </p>
      {s.unlocks.length > 0 && (
        <p className="mt-1 text-[16px] text-ink">
          <span className="text-muted">Unlocks: </span>
          {s.unlocks.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <button type="button" onClick={() => ctx.onOpen(id)} className={link}>
                {lowerName(name(id))}
              </button>
            </span>
          ))}
        </p>
      )}
      {s.wait && (
        <p className="mt-3 border-l-2 border-rule-strong pl-3 text-[15px] text-muted">
          <Prose segs={s.wait} />
        </p>
      )}
    </div>
  );
}

function Visit({ ctx, e }: { ctx: Ctx; e: VisitEntry }) {
  const shown = e.tips.slice(0, 2);
  return (
    <div>
      <p className="text-[16px] text-muted">
        <span className="font-semibold text-ink">{e.authority}</span>
        {e.address && (
          <>
            , {e.address.value}
            <Footnote r={e.address.ref} />
          </>
        )}
      </p>
      <div className="mt-2">
        {e.steps.map((s, i) => (
          <StepBlock key={s.id} ctx={ctx} s={s} first={i === 0} />
        ))}
      </div>
      {e.steps.length > 1 && <p className="mt-3 text-[15px] text-muted">Do both in one visit.</p>}
      {e.bring.length > 0 && (
        <div className="mt-4">
          <p className="text-[16px] font-semibold text-ink">Bring</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[16px] text-ink marker:text-rule-strong">
            {e.bring.map((b) => (
              <li key={b.value}>
                {b.value}
                <Footnote r={b.ref} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
        {e.booking && (
          <span>
            <a href={e.booking.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 ${link}`}>
              Book an appointment <IconExternal className="h-3.5 w-3.5" />
            </a>
            <Footnote r={e.booking.ref} />
          </span>
        )}
        {e.calendarUrl && (
          <a href={e.calendarUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 ${link}`}>
            <IconCalendar className="h-4 w-4" /> Add to Google Calendar
          </a>
        )}
      </p>
      {shown.length > 0 && (
        <div className="mt-4 text-[15px] text-muted">
          <p>From people who did it:</p>
          <ul className="mt-1 space-y-1">
            {shown.map((t, i) => (
              <li key={i}>
                {t.text}
                {t.ref && <Footnote r={t.ref} />}
              </li>
            ))}
          </ul>
          {e.tips.length > shown.length && (
            <button type="button" onClick={() => ctx.onOpen(e.steps[0].id)} className={`mt-1 ${link}`}>
              {e.tips.length - shown.length} more in the details
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Online({ ctx, e }: { ctx: Ctx; e: OnlineEntry }) {
  return (
    <div>
      <p className="text-[16px] text-muted">
        <span className="font-semibold text-ink">Online</span>, any time from {fmtDay(e.date)}
      </p>
      <div className="mt-2">
        {e.steps.map((s, i) => (
          <StepBlock key={s.id} ctx={ctx} s={s} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

function DaysSkeleton() {
  return (
    <ol className="border-t border-rule" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-5 border-b border-rule py-6">
          <div className="skeleton h-6 w-16 rounded" />
          <div className="space-y-2">
            <div className="skeleton h-5 w-2/3 rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
          </div>
        </li>
      ))}
    </ol>
  );
}
