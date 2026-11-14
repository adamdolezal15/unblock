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

/** Euro amounts in bold ("€1,200", "1 200 €", "300 EUR"); the rest as written. */
const EURO = /(€\s?\d(?:[\d\s,.]*\d)?|\d(?:[\d\s,.]*\d)?\s?(?:€|EUR\b|euros?\b))/g;
function Money({ text }: { text: string }) {
  return <>{text.split(EURO).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : part))}</>;
}

/**
 * "Heads up": money at stake and disagreeing sources in one quiet white card, one plain sentence each. The full
 * paragraphs, their source numbers and the evidence links (plus the shortcut paragraph) open on click.
 */
export function HeadsUp({ insights, onOpen }: { insights: Para[]; onOpen: (id: string) => void }) {
  const short = insights.filter((p) => p.key === "money" || p.key === "conflict");
  if (!short.length) return null;
  return (
    <section aria-label="Heads up" className="mt-12 max-w-[680px] rounded-[12px] border border-hairline bg-surface px-6 py-4">
      <h2 className="text-[15px] font-semibold text-ink">Heads up</h2>
      <ul className="mt-2 space-y-2 text-[17px] leading-normal text-ink">
        {short.map((p) => (
          <li key={p.key} className="flex gap-2">
            {p.key === "conflict" && <span className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-amber" aria-label="Sources disagree:" />}
            <span>{p.key === "money" ? <Money text={firstSentence(plain(p))} /> : firstSentence(plain(p))}</span>
          </li>
        ))}
      </ul>
      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none justify-end text-[15px] [&::-webkit-details-marker]:hidden">
          <span className="link group-open:hidden">Show the evidence</span>
          <span className="link hidden group-open:inline">Hide the evidence</span>
        </summary>
        <ol className="mt-4 space-y-4 border-t border-hairline pt-4">
          {insights.map((p) => (
            <li key={p.key}>
              <p className={`text-[15px] font-semibold ${p.key === "conflict" ? "text-amber" : "text-ink"}`}>{LABEL[p.key] ?? p.key}</p>
              <p className="mt-1 text-[17px] leading-normal text-ink">
                <Prose segs={p.segs} />{" "}
                {p.stepId && (
                  <button type="button" onClick={() => onOpen(p.stepId!)} className="text-[15px] link">
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
