"use client";
import { useMemo, useState } from "react";
import type { LetterDoc } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { buildDays, lowerName, type DayEntry, type DayStep, type OnlineEntry, type VisitEntry } from "@/lib/ui/days";
import { fmtDay } from "@/lib/ui/format";
import { nodeLabel } from "@/lib/ui/labels";
import { Prose } from "../letter/LetterView";
import { Footnote } from "../letter/Footnote";
import { Term } from "../Help";
import { Marker } from "../line/Marker";
import { mainLegs } from "../line/legs";
import { IconCalendar, IconDownload, IconExternal, IconInPerson, IconOnline } from "../icons";

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return LONG_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

type Props = {
  state: RunState;
  doc: LetterDoc;
  onOpen: (id: string) => void;
  extra?: React.ReactNode;
  shortcut?: (id: string) => React.ReactNode;
};
type Ctx = {
  state: RunState;
  onOpen: (id: string) => void;
  shortcut?: (id: string) => React.ReactNode;
};

/** The plan as you would live it: a timeline of visit cards, online steps grouped, waits on the rail. */
export function DayByDay({ state, doc, onOpen, extra, shortcut }: Props) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  if (!state.schedule) return <DaysSkeleton />;
  const ctx: Ctx = { state, onOpen, shortcut };
  const visits = entries.filter((e) => e.kind === "visit").length;
  const legs = mainLegs(entries.map(onMain));
  const firstOpen = entries.findIndex((e) => e.kind === "visit" || e.kind === "online");

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
          <Row
            key={i}
            entry={e}
            last={i === entries.length - 1}
            mainLeg={!!legs[i]}
            inLeg={i === 0 ? null : !!legs[i - 1]}
          >
            <Entry ctx={ctx} entry={e} defaultOpen={i === firstOpen} />
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
/** On the slowest chain (the blue line): visits / online steps on it, and the finish. */
const onMain = (e: DayEntry) => e.kind === "done" || ((e.kind === "visit" || e.kind === "online") && e.steps.some((s) => s.critical));

function Row({
  entry,
  last,
  mainLeg,
  inLeg,
  children,
}: {
  entry: DayEntry;
  last: boolean;
  mainLeg: boolean;
  inLeg: boolean | null;
  children: React.ReactNode;
}) {
  const critical = (entry.kind === "visit" || entry.kind === "online") && entry.steps.some((s) => s.critical);
  // Same stations as the logo and the hero line (components/line).
  const marker = (
    <Marker kind={entry.kind === "done" ? "end" : entry.kind === "online" ? "hollow" : entry.kind === "reminder" ? "small" : critical ? "main" : "station"} />
  );
  const waits = entry.kind === "visit" || entry.kind === "online" ? entry.steps.filter((s) => s.wait) : [];

  return (
    <li className="grid grid-cols-[6.5rem_28px_minmax(0,1fr)] gap-x-3">
      <div className="num pt-4 text-right">
        <p className="text-[14px] text-muted">{entry.kind === "online" ? "From" : dow(entry.date)}</p>
        <p className="text-[22px] font-bold leading-tight text-ink">{fmtDay(entry.date)}</p>
      </div>
      <div className="relative flex justify-center">
        {inLeg !== null && <span className={`absolute top-0 h-[34px] ${inLeg ? "w-[4px] bg-accent" : "w-[2px] bg-rule-strong"}`} aria-hidden />}
        {!last && <span className={`absolute bottom-0 top-[34px] ${mainLeg ? "w-[4px] bg-accent" : "w-[2px] bg-rule-strong"}`} aria-hidden />}
        <span className="relative z-10 mt-[20px] flex items-center">{marker}</span>
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

function Entry({ ctx, entry, defaultOpen }: { ctx: Ctx; entry: DayEntry; defaultOpen: boolean }) {
  switch (entry.kind) {
    case "visit":
      return <Visit ctx={ctx} e={entry} defaultOpen={defaultOpen} />;
    case "online":
      return <Online ctx={ctx} e={entry} defaultOpen={defaultOpen} />;
    case "reminder":
      return (
        <p className="pt-3 text-[15px] text-muted">
          Reminder: {entry.title}
          {entry.ref && <Footnote r={entry.ref} />}
        </p>
      );
    case "done":
      return <p className="pt-3 text-[24px] font-bold text-done">You&apos;re fully set up</p>;
  }
}

function StepHead({ ctx, s, compact = false }: { ctx: Ctx; s: DayStep; compact?: boolean }) {
  if (compact) {
    return (
      <h3>
        <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left text-[20px] font-bold leading-snug text-ink hover:text-accent">
          {s.title}
        </button>
      </h3>
    );
  }
  return (
    <>
      <h3>
        <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left text-[21px] font-bold leading-snug text-ink hover:text-accent">
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
            <span className="mt-[7px] h-2 w-2 shrink-0 self-start rounded-full border-2 border-rule-strong" aria-hidden />
            <button type="button" onClick={() => ctx.onOpen(id)} className={link}>
              {name(id)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Toggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className="inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink">
      {open ? "Less" : "Details"}
      <svg
        viewBox="0 0 16 16"
        className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>
  );
}

function Visit({ ctx, e, defaultOpen }: { ctx: Ctx; e: VisitEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const unlocks = [...new Set(e.steps.flatMap((s) => s.unlocks))].filter((id) => !e.steps.some((s) => s.id === id));
  const critical = e.steps.some((s) => s.critical);
  const summary = [
    e.bring.length ? `${e.bring.length} ${e.bring.length === 1 ? "thing" : "things"} to bring` : null,
    unlocks.length ? `unlocks ${unlocks.length} ${unlocks.length === 1 ? "step" : "steps"}` : null,
    e.steps.length > 1 ? "both in one visit" : null,
  ].filter(Boolean);
  return (
    <article className={`rounded-[10px] bg-raised ${critical ? "border border-l-[5px] border-rule border-l-accent" : "border border-rule"}`}>
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
        <span className="flex items-center gap-4">
          {critical && (
            <span className="text-[14px] text-accent">
              <Term term="slowest" />
            </span>
          )}
          <Toggle open={open} onClick={() => setOpen((o) => !o)} />
        </span>
      </header>

      {!open && (
        <div className="px-5 py-4">
          {e.steps.map((s) => (
            <div key={s.id}>
              <StepHead ctx={ctx} s={s} compact />
              {ctx.shortcut?.(s.id)}
            </div>
          ))}
          {summary.length > 0 && <p className="mt-1.5 text-[15px] text-muted">{summary.join(", ").replace(/^./, (c) => c.toUpperCase())}.</p>}
        </div>
      )}
      {open && (
        <>
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
                <span className="inline-block transition-transform group-open:rotate-90">›</span> {e.tips.length} {e.tips.length === 1 ? "tip" : "tips"} from
                people who did it
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
        </>
      )}
    </article>
  );
}

function Online({ ctx, e, defaultOpen }: { ctx: Ctx; e: OnlineEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <article>
      <header className="flex items-center justify-between gap-2 pb-1 pt-3 text-[15px] text-muted">
        <span className="flex items-center gap-2">
          <IconOnline className="h-4 w-4 text-ink" />
          <span className="font-semibold text-ink">Online</span> any time from {fmtDay(e.date)}
        </span>
        <Toggle open={open} onClick={() => setOpen((o) => !o)} />
      </header>
      <div className="divide-y divide-rule">
        {e.steps.map((s) => (
          <div key={s.id} className="py-3">
            <StepHead ctx={ctx} s={s} compact={!open} />
            {open && s.unlocks.length > 0 && (
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
