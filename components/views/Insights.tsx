"use client";
import type { Para } from "@/lib/ui/letter";
import { Prose } from "../letter/LetterView";

const LABEL: Record<string, string> = { shortcut: "Shortcut", money: "Money at stake", conflict: "Sources disagree" };

/** Up to three things to know, from run data only; each opens its evidence in the details drawer. */
export function Insights({ insights, onOpen }: { insights: Para[]; onOpen: (id: string) => void }) {
  if (!insights.length) return null;
  return (
    <section aria-labelledby="insights" className="mb-6 rounded-[8px] border border-rule bg-raised">
      <h2 id="insights" className="border-b border-rule px-5 py-3 font-serif text-[20px] font-semibold text-ink">
        {insights.length === 1 ? "One thing to know" : `${insights.length === 2 ? "Two" : "Three"} things to know`}
      </h2>
      <ol className="divide-y divide-rule">
        {insights.map((p) => (
          <li key={p.key} className="grid gap-x-5 gap-y-1 px-5 py-3.5 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:items-baseline">
            <span className={`text-[14px] font-semibold ${p.key === "conflict" ? "text-amber" : p.key === "shortcut" ? "text-accent" : "text-ink"}`}>{LABEL[p.key] ?? p.key}</span>
            <p className="text-[16px] leading-relaxed text-ink">
              <Prose segs={p.segs} />
            </p>
            {p.stepId && (
              <button
                type="button"
                onClick={() => onOpen(p.stepId!)}
                className="justify-self-start text-[15px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
              >
                {p.key === "conflict" ? "See why" : "Evidence"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
