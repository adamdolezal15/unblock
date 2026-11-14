"use client";
import { useMemo } from "react";
import { planNumbers, say } from "@/lib/ui/counts";
import type { Comparison } from "@/lib/ui/compare";
import { buildDays, FALLBACK_NOTE, fallbackSteps } from "@/lib/ui/days";
import type { LetterDoc, Seg } from "@/lib/ui/letter";
import { longDate } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { Prose } from "./letter/LetterView";
import { TransitLine } from "./TransitLine";
import { exaLine } from "@/lib/ui/counts";
import { IconCalendar } from "./icons";
import { DateRing } from "./motion/Contours";

type Props = {
  state: RunState;
  doc: LetterDoc;
  comparison: Comparison | null;
  onOpen: (id: string) => void;
  onShowFeed?: () => void;
  /** The whole plan as one .ics file: the header's single action. */
  icsUrl?: string;
};

/**
 * The answer first, in this order only: the date, the one shortcut sentence, the short timeline, one meta line
 * with the single "Add all to calendar" button, a small Exa line, (warnings sit on the step they concern, in Day by day).
 */
export function Hero({ state, doc, comparison, onOpen, onShowFeed, icsUrl }: Props) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  const sched = state.schedule;
  const fallback = fallbackSteps(state);
  if (fallback && (sched || state.phase === "done")) {
    return (
      <section aria-label="Your answer">
        <h1 className="display text-[56px]">Your {fallback.length} steps, in order.</h1>
        <p className="mt-4 max-w-[58ch] text-[20px] leading-snug text-muted">
          Start with {fallback[0].title.replace(/^(?=[A-Z][a-z])./, (c) => c.toLowerCase())}. {FALLBACK_NOTE}
        </p>
      </section>
    );
  }
  if (!sched || !doc.letter) return null;
  const items = sched.schedule.items;
  const path = sched.criticalPath.stepIds;
  const last = path[path.length - 1];
  const end = last ? items[last]?.doneDate : undefined;
  const fuzzy = path.some((id) => items[id]?.estimated);
  const startYear = Number(sched.schedule.startDate.slice(0, 4));

  const n = planNumbers(state);

  // One meta line: "5 visits · 4 online · 15 days sooner" (the comparison keeps its source number, after "sooner").
  const meta: Seg[][] = [[{ t: say.visits(n.visits) }], [{ t: say.online(n.online) }]];
  let metaTitle: string | undefined;
  let joined = -1;
  if (comparison?.gain) {
    const ref = comparison.sentence.find((x) => "ref" in x);
    // "than the usual order" may wrap on its own; the dot always stays with "15 days sooner".
    meta.push([{ t: `${comparison.gain.days} days sooner` }], [{ t: "than the usual order" }, ...(ref ? [ref] : [])]);
    joined = meta.length - 1;
    metaTitle = `${comparison.gain.days} days sooner than the usual order (DVV first)`;
  } else if (comparison) {
    meta.push([{ t: "same order as usual" }]);
    metaTitle = "Your order matches the usual order (DVV first)";
  }
  // "13 January" in Finnish blue, the year (when it differs) in ink.
  const date = end ? longDate(end, startYear) : "";
  const [, dayMonth, year] = date.match(/^(.*?)(?: (\d{4}))?$/) ?? [date, date, undefined];

  return (
    <section aria-label="Your answer">
      <div className="grid gap-y-8 min-[860px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[860px]:items-start min-[860px]:gap-x-10 lg:gap-x-12">
        <div>
          {end ? (
            <h1 className="relative isolate">
              <span className="block text-[13px] font-semibold uppercase leading-none tracking-[0.08em] text-muted">Set up by{fuzzy ? " about" : ""}</span>{" "}
              <DateRing />
              <span className="num mt-2 block font-display text-[clamp(38px,4.6vw,56px)] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
                <span className="text-accent">{dayMonth}</span>
                {year && ` ${year}`}
              </span>
            </h1>
          ) : (
            <h1 className="display text-[56px]">Your plan.</h1>
          )}
          <p className="mt-4 max-w-[32ch] text-[20px] leading-snug text-ink">
            <Prose segs={doc.letter.headline.slice(1)} />
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="num text-[17px] font-semibold text-ink" title={metaTitle}>
              {/* Inline flow: a line breaks only between items (or before "than the usual order"), never after a dot. */}
              {meta.map((segs, i) => (
                <span key={i}>
                  {i === joined && " "}
                  <span className="whitespace-nowrap">
                    {i > 0 && i !== joined && <Sep />}
                    <Prose segs={segs} />
                  </span>
                </span>
              ))}
              {/* The key to the colour of the dates in the timeline and in Day by day. */}
              <span className="mt-1 block text-[15px] font-normal text-muted">Blue dates set your finish date.</span>
            </p>
            {icsUrl && (
              <a
                href={icsUrl}
                className="btn-primary"
              >
                <IconCalendar className="h-4 w-4" /> Add all to calendar
              </a>
            )}
          </div>
          <ExaLine state={state} onShowFeed={onShowFeed} />
        </div>
        <div className="min-[860px]:pt-1">
          <TransitLine entries={entries} onOpen={onOpen} />
        </div>
      </div>
    </section>
  );
}

/** One small line under the meta line: what Exa did in this run (cached runs keep the original numbers). */
function ExaLine({ state, onShowFeed }: { state: RunState; onShowFeed?: () => void }) {
  const line = state.summary ? exaLine(state.summary, planNumbers(state)) : null;
  if (!line) return null;
  return (
    <p className="num mt-2 text-[13px] text-muted">
      {line}
      {onShowFeed && (
        // The separator and the link wrap together, so a line never ends in a lone dot.
        <span className="whitespace-nowrap">
          <Sep />
          <button type="button" onClick={onShowFeed} className="link">
            how
          </button>
        </span>
      )}
    </p>
  );
}

/** " · " between items, drawn (the font's middle dot sits off-centre): equal space on both sides. */
function Sep() {
  return <span aria-hidden className="mx-2 inline-block h-[3px] w-[3px] rounded-full bg-muted align-middle" />;
}
