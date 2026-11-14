"use client";
import type { Para } from "@/lib/ui/letter";
import { Prose } from "../letter/LetterView";

const LABEL: Record<string, string> = { shortcut: "Shortcut", money: "Money at stake", conflict: "Sources disagree" };

const plain = (p: Para) =>
  p.segs
    .map((s) => ("t" in s ? s.t : ""))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:;!?])/g, "$1")
    .trim();
/** The first sentence only: the full paragraph and its evidence are one click away. */
const firstSentence = (s: string) => s.match(/^.*?[.!?](?=\s+[A-Z€0-9]|$)/)?.[0] ?? s;

/**
 * "Heads up": money at stake and disagreeing sources as one quiet block, one plain sentence each. The full
 * paragraphs, their source numbers and the evidence links (plus the shortcut paragraph) open on click.
 */
export function HeadsUp({ insights, onOpen }: { insights: Para[]; onOpen: (id: string) => void }) {
  const short = insights.filter((p) => p.key === "money" || p.key === "conflict");
  if (!short.length) return null;
  return (
    <section aria-label="Heads up" className="mt-8 max-w-[62ch] border-l-2 border-rule-strong pl-4">
      <h2 className="text-[15px] font-bold text-ink">Heads up</h2>
      <ul className="mt-1 space-y-1 text-[16px] leading-snug text-ink">
        {short.map((p) => (
          <li key={p.key}>
            {p.key === "conflict" && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-dot align-middle" aria-label="Sources disagree:" />}
            {firstSentence(plain(p))}
          </li>
        ))}
      </ul>
      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-[14px] text-muted underline decoration-rule-strong underline-offset-[3px] hover:text-accent">
          <span className="group-open:hidden">Show the evidence</span>
          <span className="hidden group-open:inline">Hide the evidence</span>
        </summary>
        <ol className="mt-3 space-y-3">
          {insights.map((p) => (
            <li key={p.key}>
              <p className={`text-[14px] font-bold ${p.key === "conflict" ? "text-amber" : "text-ink"}`}>{LABEL[p.key] ?? p.key}</p>
              <p className="mt-0.5 text-[16px] leading-relaxed text-ink">
                <Prose segs={p.segs} />{" "}
                {p.stepId && (
                  <button
                    type="button"
                    onClick={() => onOpen(p.stepId!)}
                    className="text-[14px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
                  >
                    {p.key === "conflict" ? "See why" : "Evidence"}
                  </button>
                )}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
