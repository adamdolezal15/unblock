"use client";
import { useMemo, useState } from "react";
import type { LetterDoc } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { buildDays, buildOptional, FALLBACK_NOTE, fallbackSteps, lowerName, OPTIONAL_TITLE, type DayEntry, type FallbackStep, type DayStep, type OnlineEntry, type OptionalEntry, type VisitEntry } from "@/lib/ui/days";
import { fmtDay } from "@/lib/ui/format";
import { nodeLabel } from "@/lib/ui/labels";
import { Prose } from "../letter/LetterView";
import { Term } from "../Help";
import { Marker } from "../line/Marker";
import { mainLegs } from "../line/legs";
import { DraftLink, ReadyToSend } from "../drafts/DraftCard";
import { FormRow } from "../FormRow";
import { allForms, formLine } from "@/lib/ui/forms";
import { useDrafts, type DraftsApi } from "@/lib/ui/useDrafts";
import { IconCalendar, IconDownload, IconExternal, IconInPerson, IconOnline } from "../icons";
import { RouteMark } from "../line/RouteMark";

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return LONG_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

type Props = {
  state: RunState;
  doc: LetterDoc;
  onOpen: (id: string) => void;
  /** Open the details panel scrolled to this step's sources. */
  onSources: (id: string) => void;
  extra?: React.ReactNode;
  shortcut?: (id: string) => React.ReactNode;
};
type Ctx = {
  state: RunState;
  drafts?: DraftsApi;
  onOpen: (id: string) => void;
  onSources: (id: string) => void;
  shortcut?: (id: string) => React.ReactNode;
};

/** The plan as you would live it: a timeline of visit cards, online steps grouped, waits on the rail. */
export function DayByDay({ state, doc, onOpen, onSources, extra, shortcut }: Props) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  const optional = useMemo(() => buildOptional(state, doc.ref), [state, doc]);
  const drafts = useDrafts(state);
  const forms = useMemo(() => allForms(state).map((f) => ({ ...f, line: formLine(f.form, doc.ref) })), [state, doc]);
  const fallback = fallbackSteps(state);
  if (fallback && (state.schedule || state.phase === "done")) return <StepList steps={fallback} onOpen={onOpen} extra={extra} />;
  if (!state.schedule) return <DaysSkeleton />;
  const ctx: Ctx = { state, onOpen, onSources, shortcut, drafts };
  const visits = entries.filter((e) => e.kind === "visit").length;
  const legs = mainLegs(entries.map(onMain));

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
            shortcut={(e.kind === "visit" || e.kind === "online") && e.steps.some((s) => shortcut?.(s.id) != null)}
          >
            <Entry ctx={ctx} entry={e} />
          </Row>
        ))}
      </ol>
      {optional.length > 0 && <Optional ctx={ctx} steps={optional} />}
      <ReadyToSend drafts={drafts} forms={forms} />
    </section>
  );
}

/** Steps this profile does not need (Step.necessity): apart from the plan, not counted in its dates or visits. */
function Optional({ ctx, steps }: { ctx: Ctx; steps: DayStep[] }) {
  return (
    <section aria-label={OPTIONAL_TITLE} className="relative mt-14 border-t border-rule pt-8">
      <RouteMark top={34} />
      <h2 className="text-[22px] font-bold text-ink">{OPTIONAL_TITLE}</h2>
      <p className="mt-1 max-w-[62ch] text-[16px] text-muted">
        Not part of the dates above. Do them if they help you, for example for online services.
      </p>
      <ul className="mt-5 space-y-5">
        {steps.map((s) => (
          <li key={s.id}>
            <StepHead ctx={ctx} s={s} />
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
              <OptionalTag />
              <span>{s.optional} {s.authority}.</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The label on a step this person can skip. */
function OptionalTag() {
  return <span className="rounded-[3px] border border-rule-strong px-1.5 py-[1px] text-[13px] font-bold uppercase tracking-wide text-muted">Optional</span>;
}

/** An optional step in the timeline: on the day it would be done, hollow station, one line saying why it can be skipped. */
function OptionalCard({ ctx, e }: { ctx: Ctx; e: OptionalEntry }) {
  return (
    <article className="rounded-[10px] border border-dashed border-rule-strong px-5 py-3.5">
      {e.steps.map((s, i) => (
        <div key={s.id} className={i > 0 ? "mt-3" : ""}>
          <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left text-[18px] font-bold leading-snug text-ink hover:text-accent">
              {s.title}
            </button>
            <OptionalTag />
          </h3>
          <p className="mt-1 max-w-[62ch] text-[15px] leading-relaxed text-muted">
            {s.optional} {s.authority}.
          </p>
        </div>
      ))}
    </article>
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
  shortcut,
  children,
}: {
  entry: DayEntry;
  last: boolean;
  mainLeg: boolean;
  inLeg: boolean | null;
  /** A step here is the shortcut: the logo's diamond on the route line. */
  shortcut: boolean;
  children: React.ReactNode;
}) {
  const critical = (entry.kind === "visit" || entry.kind === "online") && entry.steps.some((s) => s.critical);
  // Same stations as the logo and the hero line (components/line).
  const marker = (
    <Marker kind={entry.kind === "done" ? "end" : entry.kind === "online" || entry.kind === "optional" ? "hollow" : entry.kind === "reminder" ? "small" : critical ? "main" : "station"} />
  );
  // Steps done in one visit often share the same wait line: say it once.
  const waitKey = (s: DayStep) => s.wait!.map((x) => ("t" in x ? x.t : `[${x.ref.n}]`)).join("");
  const waits = (entry.kind === "visit" || entry.kind === "online" ? entry.steps.filter((s) => s.wait) : []).filter(
    (s, i, all) => all.findIndex((o) => waitKey(o) === waitKey(s)) === i,
  );

  // The calendar spine: day number big, month and weekday small.
  const [dayNum, month] = fmtDay(entry.date).split(" ");
  return (
    <li className="relative grid grid-cols-[4.5rem_28px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5.5rem_28px_minmax(0,1fr)]">
      {shortcut && <RouteMark kind="diamond" top={22} />}
      <div className="num pt-[14px] text-right" aria-label={`${entry.kind === "online" ? "From " : `${dow(entry.date)} `}${fmtDay(entry.date)}`}>
        <p aria-hidden className="text-[40px] font-extrabold leading-none tracking-[-0.02em] text-ink">{dayNum}</p>
        <p aria-hidden className="mt-1 text-[14px] leading-tight text-muted">
          {entry.kind === "online" ? `from ${month}` : `${month} · ${dow(entry.date).slice(0, 3)}`}
        </p>
      </div>
      <div className="relative flex justify-center">
        {inLeg !== null && <span className={`absolute top-0 h-[34px] ${inLeg ? "w-[4px] bg-accent" : "w-[2px] bg-rule-strong"}`} aria-hidden />}
        {!last && <span className={`absolute bottom-0 top-[34px] ${mainLeg ? "w-[4px] bg-accent" : "w-[2px] bg-rule-strong"}`} aria-hidden />}
        <span className="relative z-10 mt-[20px] flex h-7 items-center self-start">{marker}</span>
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
    case "optional":
      return <OptionalCard ctx={ctx} e={entry} />;
    case "reminder":
      return <p className="pt-3 text-[15px] text-muted">Reminder: {entry.title}</p>;
    case "done":
      return <p className="pt-3 text-[24px] font-bold text-done">You&apos;re fully set up</p>;
  }
}

/** Title, the shortcut tag if any, and one short "why now" sentence with one source number. */
function StepHead({ ctx, s }: { ctx: Ctx; s: DayStep }) {
  return (
    <>
      <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left text-[20px] font-bold leading-snug text-ink hover:text-accent">
          {s.title}
        </button>
        {ctx.shortcut?.(s.id)}
      </h3>
      {(s.noSource || s.whyNow.length > 0) && (
        <p className="mt-1 max-w-[62ch] text-[16px] leading-relaxed text-muted">{s.noSource ? "No official source found." : <Prose segs={s.whyNow} />}</p>
      )}
      {s.forms.map((f) => (
        <FormRow key={f.form.id} line={f} variant="card" />
      ))}
      {ctx.drafts?.forStep(s.id).map((o) => <DraftLink key={o.id} offer={o} drafts={ctx.drafts!} />)}
    </>
  );
}

/** A quiet "Sources (n)" at the end of a section: opens the step's sources in the details panel. */
function SourcesLink({ ctx, id, n }: { ctx: Ctx; id: string; n: number }) {
  if (!n) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.onSources(id)}
      className="mt-2 text-[14px] text-muted underline decoration-rule-strong underline-offset-[3px] hover:text-accent hover:decoration-accent"
    >
      Sources ({n})
    </button>
  );
}

/** The safety net when no step could be dated: the steps in order, with a calm note. Never an empty plan. */
function StepList({ steps, onOpen, extra }: { steps: FallbackStep[]; onOpen: (id: string) => void; extra?: React.ReactNode }) {
  return (
    <section aria-label="Your steps">
      {extra}
      <p className="mb-6 max-w-[62ch] text-[16px] text-muted">{FALLBACK_NOTE}</p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-3">
            <span className="text-right text-[15px] tabular-nums text-muted">{i + 1}.</span>
            <div>
              <button type="button" onClick={() => onOpen(s.id)} className={`text-[18px] ${link}`}>
                {s.title}
              </button>
              <p className="text-[14px] text-muted">
                {s.authority} · {s.mode === "online" ? "online" : s.mode === "in_person" ? "in person" : "online or in person"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
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

function Visit({ ctx, e }: { ctx: Ctx; e: VisitEntry }) {
  const [open, setOpen] = useState(false);
  const unlocks = [...new Set(e.steps.flatMap((s) => s.unlocks))].filter((id) => !e.steps.some((s) => s.id === id));
  const critical = e.steps.some((s) => s.critical);
  const lead = e.steps[0].id;
  const summary = [
    e.bring.length ? `${e.bring.length} ${e.bring.length === 1 ? "thing" : "things"} to bring` : null,
    unlocks.length ? `unlocks ${unlocks.length} ${unlocks.length === 1 ? "step" : "steps"}` : null,
  ].filter((x): x is string => !!x);
  return (
    <article className={`rounded-[10px] bg-raised ${critical ? "border border-l-[5px] border-rule border-l-accent" : "border border-rule"}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-3.5">
        <p className="flex min-w-0 items-center gap-2 text-[15px] text-muted">
          <IconInPerson className="h-4 w-4 shrink-0 text-ink" />
          <span className="font-semibold text-ink">{e.authority}</span>
          {e.steps.length > 1 && <span>both in one visit</span>}
        </p>
        {critical && (
          <span className="text-[14px] text-accent">
            <Term term="slowest" />
          </span>
        )}
      </header>

      <div className="px-5 pb-4 pt-2">
        {e.steps.map((s, i) => (
          <div key={s.id} className={i > 0 ? "mt-3" : ""}>
            <StepHead ctx={ctx} s={s} />
          </div>
        ))}
        {e.venue && (
          <p className="mt-3 max-w-[62ch] rounded-[6px] bg-accent-soft px-3 py-2 text-[16px] leading-relaxed text-ink">
            Can be done at your university&apos;s {e.venue.name}
            <Prose segs={[{ ref: e.venue.ref }]} />
            {e.venue.when ? (
              <>
                : {e.venue.when.value}
                <Prose segs={[{ ref: e.venue.when.ref }]} />.
              </>
            ) : (
              ". Check the date for your intake with your university."
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-muted">
          {summary.map((t, i) => (
            <span key={t} className="contents">
              {i > 0 && <span aria-hidden>·</span>}
              <span>{t}</span>
            </span>
          ))}
          {e.calendarUrl && (
            <>
              {summary.length > 0 && <span>·</span>}
              <a
                href={e.calendarUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
              >
                <IconCalendar className="h-3.5 w-3.5" /> Add to calendar
              </a>
            </>
          )}
          <span className="ml-auto">
            <Toggle open={open} onClick={() => setOpen((o) => !o)} />
          </span>
        </div>
      </div>

      {open && (
        <div className="grid gap-x-8 gap-y-5 border-t border-rule px-5 py-4 sm:grid-cols-2">
          {(e.bring.length > 0 || e.forms.length > 0) && (
            <section>
              <p className="text-[14px] font-semibold text-muted">Bring</p>
              <ul className="mt-1.5 space-y-1.5 text-[16px] leading-snug text-ink">
                {e.forms.map((f) => (
                  <li key={f.form.id}>
                    <FormRow line={f} variant="inline" />
                  </li>
                ))}
                {e.bring.map((b) => (
                  <li key={b.value} className="flex gap-2.5">
                    <span className="mt-[3px] h-[15px] w-[15px] shrink-0 rounded-[3px] border-[1.5px] border-rule-strong" aria-hidden />
                    <span>{b.value}</span>
                  </li>
                ))}
              </ul>
              <SourcesLink ctx={ctx} id={lead} n={e.sources.bring} />
            </section>
          )}
          {unlocks.length > 0 && <Unlocks ctx={ctx} ids={unlocks} />}
          {(e.address || e.booking) && (
            <section className="sm:col-span-2">
              <p className="text-[14px] font-semibold text-muted">Visit</p>
              {e.address && <p className="mt-1 text-[16px] text-ink">{e.address.value}</p>}
              {e.booking?.url && (
                <a href={e.booking.url} target="_blank" rel="noreferrer" className={`mt-2 ${btn}`}>
                  Book an appointment <IconExternal className="h-3.5 w-3.5" />
                </a>
              )}
              {e.booking && !e.booking.url && <p className="mt-1 text-[16px] text-ink">How to book: {e.booking.text}</p>}
              <div>
                <SourcesLink ctx={ctx} id={lead} n={e.sources.visit} />
              </div>
            </section>
          )}
          {e.tips.length > 0 && (
            <details className="group text-[15px] sm:col-span-2">
              <summary className="cursor-pointer list-none text-muted hover:text-ink">
                <span className="inline-block transition-transform group-open:rotate-90">›</span> {e.tips.length} {e.tips.length === 1 ? "tip" : "tips"} from
                people who did it
              </summary>
              <ul className="mt-2 space-y-1.5 pl-4 text-muted">
                {e.tips.map((t, i) => (
                  <li key={i}>{t.text}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </article>
  );
}

function Online({ ctx, e }: { ctx: Ctx; e: OnlineEntry }) {
  const [open, setOpen] = useState(false);
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
            <StepHead ctx={ctx} s={s} />
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
