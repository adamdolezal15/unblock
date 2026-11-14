"use client";
import { useMemo } from "react";
import type { LetterDoc } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { buildDays, lowerName, type DayEntry, type DayStep, type OnlineEntry, type VisitEntry } from "@/lib/ui/days";
import { fmtDay } from "@/lib/ui/format";
import { nodeLabel } from "@/lib/ui/graphLayout";
import { Prose } from "../letter/LetterView";
import { Footnote } from "../letter/Footnote";
import { Term } from "../Help";
import { IconCalendar, IconCheck, IconDownload, IconExternal, IconInPerson, IconOnline } from "../icons";

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return LONG_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

type Props = { state: RunState; doc: LetterDoc; onOpen: (id: string) => void; extra?: React.ReactNode; shortcut?: (id: string) => React.ReactNode };
type Ctx = { state: RunState; onOpen: (id: string) => void; shortcut?: (id: string) => React.ReactNode };

/** The plan as you would live it: a timeline of visit cards, online steps grouped, waits on the rail. */
export function DayByDay({ state, doc, onOpen, extra, shortcut }: Props) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  if (!state.schedule) return <DaysSkeleton />;
  const ctx: Ctx = { state, onOpen, shortcut };
  const visits = entries.filter((e) => e.kind === "visit").length;

  return (
    <section aria-label="Day by day">
      {extra}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-[16px] text-muted">
          {visits} {visits === 1 ? "visit" : "visits"} in order. Click a step for its sources.
        </p>
        {state.calendar && (
          <a href={state.calendar.icsUrl} className={btn}>
            <IconDownload className="h-4 w-4" /> Download all (.ics)
          </a>
        )}
      </div>
      <ol>
        {entries.map((e, i) => (
          <Row key={i} entry={e} last={i === entries.length - 1}>
            <Entry ctx={ctx} entry={e} />
          </Row>
        ))}
      </ol>
    </section>
  );
}

const btn =
  "inline-flex items-center gap-2 rounded-[6px] border border-rule-strong bg-raised px-3.5 py-2 text-[15px] font-medium text-ink transition-colors hover:border-ink";
const link = "text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";

/** One timeline row: date, rail with a marker, content. Waits hang off the rail below the card. */
function Row({ entry, last, children }: { entry: DayEntry; last: boolean; children: React.ReactNode }) {
  const critical = (entry.kind === "visit" || entry.kind === "online") && entry.steps.some((s) => s.critical);
  const marker =
    entry.kind === "done" ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-done text-white">
        <IconCheck className="h-4 w-4" />
      </span>
    ) : entry.kind === "online" ? (
      <span className={`h-3.5 w-3.5 rounded-full border-2 bg-paper ${critical ? "border-accent" : "border-ink/60"}`} />
    ) : entry.kind === "reminder" ? (
      <span className="h-2 w-2 rounded-full bg-rule-strong" />
    ) : (
      <span className={`h-3.5 w-3.5 rounded-full ${critical ? "bg-accent" : "bg-ink"}`} />
    );
  const waits = entry.kind === "visit" || entry.kind === "online" ? entry.steps.filter((s) => s.wait) : [];

  return (
    <li className="grid grid-cols-[6.5rem_28px_minmax(0,1fr)] gap-x-3">
      <div className="num pt-4 text-right">
        <p className="text-[14px] text-muted">{entry.kind === "online" ? "From" : dow(entry.date)}</p>
        <p className="font-serif text-[22px] font-semibold leading-tight text-ink">{fmtDay(entry.date)}</p>
      </div>
      <div className="relative flex justify-center">
        {!last && <span className="absolute bottom-0 top-0 border-l-2 border-rule" aria-hidden />}
        <span className="relative z-10 mt-[22px] flex h-6 items-center">{marker}</span>
      </div>
      <div className="min-w-0 pb-4 pt-2">
        {children}
        {waits.map((s) => (
          <p key={s.id} className="mt-3 flex items-start gap-2 pl-1 text-[15px] leading-relaxed text-muted">
            <span className="mt-[11px] w-5 shrink-0 border-t border-dashed border-rule-strong" aria-hidden />
            <span>
              <Prose segs={s.wait!} />
            </span>
          </p>
        ))}
      </div>
    </li>
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
        <p className="pt-3 text-[15px] text-muted">
          Reminder: {entry.title}
          {entry.ref && <Footnote r={entry.ref} />}
        </p>
      );
    case "done":
      return <p className="pt-3 font-serif text-[24px] font-semibold text-done">You&apos;re fully set up</p>;
  }
}

function StepHead({ ctx, s }: { ctx: Ctx; s: DayStep }) {
  return (
    <>
      <h3>
        <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left font-serif text-[21px] font-semibold leading-snug text-ink hover:text-accent">
          {s.title}
        </button>
      </h3>
      {ctx.shortcut?.(s.id)}
      <p className="mt-1.5 text-[16px] leading-relaxed text-ink">
        {s.noSource ? <span className="text-muted">No official source found.</span> : <Prose segs={s.whyNow} />}
      </p>
    </>
  );
}

function Unlocks({ ctx, ids }: { ctx: Ctx; ids: string[] }) {
  const name = (id: string) => lowerName(nodeLabel(id, ctx.state.steps[id]?.title ?? id));
  return (
    <div>
      <p className="text-[14px] font-semibold text-muted">Unlocks</p>
      <ul className="mt-1.5 space-y-1 text-[16px]">
        {ids.map((id) => (
          <li key={id} className="flex items-baseline gap-2">
            <span className="text-muted" aria-hidden>
              →
            </span>
            <button type="button" onClick={() => ctx.onOpen(id)} className={link}>
              {name(id)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Visit({ ctx, e }: { ctx: Ctx; e: VisitEntry }) {
  const unlocks = [...new Set(e.steps.flatMap((s) => s.unlocks))].filter((id) => !e.steps.some((s) => s.id === id));
  const critical = e.steps.some((s) => s.critical);
  return (
    <article className={`rounded-[8px] border bg-raised ${critical ? "border-accent/50" : "border-rule"}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule px-5 py-3">
        <p className="flex min-w-0 items-center gap-2 text-[15px] text-muted">
          <IconInPerson className="h-4 w-4 shrink-0 text-ink" />
          <span className="font-semibold text-ink">{e.authority}</span>
          {e.address && (
            <span className="min-w-0 truncate">
              {e.address.value}
              <Footnote r={e.address.ref} />
            </span>
          )}
        </p>
        {critical && (
          <span className="text-[14px] text-accent">
            <Term term="slowest" />
          </span>
        )}
      </header>

      <div className="px-5 py-4">
        {e.steps.map((s, i) => (
          <div key={s.id} className={i > 0 ? "mt-4 border-t border-dashed border-rule pt-4" : ""}>
            <StepHead ctx={ctx} s={s} />
          </div>
        ))}
        {e.steps.length > 1 && (
          <p className="mt-3 text-[15px] text-muted">
            <Term term="oneVisit" />
          </p>
        )}

        {(unlocks.length > 0 || e.bring.length > 0) && (
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            {e.bring.length > 0 && (
              <div>
                <p className="text-[14px] font-semibold text-muted">Bring</p>
                <ul className="mt-1.5 space-y-1.5 text-[16px] leading-snug text-ink">
                  {e.bring.map((b) => (
                    <li key={b.value} className="flex gap-2.5">
                      <span className="mt-[3px] h-[15px] w-[15px] shrink-0 rounded-[3px] border-[1.5px] border-rule-strong" aria-hidden />
                      <span>
                        {b.value}
                        <Footnote r={b.ref} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unlocks.length > 0 && <Unlocks ctx={ctx} ids={unlocks} />}
          </div>
        )}
      </div>

      {(e.booking || e.calendarUrl) && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-rule px-5 py-3">
          {e.booking?.url && (
            <span className="inline-flex items-center">
              <a href={e.booking.url} target="_blank" rel="noreferrer" className={btn}>
                Book an appointment <IconExternal className="h-3.5 w-3.5" />
              </a>
              <Footnote r={e.booking.ref} />
            </span>
          )}
          {e.calendarUrl && (
            <a href={e.calendarUrl} target="_blank" rel="noreferrer" className={btn}>
              <IconCalendar className="h-4 w-4" /> Add to Google Calendar
            </a>
          )}
          {e.booking && !e.booking.url && (
            <p className="basis-full text-[15px] text-muted">
              How to book: {e.booking.text}
              <Footnote r={e.booking.ref} />
            </p>
          )}
        </footer>
      )}

      {e.tips.length > 0 && (
        <details className="group border-t border-rule px-5 py-3 text-[15px]">
          <summary className="cursor-pointer list-none text-muted hover:text-ink">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> {e.tips.length} {e.tips.length === 1 ? "tip" : "tips"} from people who did it
          </summary>
          <ul className="mt-2 space-y-1.5 pl-4 text-muted">
            {e.tips.map((t, i) => (
              <li key={i}>
                {t.text}
                {t.ref && <Footnote r={t.ref} />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function Online({ ctx, e }: { ctx: Ctx; e: OnlineEntry }) {
  return (
    <article className="rounded-[8px] border border-dashed border-rule-strong">
      <header className="flex items-center gap-2 border-b border-dashed border-rule px-5 py-3 text-[15px] text-muted">
        <IconOnline className="h-4 w-4 text-ink" />
        <span className="font-semibold text-ink">Online</span> any time from {fmtDay(e.date)}
      </header>
      <div className="divide-y divide-dashed divide-rule">
        {e.steps.map((s) => (
          <div key={s.id} className="px-5 py-4">
            <StepHead ctx={ctx} s={s} />
            {s.unlocks.length > 0 && (
              <div className="mt-3">
                <Unlocks ctx={ctx} ids={s.unlocks} />
              </div>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function DaysSkeleton() {
  return (
    <ol aria-hidden className="space-y-4">
      {[0, 1, 2].map((i) => (
        <li key={i} className="grid grid-cols-[6.5rem_28px_minmax(0,1fr)] gap-x-3">
          <div className="skeleton ml-auto mt-4 h-6 w-16 rounded" />
          <div />
          <div className="space-y-2 rounded-[8px] border border-rule p-5">
            <div className="skeleton h-5 w-2/3 rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
          </div>
        </li>
      ))}
    </ol>
  );
}
