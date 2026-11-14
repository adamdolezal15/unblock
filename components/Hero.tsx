"use client";
import { useMemo } from "react";
import { countVisits } from "@/lib/graph/baseline";
import type { Comparison } from "@/lib/ui/compare";
import { buildDays } from "@/lib/ui/days";
import type { LetterDoc, Seg } from "@/lib/ui/letter";
import { longDate } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { Prose } from "./letter/LetterView";
import { TransitLine } from "./TransitLine";

/** The answer first: when you are set up, where to start, and the route as a transit line. */
export function Hero({ state, doc, comparison, onOpen }: { state: RunState; doc: LetterDoc; comparison: Comparison | null; onOpen: (id: string) => void }) {
  const entries = useMemo(() => buildDays(state, doc.ref), [state, doc]);
  const sched = state.schedule;
  if (!sched || !doc.letter) return null;
  const items = sched.schedule.items;
  const path = sched.criticalPath.stepIds;
  const last = path[path.length - 1];
  const end = last ? items[last]?.doneDate : undefined;
  const fuzzy = path.some((id) => items[id]?.estimated);
  const startYear = Number(sched.schedule.startDate.slice(0, 4));

  const steps = Object.values(state.steps).filter((s) => !s.milestone && !s.done && items[s.id]);
  const visits = countVisits(steps, items);
  const online = steps.filter((s) => s.mode !== "in_person").length;

  // The numbers as one plain sentence under the line, not a stats strip.
  const facts: Seg[] = [{ t: `${visits} ${visits === 1 ? "visit" : "visits"} in person, ${online} ${online === 1 ? "step" : "steps"} online.` }];
  if (comparison) {
    const ref = comparison.sentence.find((x) => "ref" in x);
    const caption = comparison.gain.caption === "sooner than the usual order" ? "sooner than the usual order (DVV first)" : comparison.gain.caption;
    facts.push({ t: ` ${comparison.gain.days} days ${caption}` });
    if (ref) facts.push(ref);
    facts.push({ t: "." });
  }

  return (
    <section aria-label="Your answer">
      <h1 className="display text-[46px] sm:text-[54px]">
        {end ? `Set up by ${fuzzy ? "about " : ""}${longDate(end, startYear)}.` : "Your plan."}
      </h1>
      <p className="mt-4 max-w-[58ch] text-[20px] leading-snug text-muted">
        <Prose segs={doc.letter.headline.slice(1)} />
      </p>
      <div className="mt-10">
        <TransitLine entries={entries} onOpen={onOpen} />
      </div>
      <p className="mt-5 text-[16px] text-muted">
        <Prose segs={facts} />
      </p>
    </section>
  );
}
