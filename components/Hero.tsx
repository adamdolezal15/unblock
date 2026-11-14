"use client";
import { useMemo } from "react";
import { countVisits } from "@/lib/graph/baseline";
import type { Comparison } from "@/lib/ui/compare";
import { buildDays, FALLBACK_NOTE, fallbackSteps } from "@/lib/ui/days";
import type { LetterDoc, Seg } from "@/lib/ui/letter";
import { longDate } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { Prose } from "./letter/LetterView";
import { TransitLine } from "./TransitLine";
import { exaLine } from "@/lib/ui/format";
import { HeadsUp } from "./views/Insights";
import { IconCalendar } from "./icons";

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
 * with the single "Add all to calendar" button, a small Exa line, and the quiet "Heads up" block.
 */
export function Hero({ state, doc, comparison, onOpen, onShowFeed, icsUrl }: Props) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  const sched = state.schedule;
  const fallback = fallbackSteps(state);
  if (fallback && (sched || state.phase === "done")) {
    return (
      <section aria-label="Your answer">
        <h1 className="display text-[46px] sm:text-[64px]">Your {fallback.length} steps, in order.</h1>
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

  const steps = Object.values(state.steps).filter((s) => !s.milestone && !s.done && s.necessity !== "optional" && items[s.id]);
  const visits = countVisits(steps, items);
  const online = steps.filter((s) => s.mode !== "in_person").length;

  // One meta line: "5 visits · 4 online · 15 days sooner" (the comparison keeps its source number).
  const meta: Seg[] = [{ t: `${visits} ${visits === 1 ? "visit" : "visits"} · ${online} online` }];
  let metaTitle: string | undefined;
  if (comparison?.gain) {
    const ref = comparison.sentence.find((x) => "ref" in x);
    meta.push({ t: ` · ${comparison.gain.days} days sooner` });
    if (ref) meta.push(ref);
    metaTitle = `${comparison.gain.days} days sooner than the usual order (DVV first)`;
  } else if (comparison) {
    meta.push({ t: " · same order as usual" });
    metaTitle = "Your order matches the usual order (DVV first)";
  }

  return (
    <section aria-label="Your answer">
      {end ? (
        <h1>
          <span className="block text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">Set up by {fuzzy ? "about" : ""}</span>{" "}
          <span className="display num mt-1 block text-[64px] sm:text-[96px] xl:text-[112px]" style={{ lineHeight: 0.95, color: "#003580" }}>
            {longDate(end, startYear)}
          </span>
        </h1>
      ) : (
        <h1 className="display text-[46px] sm:text-[64px]">Your plan.</h1>
      )}
      <p className="mt-6 max-w-[58ch] text-[20px] leading-snug text-ink">
        <Prose segs={doc.letter.headline.slice(1)} />
      </p>
      <div className="mt-8">
        <TransitLine entries={entries} onOpen={onOpen} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="num text-[17px] font-semibold text-ink" title={metaTitle}>
          <Prose segs={meta} />
        </p>
        {icsUrl && (
          <a
            href={icsUrl}
            className="inline-flex items-center gap-2 rounded-[6px] bg-accent px-4 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <IconCalendar className="h-4 w-4" /> Add all to calendar
          </a>
        )}
      </div>
      <ExaLine state={state} onShowFeed={onShowFeed} />
      <HeadsUp insights={doc.letter.insights} onOpen={onOpen} />
    </section>
  );
}

/** One small line under the meta line: what Exa did in this run (cached runs keep the original numbers). */
function ExaLine({ state, onShowFeed }: { state: RunState; onShowFeed?: () => void }) {
  const line = state.summary ? exaLine(state.summary) : null;
  if (!line) return null;
  return (
    <p className="num mt-2 text-[14px] text-muted">
      {line}
      {onShowFeed && (
        <>
          {" · "}
          <button type="button" onClick={onShowFeed} className="underline decoration-rule-strong underline-offset-[3px] hover:text-accent hover:decoration-accent">
            see the activity
          </button>
        </>
      )}
    </p>
  );
}
