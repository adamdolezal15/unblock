"use client";
import { useMemo, useState } from "react";
import type { LetterDoc, Ref, Seg } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { buildDays, buildOptional, FALLBACK_NOTE, fallbackSteps, lowerName, OPTIONAL_TITLE, type DayEntry, type FallbackStep, type DayStep, type OnlineEntry, type OptionalEntry, type VisitEntry } from "@/lib/ui/days";
import { fmtDay } from "@/lib/ui/format";
import { nodeLabel } from "@/lib/ui/labels";
import type { FormLine } from "@/lib/ui/forms";
import type { DraftOffer } from "@/lib/agent/draftOffers";
import { Prose } from "../letter/LetterView";
import { QuoteCard } from "../letter/QuoteCard";
import { Term } from "../Help";
import { Marker } from "../line/Marker";
import { mainLegs } from "../line/legs";
import { draftAnchor, DraftLink, ReadyToSend } from "../drafts/DraftCard";
import { FormRow } from "../FormRow";
import { allForms, formLine } from "@/lib/ui/forms";
import { useDrafts, type DraftsApi } from "@/lib/ui/useDrafts";
import { IconCalendar, IconDocument, IconExternal, IconInPerson, IconOnline, IconPencil } from "../icons";

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return LONG_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

/** Prose as plain text, without its source number (collapsed cards and wait lines carry no footnotes). */
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

/** The plan as you would live it: a timeline of visit cards, online steps on their day, waits on the rail. */
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
  // One date marker per day: entries on the same date stack under it (the finish stays its own row).
  const groups: DayEntry[][] = [];
  for (const e of entries) {
    const g = groups[groups.length - 1];
    if (g && e.kind !== "done" && g[0].kind !== "done" && g[0].date === e.date) g.push(e);
    else groups.push([e]);
  }
  const legs = mainLegs(groups.map((g) => g.some(onMain)));

  return (
    <section aria-label="Day by day">
      {extra}
      <p className="mb-6 text-[17px] text-muted">
        {visits} {visits === 1 ? "visit" : "visits"} in order. Open Details on a visit for what to bring and the sources.
      </p>
      <ol>
        {groups.map((g, i) => (
          <Row key={i} entries={g} last={i === groups.length - 1} mainLeg={!!legs[i]} inLeg={i === 0 ? null : !!legs[i - 1]}>
            <div className="space-y-4">
              {g.map((e, j) => (
                <Entry key={j} ctx={ctx} entry={e} />
              ))}
            </div>
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
    <section aria-label={OPTIONAL_TITLE} className="mt-12">
      <h2 className="text-[28px] font-bold text-ink">{OPTIONAL_TITLE}</h2>
      <p className="mt-1 max-w-[62ch] text-[17px] text-muted">
        Not part of the dates above. Do them if they help you, for example for online services.
      </p>
      <ul className="mt-4 space-y-4">
        {steps.map((s) => (
          <li key={s.id}>
            <StepHead ctx={ctx} s={s} />
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
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
  return <span className="rounded-[3px] border border-rule-strong px-2 py-[1px] text-[13px] font-bold uppercase tracking-wide text-muted">Optional</span>;
}

/** An optional step in the timeline: on the day it would be done, hollow station, one line saying why it can be skipped. */
function OptionalCard({ ctx, e }: { ctx: Ctx; e: OptionalEntry }) {
  return (
    <article className="card px-6 py-4">
      {e.steps.map((s, i) => (
        <div key={s.id} className={i > 0 ? "mt-3" : ""}>
          <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button type="button" onClick={() => ctx.onOpen(s.id)} className="text-left text-[20px] font-bold leading-snug text-ink hover:text-accent">
              {s.title}
            </button>
            <OptionalTag />
          </h3>
          <p className="mt-1 max-w-[62ch] text-[15px] leading-normal text-muted">
            {s.optional} {s.authority}.
          </p>
        </div>
      ))}
    </article>
  );
}

const btn =
  "btn-secondary";
const link = "link";

/** On the slowest chain (the blue line): visits / online steps on it, and the finish. */
const onMain = (e: DayEntry) => e.kind === "done" || ((e.kind === "visit" || e.kind === "online") && e.steps.some((s) => s.critical));

/** One timeline row per day: the calendar spine (day big, month small), the rail with one marker, that day's cards. */
function Row({ entries, last, mainLeg, inLeg, children }: { entries: DayEntry[]; last: boolean; mainLeg: boolean; inLeg: boolean | null; children: React.ReactNode }) {
  const entry = entries[0];
  const critical = entries.some((x) => (x.kind === "visit" || x.kind === "online") && x.steps.some((s) => s.critical));
  const kinds = new Set(entries.map((x) => x.kind));
  // Same stations as the logo and the hero line (components/line).
  const marker = (
    <Marker kind={kinds.has("done") ? "end" : critical ? "main" : kinds.size === 1 && kinds.has("reminder") ? "small" : "hollow"} />
  );
  // At most one wait line per day: the slowest chain's (it is what moves the next date). Every other wait,
  // and the "no official figure" note, is in the card's Details.
  const criticalWait = entries
    .flatMap((x) => (x.kind === "visit" || x.kind === "online" ? x.steps : []))
    .find((s) => s.critical && s.wait);
  const waits = criticalWait ? [waitLine(criticalWait.wait!)] : [];
  const [dayNum, month] = fmtDay(entry.date).split(" ");

  return (
    <li className="grid grid-cols-[3.5rem_24px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[5.5rem_28px_minmax(0,1fr)] sm:gap-x-3">
      <div className="num pt-[14px] text-right" aria-label={`${entry.kind === "online" ? "From " : `${dow(entry.date)} `}${fmtDay(entry.date)}`}>
        <p aria-hidden className={`text-[28px] font-extrabold leading-none tracking-[-0.02em] ${critical || kinds.has("done") ? "text-accent" : "text-ink"}`}>
          {dayNum}
        </p>
        <p aria-hidden className="mt-1 text-[13px] leading-tight text-muted">
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
        {waits.map((w) => (
          <p key={w} className="mt-3 flex items-start gap-2 pl-1 text-[15px] leading-normal text-muted">
            <span className="mt-[11px] w-4 shrink-0 border-t border-hairline-strong" aria-hidden />
            <span>{w}</span>
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
      return <p className="pt-3 text-[28px] font-bold text-done">You&apos;re fully set up</p>;
  }
}

/** Title, the shortcut tag if any, the "why now" sentence with its source number, and its forms (Optional section). */
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
        <p className="mt-1 max-w-[62ch] text-[17px] leading-normal text-muted">{s.noSource ? "No official source found." : <Prose segs={s.whyNow} />}</p>
      )}
      {s.forms.map((f) => (
        <FormRow key={f.form.id} line={f} variant="card" />
      ))}
      {ctx.drafts?.forStep(s.id).map((o) => <DraftLink key={o.id} offer={o} drafts={ctx.drafts!} />)}
    </>
  );
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

function Unlocks({ ctx, ids }: { ctx: Ctx; ids: string[] }) {
  const name = (id: string) => lowerName(nodeLabel(id, ctx.state.steps[id]?.title ?? id));
  return (
    <div>
      <p className="text-[13px] font-semibold text-muted">Unlocks</p>
      <ul className="mt-2 space-y-1 text-[17px]">
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
    <button type="button" onClick={onClick} aria-expanded={open} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
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
        {status === "ready" ? `Draft ready: ${lowerFirst(o.title)}` : status === "loading" ? `Preparing ${lowerFirst(o.title)}…` : `Prepare ${lowerFirst(o.title)}`}
      </button>
    </p>
  );
}
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** The bottom row of a collapsed card: the one action on the left; "Sources (n)" and Details on the right. */
function ActionRow({ action, drafts, sources, onSources, open, onToggle }: { action: Action | null; drafts?: DraftsApi; sources: number; onSources: () => void; open: boolean; onToggle: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-[min(100%,16rem)] flex-1">{action && <PrimaryAction action={action} drafts={drafts} />}</div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {sources > 0 && (
          <button
            type="button"
            onClick={onSources}
            className="num rounded-full border border-rule-strong px-2 py-[3px] text-[13px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Sources ({sources})
          </button>
        )}
        <Toggle open={open} onClick={onToggle} />
      </div>
    </div>
  );
}

/** Secondary forms and drafts: everything the primary action did not take, in Details. */
function MoreToDo({ forms, offers, drafts }: { forms: FormLine[]; offers: DraftOffer[]; drafts?: DraftsApi }) {
  if (!forms.length && !offers.length) return null;
  return (
    <section>
      <p className="text-[13px] font-semibold text-muted">Also for this {forms.length + offers.length === 1 ? "step" : "visit"}</p>
      <ul className="mt-2 space-y-2">
        {forms.map((f) => (
          <li key={f.form.id}>
            <FormRow line={f} variant="inline" />
          </li>
        ))}
        {drafts && offers.map((o) => <li key={o.id}><DraftLink offer={o} drafts={drafts} /></li>)}
      </ul>
    </section>
  );
}

/** Every wait of the card's steps in full, including "Estimate: no official figure found" (the rail shows one, shortened). */
function Waits({ steps }: { steps: DayStep[] }) {
  const w = steps.filter((s) => s.wait);
  if (!w.length) return null;
  return (
    <section className="sm:col-span-2">
      <p className="text-[13px] font-semibold text-muted">Waiting time</p>
      <ul className="mt-2 space-y-1 text-[15px] leading-normal text-ink">
        {w.map((s) => (
          <li key={s.id}>
            {w.length > 1 && <span className="font-semibold">{s.short}: </span>}
            {plain(s.wait!)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The verified quotes behind a card, each with its number. */
function SourceQuotes({ refs }: { refs: Ref[] }) {
  if (!refs.length) return null;
  return (
    <section className="sm:col-span-2">
      <p className="text-[13px] font-semibold text-muted">Sources</p>
      <ul className="mt-2 space-y-4">
        {refs.map((r) => (
          <li key={r.n}>
            <QuoteCard citation={r.citation} n={r.n} size="sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** At most one badge: the Shortcut tag. (The slowest chain is shown by blue dates and filled dots, not a label.) */
function Badge({ ctx, steps }: { ctx: Ctx; steps: DayStep[] }) {
  const sc = steps.map((s) => ctx.shortcut?.(s.id)).find((x) => x != null);
  if (sc) return <>{sc}</>;
  return null;
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
  if (s.noSource) return { text: "No official source found.", skip: false };
  const why = plain(s.whyNow);
  const sk = skipLine(why);
  return sk ? { text: sk.line, skip: true } : { text: why, skip: false };
};

/** Title and one plain reason line, no source numbers (they are behind "Sources (n)"). */
function StepLine({ s }: { s: DayStep; big?: boolean }) {
  const why = reasonOf(s);
  return (
    <div>
      <h3 className={`text-[20px] font-bold leading-snug text-ink`}>{s.title}</h3>
      {why.text && <p className={`mt-1 max-w-[62ch] leading-normal text-muted ${why.skip ? "text-[15px]" : "text-[17px]"}`}>{why.text}</p>}
    </div>
  );
}

/** The full "If you skip it" sentences that a card shortened, for its Details. */
function SkipDetails({ steps }: { steps: DayStep[] }) {
  const long = steps.filter((s) => !s.noSource && skipLine(plain(s.whyNow))?.cut);
  if (!long.length) return null;
  return (
    <section className="sm:col-span-2">
      <p className="text-[13px] font-semibold text-muted">If you skip it</p>
      <ul className="mt-2 space-y-1 text-[15px] leading-normal text-ink">
        {long.map((s) => (
          <li key={s.id}>
            {long.length > 1 && <span className="font-semibold">{s.short}: </span>}
            {plain(s.whyNow).replace(SKIP, "").replace(/^./, (ch) => ch.toUpperCase())}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "ID code at Vero" -> "ID code" when the title already names the office. */
function withoutOffice(short: string, authority: string): string {
  const suffix = ` at ${authority}`.toLowerCase();
  return short.toLowerCase().endsWith(suffix) ? short.slice(0, short.length - suffix.length) : short;
}

/** Several steps in one visit: one title ("Vero: ID code + tax card"), the first step's reason, the rest as checklist lines. */
function MergedVisit({ e }: { e: VisitEntry }) {
  const [first, ...rest] = e.steps;
  const names = e.steps.map((s, i) => (i ? lowerName(withoutOffice(s.short, e.authority)) : withoutOffice(s.short, e.authority)));
  const why = reasonOf(first);
  return (
    <div className="mt-2">
      <h3 className="text-[20px] font-bold leading-snug text-ink">
        {e.authority}: {names.join(" + ")}
      </h3>
      {why.text && <p className={`mt-1 max-w-[62ch] leading-normal text-muted ${why.skip ? "text-[15px]" : "text-[17px]"}`}>{why.text}</p>}
      <ul className="mt-3 space-y-2">
        {rest.map((s) => {
          const r = reasonOf(s).text;
          return (
            <li key={s.id} className="flex gap-2 text-[17px] leading-normal">
              <span className="mt-[5px] h-[15px] w-[15px] shrink-0 rounded-[4px] border-[1.5px] border-hairline-strong" aria-hidden />
              <span className="min-w-0">
                <span className="font-semibold text-ink">{s.title}</span>
                {r && <span className="block text-[15px] text-muted">{r}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Visit({ ctx, e }: { ctx: Ctx; e: VisitEntry }) {
  const [open, setOpen] = useState(false);
  const unlocks = [...new Set(e.steps.flatMap((s) => s.unlocks))].filter((id) => !e.steps.some((s) => s.id === id));
  const critical = e.steps.some((s) => s.critical);
  const lead = e.steps[0].id;
  const forms = uniqueForms([...e.steps.flatMap((s) => s.forms), ...e.forms]);
  const offers = e.steps.flatMap((s) => ctx.drafts?.forStep(s.id) ?? []);
  const action = primaryAction(forms, offers);
  const refs = uniqueRefs([
    ...e.steps.flatMap((s) => [...refsOf(s.whyNow), ...refsOf(s.wait)]),
    ...forms.flatMap((f) => refsOf(f.guide)),
    ...e.bring.map((b) => b.ref),
    e.address?.ref,
    e.booking?.ref,
    e.venue?.ref,
    e.venue?.when?.ref,
    ...e.tips.map((t) => t.ref),
  ]);
  const restForms = action?.kind === "form" ? forms.slice(1) : forms;
  const restOffers = action?.kind === "draft" ? offers.slice(1) : offers;

  return (
    <article className="card">
      <div className="px-4 pb-4 pt-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="flex min-w-0 items-center gap-2 text-[15px] text-muted">
            <IconInPerson className="h-4 w-4 shrink-0 text-ink" />
            {e.steps.length > 1 ? (
              <span>In person, {e.steps.length === 2 ? "both" : `all ${e.steps.length}`} in one visit</span>
            ) : (
              <span className="font-semibold text-ink">{e.authority}</span>
            )}
          </p>
          <Badge ctx={ctx} steps={e.steps} />
        </header>
        {e.steps.length > 1 ? (
          <MergedVisit e={e} />
        ) : (
          <div className="mt-2">
            <StepLine s={e.steps[0]} />
          </div>
        )}
        <ActionRow action={action} drafts={ctx.drafts} sources={refs.length} onSources={() => ctx.onSources(lead)} open={open} onToggle={() => setOpen((o) => !o)} />
      </div>

      {open && (
        <div className="grid gap-x-8 gap-y-4 border-t border-rule px-4 py-4 sm:grid-cols-2 sm:px-6">
          {e.bring.length > 0 && (
            <section>
              <p className="text-[13px] font-semibold text-muted">Bring</p>
              <ul className="mt-2 space-y-2 text-[17px] leading-snug text-ink">
                {e.bring.map((b) => (
                  <li key={b.value} className="flex gap-2">
                    <span className="mt-[3px] h-[15px] w-[15px] shrink-0 rounded-[3px] border-[1.5px] border-rule-strong" aria-hidden />
                    <span>{b.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {unlocks.length > 0 && <Unlocks ctx={ctx} ids={unlocks} />}
          <MoreToDo forms={restForms} offers={restOffers} drafts={ctx.drafts} />
          <section className="space-y-2 text-[17px] text-ink sm:col-span-2">
            <p className="text-[13px] font-semibold text-muted">Visit</p>
            {e.address && <p>{e.address.value}</p>}
            {e.venue && (
              <p className="flex items-start gap-2">
                <IconInPerson className="mt-[4px] h-4 w-4 shrink-0 text-muted" />
                <span>
                  Can be done at your university&apos;s {e.venue.name}
                  {e.venue.when ? `: ${e.venue.when.value}.` : ". Check the date for your intake with your university."}
                </span>
              </p>
            )}
            {e.booking && !e.booking.url && <p>How to book: {e.booking.text}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              {e.booking?.url && (
                <a href={e.booking.url} target="_blank" rel="noreferrer" className={btn}>
                  Book an appointment <IconExternal className="h-3.5 w-3.5" />
                </a>
              )}
              {e.calendarUrl && (
                <a href={e.calendarUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-[15px] ${link}`}>
                  <IconCalendar className="h-3.5 w-3.5" /> Add this visit to your calendar
                </a>
              )}
            </div>
            {critical && (
              <p className="text-[15px] text-muted">
                <Term term="slowest" long />
              </p>
            )}
          </section>
          {e.tips.length > 0 && (
            <details className="group text-[15px] sm:col-span-2">
              <summary className="cursor-pointer list-none text-muted hover:text-ink">
                <span className="inline-block transition-transform group-open:rotate-90">›</span> {e.tips.length} {e.tips.length === 1 ? "tip" : "tips"} from
                people who did it
              </summary>
              <ul className="mt-2 space-y-2 pl-4 text-muted">
                {e.tips.map((t, i) => (
                  <li key={i}>{t.text}</li>
                ))}
              </ul>
            </details>
          )}
          <SkipDetails steps={e.steps} />
          <Waits steps={e.steps} />
          <SourceQuotes refs={refs} />
        </div>
      )}
    </article>
  );
}

/** Online steps on their day: one line of context, then each step as its own small card. */
function Online({ ctx, e }: { ctx: Ctx; e: OnlineEntry }) {
  return (
    <div>
      <p className="flex items-center gap-2 pb-1 pt-3 text-[15px] text-muted">
        <IconOnline className="h-4 w-4 text-ink" />
        <span className="font-semibold text-ink">Online</span> any time from {fmtDay(e.date)}
      </p>
      <div className="space-y-4">
        {e.steps.map((s) => (
          <OnlineStep key={s.id} ctx={ctx} s={s} />
        ))}
      </div>
    </div>
  );
}

function OnlineStep({ ctx, s }: { ctx: Ctx; s: DayStep }) {
  const [open, setOpen] = useState(false);
  const forms = uniqueForms(s.forms);
  const offers = ctx.drafts?.forStep(s.id) ?? [];
  const action = primaryAction(forms, offers);
  const refs = uniqueRefs([...refsOf(s.whyNow), ...refsOf(s.wait), ...forms.flatMap((f) => refsOf(f.guide))]);
  const badge = <Badge ctx={ctx} steps={[s]} />;
  return (
    <article className="card px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <div className="min-w-0 flex-1">
          <StepLine s={s} big={false} />
        </div>
        {badge}
      </div>
      <ActionRow action={action} drafts={ctx.drafts} sources={refs.length} onSources={() => ctx.onSources(s.id)} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="mt-3 grid gap-x-8 gap-y-4 border-t border-rule pt-3 sm:grid-cols-2">
          {s.unlocks.length > 0 && <Unlocks ctx={ctx} ids={s.unlocks} />}
          <MoreToDo forms={action?.kind === "form" ? forms.slice(1) : forms} offers={action?.kind === "draft" ? offers.slice(1) : offers} drafts={ctx.drafts} />
          {s.critical && (
            <p className="text-[15px] text-muted sm:col-span-2">
              <Term term="slowest" long />
            </p>
          )}
          <SkipDetails steps={[s]} />
          <Waits steps={[s]} />
          <SourceQuotes refs={refs} />
        </div>
      )}
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
