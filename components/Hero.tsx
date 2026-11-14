"use client";
import { countVisits } from "@/lib/graph/baseline";
import type { Comparison } from "@/lib/ui/compare";
import type { LetterDoc } from "@/lib/ui/letter";
import { longDate } from "@/lib/ui/letter";
import type { RunState } from "@/lib/ui/runState";
import { Prose } from "./letter/LetterView";

type Tile = { value: string; caption: React.ReactNode; strong?: boolean; title?: string };

/** The answer first: when you are set up, where to start, and the few numbers that matter. */
export function Hero({ state, doc, comparison }: { state: RunState; doc: LetterDoc; comparison: Comparison | null }) {
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

  const tiles: Tile[] = [
    { value: String(visits), caption: visits === 1 ? "visit in person" : "visits in person" },
    { value: String(online), caption: online === 1 ? "step you can do online" : "steps you can do online" },
  ];
  if (comparison) {
    tiles.push({
      value: `${comparison.gain.days} days`,
      caption: comparison.gain.caption,
      strong: true,
      title: comparison.sentence.map((x) => ("t" in x ? x.t : "")).join(""),
    });
  }
  if (state.summary) tiles.push({ value: String(state.summary.verifiedQuotes), caption: "quotes checked word for word" });

  return (
    <section className="rise text-center" aria-label="Your answer">
      <h1 className="font-serif text-[44px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink">
        {end ? (
          <>
            Set up by {fuzzy ? "about " : ""}
            <span className="text-accent">{longDate(end, startYear)}</span>
          </>
        ) : (
          "Your plan"
        )}
      </h1>
      <p className="mx-auto mt-3 max-w-[38ch] font-serif text-[20px] leading-snug text-muted">
        <Prose segs={doc.letter.headline.slice(1)} />
      </p>
      {/* One quiet strip of numbers: small serif figures, hairline dividers. */}
      <ul className="mx-auto mt-8 inline-grid grid-flow-col divide-x divide-rule rounded-[12px] border border-rule bg-raised">
        {tiles.map((t, i) => (
          <li key={i} title={t.title} className="px-6 py-3 text-left">
            <p className={`num font-serif text-[26px] font-semibold leading-none ${t.strong ? "text-accent" : "text-ink"}`}>{t.value}</p>
            <p className="mt-1 max-w-[13ch] text-[14px] leading-tight text-muted">{t.caption}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
