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
import { RouteMark } from "./line/RouteMark";

/** The answer first, on the blue band: when you are set up, where to start, and the route as a timetable. */
export function Hero({ state, doc, comparison, onOpen, onShowFeed }: { state: RunState; doc: LetterDoc; comparison: Comparison | null; onOpen: (id: string) => void; onShowFeed?: () => void }) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  const sched = state.schedule;
  const fallback = fallbackSteps(state);
  if (fallback && (sched || state.phase === "done")) {
    return (
      <section aria-label="Your answer" className="relative">
        <RouteMark onBand top={14} />
        <h1 className="display text-[46px] sm:text-[64px]">Your {fallback.length} steps, in order.</h1>
        <p className="mt-4 max-w-[58ch] text-[20px] leading-snug text-white/85">
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

  // The numbers as one plain sentence under the line, not a stats strip.
  const facts: Seg[] = [{ t: `${visits} ${visits === 1 ? "visit" : "visits"} in person, ${online} ${online === 1 ? "step" : "steps"} online.` }];
  if (comparison?.gain) {
    const ref = comparison.sentence.find((x) => "ref" in x);
    facts.push({ t: ` ${comparison.gain.days} days sooner than the usual order (DVV first)` });
    if (ref) facts.push(ref);
    facts.push({ t: "." });
  } else if (comparison) {
    facts.push({ t: " Your order matches the usual order (DVV first)." });
  }

  return (
    <section aria-label="Your answer" className="relative">
      <RouteMark onBand top={14} />
      {end ? (
        <h1>
          <span className="block text-[22px] font-semibold leading-tight text-white/85 sm:text-[26px]">Set up by {fuzzy ? "about" : ""}</span>{" "}
          <span className="display num mt-1 block text-[64px] sm:text-[96px] xl:text-[112px]" style={{ lineHeight: 0.95 }}>
            {longDate(end, startYear)}
          </span>
        </h1>
      ) : (
        <h1 className="display text-[46px] sm:text-[64px]">Your plan.</h1>
      )}
      <p className="mt-6 max-w-[58ch] text-[20px] leading-snug text-white">
        <Prose segs={doc.letter.headline.slice(1)} />
      </p>
      <div className="mt-8">
        <TransitLine entries={entries} onOpen={onOpen} onBand />
      </div>
      <p className="mt-5 text-[16px] text-white/85">
        <Prose segs={facts} />
      </p>
      <ExaLine state={state} onShowFeed={onShowFeed} />
    </section>
  );
}

/** One quiet line: what Exa did in this run (cached runs keep the original numbers). */
function ExaLine({ state, onShowFeed }: { state: RunState; onShowFeed?: () => void }) {
  const line = state.summary ? exaLine(state.summary) : null;
  if (!line) return null;
  return (
    <p className="num mt-2 text-[14px] text-white/80">
      {line}
      {onShowFeed && (
        <>
          {" · "}
          <button type="button" onClick={onShowFeed} className="text-white underline decoration-white/50 underline-offset-[3px] hover:decoration-white">
            see the activity
          </button>
        </>
      )}
    </p>
  );
}
