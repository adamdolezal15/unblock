"use client";
import { useState } from "react";
import { DEMO_SENTENCES, type DemoKey } from "@/lib/demo/sentences";

export const EXAMPLES: { key: DemoKey; label: string }[] = [
  { key: "marta", label: "Marta: Czech, job + master's in Helsinki" },
  { key: "brazil", label: "Brazilian PhD in Tampere" },
  { key: "india", label: "Indian engineer in Helsinki" },
];

type Props = {
  /** The sentence of the current run; the field shows it while compact. */
  value: string;
  running: boolean;
  /** Large first-screen version vs. the slim bar above results. */
  compact: boolean;
  onSubmit: (text: string) => void;
};

export function RunInput({ value, running, compact, onSubmit }: Props) {
  // Local draft; re-keyed by the parent when a new run starts so it shows that run's sentence.
  const [draft, setDraft] = useState(value);
  const submit = (t: string) => {
    if (t.trim() && !running) onSubmit(t);
  };

  return (
    <div className={compact ? "px-6 py-3" : "mx-auto w-full max-w-3xl px-6 pt-14"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor="situation" className={compact ? "sr-only" : "mb-3 block text-[17px] font-medium text-ink"}>
          Describe your move in one sentence
        </label>
        <div className="flex items-stretch gap-3">
          <textarea
            id="situation"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            rows={compact ? 1 : 2}
            maxLength={2000}
            placeholder="e.g. I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR"
            className={`min-w-0 flex-1 resize-none rounded-md border border-rule-strong bg-raised px-4 text-ink placeholder:text-faint focus:border-accent focus:outline-none ${
              compact ? "py-2 text-[16px] leading-6" : "py-3 text-[20px] leading-8"
            }`}
          />
          <button
            type="submit"
            disabled={running || !draft.trim()}
            className={`shrink-0 rounded-md bg-accent px-5 font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-rule-strong ${
              compact ? "text-[15px]" : "text-[17px]"
            }`}
          >
            {running ? "Planning…" : "Plan my move"}
          </button>
        </div>
      </form>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-2" : "mt-4"}`}>
        <span className="text-[14px] text-muted">{compact ? "Examples:" : "Or try one:"}</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.key}
            type="button"
            disabled={running}
            onClick={() => {
              setDraft(DEMO_SENTENCES[ex.key]);
              submit(DEMO_SENTENCES[ex.key]);
            }}
            title={DEMO_SENTENCES[ex.key]}
            className="rounded-full border border-rule-strong bg-raised px-3 py-1 text-[14px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
