"use client";
import type { Para } from "@/lib/ui/letter";
import { Prose } from "../letter/LetterView";

const LABEL: Record<string, string> = { shortcut: "Shortcut", money: "Money at stake", conflict: "Sources disagree" };

/** Up to three things to know, from run data only; each opens its evidence in the details drawer. */
export function Insights({ insights, onOpen }: { insights: Para[]; onOpen: (id: string) => void }) {
  if (!insights.length) return null;
  const bar: Record<string, string> = { shortcut: "border-l-accent", money: "border-l-ink", conflict: "border-l-amber-dot" };
  return (
    <section aria-label="What matters most" className="mb-10">
      <ol className="space-y-3">
        {insights.map((p) => (
          <li key={p.key} className={`border-l-[4px] pl-4 ${bar[p.key] ?? "border-l-rule-strong"}`}>
            <p className={`text-[15px] font-bold ${p.key === "conflict" ? "text-amber" : p.key === "shortcut" ? "text-accent" : "text-ink"}`}>{LABEL[p.key] ?? p.key}</p>
            <p className="mt-0.5 text-[17px] leading-relaxed text-ink">
              <Prose segs={p.segs} />{" "}
              {p.stepId && (
                <button
                  type="button"
                  onClick={() => onOpen(p.stepId!)}
                  className="text-[15px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
                >
                  {p.key === "conflict" ? "See why" : "Evidence"}
                </button>
              )}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
