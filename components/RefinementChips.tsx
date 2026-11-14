"use client";
import { REFINE_CHIP, type RefineKey } from "@/lib/refine/refine";

/**
 * One small chip per active "Make it more accurate" answer, right under the profile sentence, so an answer kept
 * in the URL (?r=has_code) is never invisible: "Using your answer: you already have an ID code · Undo".
 * Undo removes that answer from the URL and the plan re-plans on the spot.
 */
export function RefinementChips({ answers, onChange }: { answers: readonly RefineKey[]; onChange: (keys: RefineKey[]) => void }) {
  if (!answers.length) return null;
  return (
    <ul aria-label="Answers used in this plan" className="mt-3 flex flex-wrap gap-2">
      {answers.map((k) => (
        <li key={k} className="inline-flex items-center rounded-full border border-rule-strong bg-sunk px-3 py-1 text-[14px] leading-5 text-ink">
          <span>Using your answer: {REFINE_CHIP[k]}</span>
          <span aria-hidden className="mx-2 text-muted">·</span>
          <button
            type="button"
            onClick={() => onChange(answers.filter((x) => x !== k))}
            aria-label={`Undo: ${REFINE_CHIP[k]}`}
            className="font-semibold text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
          >
            Undo
          </button>
        </li>
      ))}
    </ul>
  );
}
