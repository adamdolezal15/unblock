"use client";
import { useMemo, useRef, useState } from "react";
import { useRailProgress } from "../motion/useRailProgress";
import type { LetterDoc, Para, Ref, Seg } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import type { Trust } from "@/lib/types";
import { buildDays, buildOptional, FALLBACK_NOTE, fallbackSteps, OPTIONAL_TITLE, type DayEntry, type FallbackStep, type DayStep, type OnlineEntry, type OptionalEntry, type VisitEntry } from "@/lib/ui/days";
import { domainOf, fmtDay, plural } from "@/lib/ui/format";
import { dedupeBring } from "@/lib/ui/bring";
import type { FormLine } from "@/lib/ui/forms";
import type { DraftOffer } from "@/lib/agent/draftOffers";
import { draftAnchor, draftLabel, ReadyToSend } from "../drafts/DraftCard";
import { FormRow } from "../FormRow";
import { allForms, formLine } from "@/lib/ui/forms";
import { useDrafts, type DraftsApi } from "@/lib/ui/useDrafts";
import { IconBank, IconCalendar, IconCap, IconDocument, IconExternal, IconOnline, IconPencil, IconShield, IconSpeech } from "../icons";

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return LONG_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

/** Prose as plain text, without its source number (cards carry no footnotes; the quotes are in Details). */
const plain = (segs: Seg[]) =>
  segs
    .map((s) => ("t" in s ? s.t : ""))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:;!?])/g, "$1")
    .trim();
/** A note that belongs in Details, not on the rail. */
const ESTIMATE_NOTE = /\s*Estimate: no official figure found\.?/i;
/** The wait as the rail shows it: the plain sentence without the estimate note. */
const waitLine = (wait: Seg[]) => plain(wait).replace(ESTIMATE_NOTE, "").trim();
const refsOf = (segs?: Seg[]) => (segs ?? []).flatMap((s) => ("ref" in s ? [s.ref] : []));
const uniqueRefs = (refs: (Ref | undefined)[]) =>
  refs.filter((r): r is Ref => !!r).filter((r, i, all) => all.findIndex((x) => x.n === r.n) === i).sort((a, b) => a.n - b.n);
const uniqueForms = (forms: FormLine[]) => forms.filter((f, i, all) => all.findIndex((x) => x.form.id === f.form.id) === i);

/** A warning that belongs to one step: money at stake, or sources that disagree. Shown on that step's card only. */
type StepNote = { money?: string; conflict?: string };

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
  notes: Map<string, StepNote>;
  onOpen: (id: string) => void;
  onSources: (id: string) => void;
  shortcut?: (id: string) => React.ReactNode;
};

/** The letter's warnings (money, conflict), keyed by the step they concern. */
function stepNotes(insights: Para[] | undefined): Map<string, StepNote> {
  const m = new Map<string, StepNote>();
  for (const p of insights ?? []) {
    if (!p.stepId || (p.key !== "money" && p.key !== "conflict")) continue;
    const n = m.get(p.stepId) ?? {};
    n[p.key] = plain(p.segs).replace(/\.$/, "");
    m.set(p.stepId, n);
  }
  return m;
}

/** The plan as you would live it: a timeline of visit cards, online steps on their day, waits on the rail. */
export function DayByDay({ state, doc, onOpen, onSources, extra, shortcut }: Props) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  const optional = useMemo(() => buildOptional(state, doc.ref), [state, doc]);
  const notes = useMemo(() => stepNotes(doc.letter?.insights), [doc]);
  const drafts = useDrafts(state);
  // Decorative scroll progress on the rail (re-attached whenever the timeline's entries change).
  const rail = useRef<HTMLOListElement>(null);
  useRailProgress(rail, entries);
  const forms = useMemo(() => allForms(state).map((f) => ({ ...f, line: formLine(f.form, doc.ref) })), [state, doc]);
  const fallback = fallbackSteps(state);
  if (fallback && (state.schedule || state.phase === "done")) return <StepList steps={fallback} onOpen={onOpen} extra={extra} />;
  if (!state.schedule) return <DaysSkeleton />;
  const ctx: Ctx = { state, onOpen, onSources, shortcut, drafts, notes };
  const visits = entries.filter((e) => e.kind === "visit").length;
  // Online steps off the slowest chain have no real date of their own: one "Anytime" group, not the timeline.
  const anytime = entries.filter((e): e is OnlineEntry => e.kind === "online" && !e.steps.some((s) => s.critical));
  const timeline = entries.filter((e) => !(anytime as DayEntry[]).includes(e));
  // One date marker per day: entries on the same date stack under it (the finish stays its own row).
  const groups: DayEntry[][] = [];
  for (const e of timeline) {
    const g = groups[groups.length - 1];
    if (g && e.kind !== "done" && g[0].kind !== "done" && g[0].date === e.date) g.push(e);
    else groups.push([e]);
  }

  return (
    <section aria-label="Day by day">
      {extra}
      <p className="mb-6 text-[15px] text-muted">
        {visits} {visits === 1 ? "visit" : "visits"} in order. Open Details on a visit for what to bring and the sources.
      </p>
      <ol ref={rail}>
        {groups.map((g, i) => (
          <Row key={i} entries={g} first={i === 0} last={i === groups.length - 1}>
            <div className="space-y-4">
              {g.map((e, j) => (
                <Entry key={j} ctx={ctx} entry={e} />
              ))}
            </div>
          </Row>
        ))}
      </ol>
      {anytime.length > 0 && <AnytimeOnline ctx={ctx} entries={anytime} />}
      {optional.length > 0 && <Optional ctx={ctx} steps={optional} />}
      <ReadyToSend drafts={drafts} forms={forms} />
    </section>
  );
}

/** Online steps that do not move the finish date: one group without dates; each card says when it first becomes possible. */
function AnytimeOnline({ ctx, entries }: { ctx: Ctx; entries: OnlineEntry[] }) {
  return (
    <section aria-label="Anytime online" className="mt-12">
      <h2 className="flex items-center gap-2 text-[28px] font-bold text-ink">
        Anytime online
      </h2>
      <p className="mt-1 max-w-[62ch] text-[17px] text-muted">No fixed date. Do these when it suits you.</p>
      <div className="mt-4 space-y-4">
        {entries.flatMap((e) => e.steps.map((s) => <OnlineStep key={s.id} ctx={ctx} s={s} from={e.date} />))}
      </div>
    </section>
  );
}

/** Steps this profile does not need (Step.necessity): apart from the plan, not counted in its dates or visits. */
function Optional({ ctx, steps }: { ctx: Ctx; steps: DayStep[] }) {
  return (
    <section aria-label={OPTIONAL_TITLE} className="mt-12">
      <h2 className="text-[28px] font-bold text-ink">{OPTIONAL_TITLE}</h2>
      <p className="mt-1 max-w-[62ch] text-[17px] text-muted">
        Not part of the dates above. Do them if they help you, for example for online services.
      </p>
      <ul className="mt-4 space-y-4">
        {steps.map((s) => (
          <li key={s.id}>
            <h3>
              <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left text-[20px] font-bold leading-snug text-ink hover:text-accent">
                {s.title}
              </button>
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
              <OptionalTag />
              <span>{s.optional} {s.authority}.</span>
            </p>
            <Warnings ctx={ctx} id={s.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The label on a step this person can skip. */
function OptionalTag() {
  return <span className="rounded-full border border-hairline px-2 py-[1px] text-[13px] font-semibold text-muted">Optional</span>;
}

/** An optional step in the timeline: on the day it would be done, one line saying why it can be skipped. */
function OptionalCard({ ctx, e }: { ctx: Ctx; e: OptionalEntry }) {
  return (
    <article className="card px-5 py-4 sm:px-6">
      {e.steps.map((s, i) => (
        <div key={s.id} className={i > 0 ? "mt-3" : ""}>
          <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left text-[20px] font-semibold leading-snug text-ink hover:text-accent">
              {s.title}
            </button>
            <OptionalTag />
          </h3>
          <p className="mt-1 max-w-[62ch] text-[15px] leading-normal text-muted">
            {s.optional} {s.authority}.
          </p>
          <Warnings ctx={ctx} id={s.id} />
        </div>
      ))}
    </article>
  );
}

const link = "link";

/**
 * One timeline row per day: the date (big number, "Dec · Tue"), a 2px rail with one dot, that day's cards.
 * The rail fills Finnish blue as you scroll (useRailProgress); a dot fills when the line reaches it and its
 * day number turns blue (green at the finish). Without motion everything shows as reached.
 */
function Row({ entries, first, last, children }: { entries: DayEntry[]; first: boolean; last: boolean; children: React.ReactNode }) {
  const entry = entries[0];
  const end = entry.kind === "done";
  // At most one wait line per day: the slowest chain's (it is what moves the next date). Every other wait,
  // and the "no official figure" note, is in the card's Details.
  const criticalWait = entries
    .flatMap((x) => (x.kind === "visit" || x.kind === "online" ? x.steps : []))
    .find((s) => s.critical && s.wait);
  const wait = criticalWait ? waitLine(criticalWait.wait!) : null;
  const [dayNum, month] = fmtDay(entry.date).split(" ");

  return (
    <li className="grid grid-cols-[3rem_16px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[4.5rem_16px_minmax(0,1fr)] sm:gap-x-5" data-end={end ? "" : undefined}>
      <div className="pt-[12px] text-right" aria-label={`${entry.kind === "online" ? "From " : `${dow(entry.date)} `}${fmtDay(entry.date)}`}>
        <p aria-hidden className="daynum num font-display text-[28px] font-bold leading-none tracking-[-0.02em]">
          {dayNum}
        </p>
        <p aria-hidden className="mt-1 whitespace-nowrap text-[13px] leading-tight text-muted">
          {entry.kind === "online" ? `from ${month}` : (<>{month}<span className="mx-1">·</span>{dow(entry.date).slice(0, 3)}</>)}
        </p>
      </div>
      <div className="relative flex justify-center">
        {!first && <span data-rail="" className="rail absolute top-0 h-[24px] w-[2px]" aria-hidden />}
        {!last && <span data-rail="" className="rail absolute bottom-0 top-[24px] w-[2px]" aria-hidden />}
        <span data-station="" className="relative z-10 mt-[16px] flex h-4 w-4 items-center justify-center self-start" aria-hidden>
          <span className={end ? "dot dot-end" : "dot"} />
        </span>
      </div>
      <div className={`min-w-0 ${last ? "" : "pb-6"}`}>
        {children}
        {wait && (
          <p className="mt-3 flex items-start gap-2 pl-1 text-[13px] italic leading-normal text-muted">
            <span className="mt-[9px] w-4 shrink-0 border-t border-hairline-strong" aria-hidden />
            <span>{wait}</span>
          </p>
        )}
      </div>
    </li>
  );
}

function Entry({ ctx, entry }: { ctx: Ctx; entry: DayEntry }) {
  switch (entry.kind) {
    case "visit":
      return <Visit ctx={ctx} e={entry} />;
    case "online":
      return (
        <div className="space-y-4">
          {entry.steps.map((s) => (
            <OnlineStep key={s.id} ctx={ctx} s={s} />
          ))}
        </div>
      );
    case "optional":
      return <OptionalCard ctx={ctx} e={entry} />;
    case "reminder":
      return <p className="pt-3 text-[15px] text-muted">Reminder: {entry.title}</p>;
    case "done":
      return <p className="done-line pt-[6px] font-display text-[28px] font-bold leading-tight text-done">You&apos;re fully set up</p>;
  }
}

/** The safety net when no step could be dated: the steps in order, with a calm note. Never an empty plan. */
function StepList({ steps, onOpen, extra }: { steps: FallbackStep[]; onOpen: (id: string) => void; extra?: React.ReactNode }) {
  return (
    <section aria-label="Your steps">
      {extra}
      <p className="mb-6 max-w-[62ch] text-[17px] text-muted">{FALLBACK_NOTE}</p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-3">
            <span className="text-right text-[15px] tabular-nums text-muted">{i + 1}.</span>
            <div>
              <button type="button" onClick={() => onOpen(s.id)} className={`text-[17px] ${link}`}>
                {s.title}
              </button>
              <p className="text-[13px] text-muted">
                {s.authority} · {s.mode === "online" ? "online" : s.mode === "in_person" ? "in person" : "online or in person"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Toggle({ open, onClick, label = "Details" }: { open: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className="inline-flex items-center gap-1 text-[15px] text-muted hover:text-ink">
      {label}
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

/** The one thing to do on a card, by priority: a form to fill in, else a draft to send, else nothing. */
type Action = { kind: "form"; line: FormLine } | { kind: "draft"; offer: DraftOffer };
function primaryAction(forms: FormLine[], offers: DraftOffer[]): Action | null {
  if (forms[0]) return { kind: "form", line: forms[0] };
  if (offers[0]) return { kind: "draft", offer: offers[0] };
  return null;
}

function PrimaryAction({ action, drafts }: { action: Action; drafts?: DraftsApi }) {
  if (action.kind === "form") {
    const l = action.line;
    const guide = plain(l.guide);
    return (
      <p className="flex min-w-0 items-start gap-2 text-[15px] leading-snug">
        <IconDocument className="mt-[2px] h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0">
          <a href={l.href} target="_blank" rel="noreferrer" aria-label={`${l.linkLabel}: ${l.name}`} className={`font-semibold ${link}`}>
            {l.name}
            <IconExternal className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />
          </a>
          {guide && <span className="text-muted"> {guide.replace(/\.$/, "")}</span>}
        </span>
      </p>
    );
  }
  const o = action.offer;
  const status = drafts?.get(o.id).status;
  return (
    <p className="flex min-w-0 items-start gap-2 text-[15px] leading-snug">
      <IconPencil className="mt-[2px] h-4 w-4 shrink-0 text-accent" />
      <button
        type="button"
        className={`text-left font-semibold ${link}`}
        onClick={() => {
          if (drafts && (status === "idle" || status === "error")) void drafts.prepare(o.id);
          document.getElementById(draftAnchor(o.id))?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        {draftLabel(o, status)}
      </button>
    </p>
  );
}

/** The bottom row of a collapsed card: the one action on the left, Details on the right. */
function ActionRow({ action, drafts, open, onToggle }: { action: Action | null; drafts?: DraftsApi; open: boolean; onToggle: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-[min(100%,16rem)] flex-1">{action && <PrimaryAction action={action} drafts={drafts} />}</div>
      <div className="ml-auto shrink-0">
        <Toggle open={open} onClick={onToggle} />
      </div>
    </div>
  );
}

const SKIP = /^If you skip it:\s*/i;
const SKIP_MAX = 72;
/**
 * "If you skip it: <consequence>" as one short line, "Skip it: <consequence>". A long consequence loses its
 * "such as …" aside, then is cut at a clause boundary (if / until / because / that / when / a comma), else at a
 * word with "…". `cut` is true when the line is shorter than the source sentence (the full one is in Details).
 */
export function skipLine(text: string): { line: string; cut: boolean } | null {
  if (!SKIP.test(text)) return null;
  const full = text.replace(SKIP, "").trim().replace(/\.$/, "");
  let c = full.replace(/,\s*such as [^,]+,/i, "").replace(/\s*\([^)]*\)/g, "").trim();
  if (c.length > SKIP_MAX) {
    const at = [" if ", " until ", " because ", " that ", " when ", ", "]
      .map((b) => c.indexOf(b))
      .filter((i) => i >= 20 && i <= SKIP_MAX)
      .sort((a, b) => a - b)[0];
    c = at !== undefined ? c.slice(0, at) : `${c.slice(0, c.lastIndexOf(" ", SKIP_MAX))}…`;
  }
  return { line: `Skip it: ${c.replace(/[,;:]$/, "")}${c.endsWith("…") ? "" : "."}`, cut: c !== full };
}

/** A step's reason as the card shows it: the short "Skip it" line for a consequence, else the sentence. */
const reasonOf = (s: DayStep) => {
  if (s.noSource) return "No official source found.";
  const why = plain(s.whyNow);
  return skipLine(why)?.line ?? why;
};

/** "Without the tax card, 60% … €1,920 of your €3,200 a month" -> "Without it, €1,920 of your €3,200 is withheld every month." */
function MoneyLine({ text }: { text: string }) {
  const m = text.match(/(€\s?[\d,.]+) of your (€\s?[\d,.]+) a month/);
  return (
    <p className="mt-1 max-w-[62ch] text-[15px] leading-normal text-ink">
      {m ? (
        <>
          Without it, <strong className="font-semibold">{m[1]}</strong> of your {m[2]} is withheld every month.
        </>
      ) : (
        <>{text}.</>
      )}
    </p>
  );
}

/** Sources that disagree, on the step they concern: an amber dot, one line, and the way to both sides. */
function ConflictLine({ text, onOpen }: { text: string; onOpen: () => void }) {
  return (
    <p className="mt-2 flex max-w-[62ch] items-baseline gap-2 text-[13px] leading-normal text-amber-text">
      <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-amber" aria-hidden />
      <span>
        {text}
        <span aria-hidden className="mx-1.5">·</span>
        <button type="button" onClick={onOpen} className="underline decoration-amber-line underline-offset-[3px] hover:decoration-amber">
          see both sides
        </button>
      </span>
    </p>
  );
}

/** The conflict line of a step (money is shown in place of the reason, see StepBody). */
function Warnings({ ctx, id }: { ctx: Ctx; id: string }) {
  const c = ctx.notes.get(id)?.conflict;
  return c ? <ConflictLine text={c} onOpen={() => ctx.onOpen(id)} /> : null;
}

/** Title (Space Grotesk 20px), one muted line (or the money at stake), and the step's conflict, if any. */
function StepBody({ ctx, s, size = 20 }: { ctx: Ctx; s: DayStep; size?: 20 | 17 }) {
  const money = ctx.notes.get(s.id)?.money;
  const why = reasonOf(s);
  return (
    <>
      <h3 className={`${size === 20 ? "text-[20px]" : "text-[17px]"} font-semibold leading-snug tracking-[-0.01em] text-ink`}>{s.title}</h3>
      {money ? <MoneyLine text={money} /> : why && <p className="mt-1 max-w-[62ch] text-[15px] leading-normal text-muted">{why}</p>}
      <Warnings ctx={ctx} id={s.id} />
    </>
  );
}

/** "Migri · in person" and the Shortcut pill, if any. */
function OfficeLine({ ctx, office, how, steps }: { ctx: Ctx; office: string; how: string; steps: DayStep[] }) {
  const sc = steps.map((s) => ctx.shortcut?.(s.id)).find((x) => x != null);
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p className="min-w-0 text-[13px] text-muted">
        <span className="font-semibold text-ink">{office}</span>
        <span aria-hidden className="mx-1.5">·</span>
        {how}
      </p>
      {sc}
    </header>
  );
}

/** What a card's Details need from the visit or step. */
type DetailsData = {
  lead: string;
  steps: DayStep[];
  bring?: VisitEntry["bring"];
  forms: FormLine[];
  booking?: VisitEntry["booking"];
  address?: VisitEntry["address"];
  venue?: VisitEntry["venue"];
  calendarUrl?: string;
  refs: Ref[];
};

const NOT_COMMUNITY = (t: Trust) => t !== "community";

/**
 * A card's Details, under a hairline: Bring (a short checklist), one line "Book · Then · Add to calendar",
 * the sources (one key quote, the domains, "All quotes"), and, collapsed, what people who did it say.
 */
function Details({ ctx, d }: { ctx: Ctx; d: DetailsData }) {
  const bring = d.bring ? dedupeBring(d.bring).slice(0, 6) : [];
  const waits = d.steps.filter((s) => s.wait).map((s) => plain(s.wait!).replace(/^Then\s+/i, "").replace(/\.$/, ""));
  const refs = d.refs.filter((r) => NOT_COMMUNITY(r.citation.trust));
  const leadRefs = refsOf(d.steps[0]?.whyNow).filter((r) => NOT_COMMUNITY(r.citation.trust));
  const key = leadRefs.find((r) => r.citation.trust === "official") ?? refs.find((r) => r.citation.trust === "official") ?? leadRefs[0] ?? refs[0];
  const urls = [...new Set(refs.map((r) => r.citation.url))];
  const domains = [...new Set(refs.map((r) => domainOf(r.citation.url)))];
  const ids = new Set(d.steps.map((s) => s.id));
  const tips = ctx.state.tips.filter((t) => ids.has(t.stepId)).filter((t, i, all) => all.findIndex((x) => x.tip === t.tip) === i);
  const label = "text-muted";

  return (
    <div className="space-y-6 border-t border-hairline px-5 py-5 sm:px-6">
      {bring.length > 0 && (
        <section>
          <h4 className="text-[13px] font-semibold text-muted">Bring</h4>
          <ul className="mt-2 grid gap-x-6 gap-y-2 text-[15px] leading-snug text-ink sm:grid-cols-2">
            {bring.map((b) => (
              <li key={b.value} className="flex gap-2">
                <span className="mt-[2px] h-[15px] w-[15px] shrink-0 rounded-[4px] border-[1.5px] border-hairline-strong" aria-hidden />
                <span className="min-w-0">{b.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.forms.length > 0 && (
        <ul className="space-y-2">
          {d.forms.map((f) => (
            <li key={f.form.id}>
              <FormRow line={f} variant="inline" />
            </li>
          ))}
        </ul>
      )}
      {(d.booking || waits.length > 0 || d.calendarUrl || d.address || d.venue) && (
        <div className="space-y-1 text-[15px] leading-normal text-ink">
          <p className="flex flex-wrap gap-x-6 gap-y-1">
            {d.booking && (
              <span>
                <span className={label}>Book · </span>
                {d.booking.url ? (
                  <a href={d.booking.url} target="_blank" rel="noreferrer" className={link}>
                    online at {domainOf(d.booking.url)}
                    <IconExternal className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />
                  </a>
                ) : (
                  d.booking.text.replace(/\.$/, "")
                )}
              </span>
            )}
            {waits.map((w, i) => (
              <span key={i}>
                <span className={label}>Then · </span>
                {w}
              </span>
            ))}
            {d.calendarUrl && (
              <a href={d.calendarUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 ${link}`}>
                <IconCalendar className="h-3.5 w-3.5" /> Add this visit to calendar
              </a>
            )}
          </p>
          {d.address && (
            <p>
              <span className={label}>Where · </span>
              {d.address.value}
            </p>
          )}
          {d.venue && (
            <p>
              <span className={label}>Or · </span>
              at your university&apos;s {d.venue.name}
              {d.venue.when ? `: ${d.venue.when.value}` : ". Check the date for your intake with your university"}.
            </p>
          )}
        </div>
      )}
      {key && (
        <section>
          <h4 className="text-[13px] font-semibold text-muted">Checked against {plural(urls.length, "source")}</h4>
          <blockquote className="mt-2 max-w-[62ch] font-serif text-[17px] leading-[1.55] text-ink">“{key.citation.quote.trim()}”</blockquote>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {domains.map((dm) => (
              <span key={dm} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-[3px] text-[13px] text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                {dm}
              </span>
            ))}
            <button type="button" onClick={() => ctx.onSources(d.lead)} className={`ml-1 text-[13px] ${link}`}>
              All quotes
            </button>
          </div>
        </section>
      )}
      {tips.length > 0 && <Community tips={tips.map((t) => ({ text: t.tip, url: t.citation.url }))} />}
    </div>
  );
}

/** Tips from people who did it: collapsed, labelled as not official. The only place community tips appear. */
function Community({ tips }: { tips: { text: string; url: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-2 text-[15px] text-ink hover:text-accent">
        <IconSpeech className="h-4 w-4 text-muted" />
        What people who did it say<span className="text-muted">· {tips.length}</span>
        <svg viewBox="0 0 16 16" className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <>
          <p className="mt-2 text-[13px] text-muted">From people who did it. Not official, shown as tips only.</p>
          <ul className="mt-3 space-y-3">
            {tips.map((t, i) => (
              <li key={i} className="max-w-[62ch] border-l-2 border-hairline pl-3">
                <p className="text-[15px] leading-normal text-ink">{t.text}</p>
                <p className="mt-0.5 text-[13px] text-muted">{domainOf(t.url)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function visitRefs(e: VisitEntry, forms: FormLine[]): Ref[] {
  return uniqueRefs([
    ...e.steps.flatMap((s) => [...refsOf(s.whyNow), ...refsOf(s.wait)]),
    ...forms.flatMap((f) => refsOf(f.guide)),
    ...e.bring.map((b) => b.ref),
    e.address?.ref,
    e.booking?.ref,
    e.venue?.ref,
    e.venue?.when?.ref,
  ]);
}

/**
 * A visit card. Several steps at one desk are one ticket: the first step on top, then a dashed seam with two
 * notches cut into the edges, then the other steps on a slightly darker stub with the action and Details.
 */
function Visit({ ctx, e }: { ctx: Ctx; e: VisitEntry }) {
  const [open, setOpen] = useState(false);
  const forms = uniqueForms([...e.steps.flatMap((s) => s.forms), ...e.forms]);
  const offers = e.steps.flatMap((s) => ctx.drafts?.forStep(s.id) ?? []);
  const action = primaryAction(forms, offers);
  const refs = visitRefs(e, forms);
  const restForms = action?.kind === "form" ? forms.slice(1) : forms;
  const [first, ...rest] = e.steps;
  const head = <OfficeLine ctx={ctx} office={e.authority} how="in person" steps={e.steps} />;
  const details = open && (
    <Details
      ctx={ctx}
      d={{ lead: first.id, steps: e.steps, bring: e.bring, forms: restForms, booking: e.booking, address: e.address, venue: e.venue, calendarUrl: e.calendarUrl, refs }}
    />
  );
  const row = <ActionRow action={action} drafts={ctx.drafts} open={open} onToggle={() => setOpen((o) => !o)} />;

  if (!rest.length) {
    return (
      <article className="card overflow-hidden">
        <div className="px-5 py-4 sm:px-6">
          {head}
          <div className="mt-1">
            <StepBody ctx={ctx} s={first} />
          </div>
          {row}
        </div>
        {details}
      </article>
    );
  }
  return (
    <article className="card">
      <div className="px-5 pb-5 pt-4 sm:px-6">
        {head}
        <div className="mt-1">
          <StepBody ctx={ctx} s={first} />
        </div>
      </div>
      <div className="ticket-seam" aria-hidden />
      <div className={`bg-stub px-5 pb-4 pt-5 sm:px-6 ${open ? "" : "rounded-b-[13px]"}`}>
        <div className="space-y-4">
          {rest.map((s) => (
            <div key={s.id}>
              <StepBody ctx={ctx} s={s} />
            </div>
          ))}
        </div>
        {row}
      </div>
      {details}
    </article>
  );
}

/** Which small picture an "Anytime" step gets: bank, university, insurance, else the online screen. */
export function anytimeIcon(s: { title: string; authority: string }) {
  const t = `${s.title} ${s.authority}`.toLowerCase();
  if (/\bbank|banking/.test(t)) return IconBank;
  if (/universit|student|enrol|study|studies|school/.test(t)) return IconCap;
  if (/kela|social security|insurance|health/.test(t)) return IconShield;
  return IconOnline;
}

/** An online step: on the timeline when it is on the slowest chain; otherwise in "Anytime online" with its first possible day. */
function OnlineStep({ ctx, s, from }: { ctx: Ctx; s: DayStep; /** In "Anytime online": the first day it is possible. */ from?: string }) {
  const [open, setOpen] = useState(false);
  const forms = uniqueForms(s.forms);
  const offers = ctx.drafts?.forStep(s.id) ?? [];
  const action = primaryAction(forms, offers);
  const refs = uniqueRefs([...refsOf(s.whyNow), ...refsOf(s.wait), ...forms.flatMap((f) => refsOf(f.guide))]);
  const mode = ctx.state.steps[s.id]?.mode;
  const visit = mode === "in_person" || (mode === "either" && /^your bank$/i.test(s.authority));
  return (
    <article className="card overflow-hidden">
      <div className="px-5 py-4 sm:px-6">
        <OfficeLine ctx={ctx} office={s.authority} how={visit ? "in person" : "online"} steps={[s]} />
        <div className="mt-1">
          <StepBody ctx={ctx} s={s} />
          {from && <p className="mt-1 text-[13px] text-muted">Possible from {fmtDay(from)}</p>}
        </div>
        <ActionRow action={action} drafts={ctx.drafts} open={open} onToggle={() => setOpen((o) => !o)} />
      </div>
      {open && <Details ctx={ctx} d={{ lead: s.id, steps: [s], forms: action?.kind === "form" ? forms.slice(1) : forms, refs }} />}
    </article>
  );
}

function DaysSkeleton() {
  return (
    <ol aria-hidden className="space-y-4">
      {[0, 1, 2].map((i) => (
        <li key={i} className="grid grid-cols-[4.5rem_16px_minmax(0,1fr)] gap-x-5">
          <div className="skeleton ml-auto mt-4 h-6 w-12 rounded" />
          <div />
          <div className="card space-y-2 p-6">
            <div className="skeleton h-5 w-2/3 rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
          </div>
        </li>
      ))}
    </ol>
  );
}
