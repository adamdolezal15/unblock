"use client";
import { useCallback, useMemo, useState } from "react";
import type { DraftOffer } from "@/lib/agent/draftOffers";
import type { Comparison } from "@/lib/ui/compare";
import type { PlanNumbers } from "@/lib/ui/counts";
import { allForms, formLine } from "@/lib/ui/forms";
import { buildJourney, type WorthItem } from "@/lib/ui/journey";
import { longDate, type LetterDoc } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import type { Selection } from "@/lib/ui/selection";
import { useDrafts } from "@/lib/ui/useDrafts";
import { draftAnchor, ReadyToSend, type DraftFocus } from "../drafts/DraftCard";
import { IconCalendar } from "../icons";
import { LetterView } from "../letter/LetterView";
import { DayByDay } from "../views/DayByDay";
import { MapView } from "../views/MapView";
import { Anytime, Paperwork, TrustCounters, WorthKnowing } from "./Aside";
import { Route } from "./Route";
import { Ticket, type TicketCtx } from "./Ticket";

type Props = {
  state: RunState;
  doc: LetterDoc;
  comparison: Comparison | null;
  numbers: PlanNumbers;
  /** The profile sentence and refinement chips (the same block as Classic). */
  profile: React.ReactNode;
  /** Coverage, partial-plan and error notices, and "Still cross-checking". */
  notices: React.ReactNode;
  /** The shared footer: counts, Make it more accurate, Watch this plan, all sources, how it was worked out. */
  footer: React.ReactNode;
  onOpen: (id: string) => void;
  onSources: (id: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  icsUrl?: string;
};

const MORE = [
  { id: "summary", label: "Summary" },
  { id: "map", label: "Map" },
  { id: "days", label: "Day by day list" },
] as const;
type More = (typeof MORE)[number]["id"];

/** The Journey design (the mockup, bound to the real plan): hero, the route, the day's tickets, the side column. */
export function JourneyResults({ state, doc, comparison, numbers, profile, notices, footer, onOpen, onSources, selection, onSelect, icsUrl }: Props) {
  const journey = useMemo(() => buildJourney(state, doc, comparison), [state, doc, comparison]);
  const drafts = useDrafts(state);
  const forms = useMemo(
    () => allForms(state).map((f) => ({ form: f.form, steps: f.steps, line: formLine(f.form, doc.ref), office: f.steps[0]?.authority ?? "" })),
    [state, doc],
  );
  const notes = useMemo(() => {
    const m = new Map<string, WorthItem[]>();
    for (const w of journey.worth) m.set(w.stepId, [...(m.get(w.stepId) ?? []), w]);
    return m;
  }, [journey]);

  const [stop, setStop] = useState(0);
  const selected = Math.min(stop, Math.max(0, journey.stops.length - 1));
  const [more, setMore] = useState<More | null>(null);
  const [focus, setFocus] = useState<DraftFocus | undefined>(undefined);

  const onDraft = useCallback(
    (o: DraftOffer) => {
      const status = drafts.get(o.id).status;
      if (status === "idle" || status === "error") void drafts.prepare(o.id);
      setFocus((f) => ({ id: o.id, seq: (f?.seq ?? 0) + 1 }));
      setTimeout(() => document.getElementById(draftAnchor(o.id))?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    },
    [drafts],
  );
  const showMore = useCallback((v: More) => {
    setMore(v);
    setTimeout(() => document.getElementById("journey-views")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, []);

  const ctx: TicketCtx = { drafts, notes, onOpen, onSources, onDraft, icsUrl, onSummary: () => showMore("summary") };
  const sched = state.schedule!;
  const startYear = Number(sched.schedule.startDate.slice(0, 4));
  const date = journey.end ? longDate(journey.end, startYear) : null;
  const tickets = journey.stops[selected]?.tickets ?? [];

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-4 sm:px-10 sm:pt-6">
      <section aria-label="Your answer" className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end lg:gap-14">
        <div>
          {profile}
          <h1 className="mt-4 font-j-serif text-[clamp(40px,6vw,64px)] font-medium leading-[1.04] tracking-[-1.5px] sm:mt-[18px]">
            {date ? (
              <>
                You&apos;ll be fully set up by {journey.fuzzy ? "about " : ""}
                <span className="j-marker">{date}</span>.
              </>
            ) : (
              "Your plan."
            )}
          </h1>
          {icsUrl && (
            <a href={icsUrl} className="mt-6 inline-flex h-11 items-center gap-2 rounded-[12px] bg-j-primary px-4 text-[15px] font-semibold text-white hover:bg-[color-mix(in_srgb,var(--j-primary)_86%,var(--j-ink))]">
              <IconCalendar className="h-4 w-4" /> Add all to calendar
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-3 sm:gap-4 lg:justify-end">
          <Stat label="Visits" value={String(numbers.visits)} />
          <Stat label="Online" value={String(numbers.online)} />
          {comparison?.gain && (
            <div
              className="min-w-[150px] flex-1 rounded-[18px] bg-j-shortcut px-[22px] py-[18px] text-white lg:flex-none"
              title={`Set up ${comparison.gain.days} days sooner than the usual order (DVV first)`}
            >
              <p className="text-[13px] text-j-shortcut-chip">Shortcut saves</p>
              <p className="num mt-0.5 font-j-serif text-[36px] font-bold leading-tight">{comparison.gain.days} days</p>
              <p className="text-[12px] text-j-shortcut-chip">vs the usual order</p>
            </div>
          )}
        </div>
      </section>

      {notices}

      <Route stops={journey.stops} waits={journey.waits} selected={selected} onSelect={setStop} />

      <section className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div aria-label={journey.stops[selected] ? `Visits on ${longDate(journey.stops[selected].date)}` : undefined} className="flex flex-col gap-[18px]">
          {tickets.map((t) => (
            <Ticket key={t.key} t={t} ctx={ctx} />
          ))}
        </div>
        <aside className="flex flex-col gap-[18px]">
          <WorthKnowing items={journey.worth} onOpen={onOpen} />
          <Anytime rows={journey.anytime} onOpen={onOpen} />
          <Paperwork forms={forms} drafts={drafts} onDraft={onDraft} />
          <TrustCounters n={numbers} />
        </aside>
      </section>

      {(drafts.offers.length > 0 || forms.length > 0) && (
        <div id="journey-paperwork" className="mt-10 rounded-[28px] border border-j-hairline bg-white px-5 pb-8 sm:px-12 [&>section]:mt-8">
          <ReadyToSend drafts={drafts} forms={forms} focus={focus} />
        </div>
      )}

      <section id="journey-views" aria-label="Other ways to see your plan" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 className="font-sans text-[15px] font-semibold tracking-[2px] text-j-muted">OTHER WAYS TO SEE IT</h2>
          <div role="group" aria-label="Other views" className="flex flex-wrap gap-2">
            {MORE.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={more === m.id}
                onClick={() => setMore(more === m.id ? null : m.id)}
                className={`rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-colors ${
                  more === m.id ? "border-j-ink bg-j-ink text-j-bg" : "border-j-hairline bg-white text-j-ink hover:border-[var(--j-unreached)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {more && (
          <div className="mt-6 rounded-[28px] border border-j-hairline bg-white px-5 py-6 sm:px-12 sm:py-8">
            {more === "summary" && doc.letter && (
              <div className="max-w-[680px]">
                <LetterView letter={doc.letter} onShow={onOpen} headline={false} />
              </div>
            )}
            {more === "map" && <MapView state={state} selection={selection} onSelect={onSelect} />}
            {more === "days" && (
              <div className="max-w-[880px]">
                <DayByDay state={state} doc={doc} onOpen={onOpen} onSources={onSources} />
              </div>
            )}
          </div>
        )}
      </section>

      {footer}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] flex-1 rounded-[18px] border border-j-hairline bg-white px-[22px] py-[18px] lg:min-w-[150px] lg:flex-none">
      <p className="text-[13px] text-j-muted">{label}</p>
      <p className="num mt-0.5 font-j-serif text-[36px] font-bold leading-tight">{value}</p>
    </div>
  );
}
