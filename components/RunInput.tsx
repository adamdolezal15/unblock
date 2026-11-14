"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { DEMO_SENTENCES, type DemoKey } from "@/lib/demo/sentences";

export const EXAMPLES: { key: DemoKey; label: string }[] = [
  { key: "marta", label: "a Czech citizen moving to Helsinki for a job and a master's" },
  { key: "brazil", label: "a Brazilian PhD student moving to Tampere with a spouse" },
  { key: "india", label: "an Indian software engineer arriving next week" },
];

type Props = {
  /** The sentence of the current run; shown in the field. */
  value: string;
  running: boolean;
  /** Large landing version vs. the slim bar above results. */
  compact: boolean;
  onSubmit: (text: string) => void;
};

export function RunInput({ value, running, compact, onSubmit }: Props) {
  // Local draft; the parent re-keys this component per run so it shows that run's sentence.
  const [draft, setDraft] = useState(value);
  // Auto-growing field: height follows the text, never a scrollbar.
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, compact]);
  const submit = (t: string) => {
    if (t.trim() && !running) onSubmit(t);
  };

  return (
    <div className={compact ? "max-w-[1000px] px-8 pb-2 pt-2" : ""}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor="situation" className={compact ? "sr-only" : "mb-2 block text-[17px] font-semibold text-ink"}>
          Describe your move in one sentence
        </label>
        <div className="flex items-stretch gap-3">
          <textarea
            ref={field}
            id="situation"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="e.g. I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR"
            className={`min-w-0 flex-1 resize-none overflow-hidden rounded-[5px] border border-rule-strong bg-raised px-4 text-ink placeholder:text-faint focus:border-accent focus:outline-none ${
              compact ? "py-2 text-[16px] leading-6" : "py-3 text-[19px] leading-8"
            }`}
          />
          <button
            type="submit"
            disabled={running || !draft.trim()}
            className={`inline-flex min-h-[42px] shrink-0 items-center justify-center self-stretch rounded-[5px] border border-accent bg-accent px-6 font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-rule-strong disabled:bg-rule-strong ${
              compact ? "text-[15px]" : "text-[17px]"
            }`}
          >
            {running ? "Planning…" : "Plan my move"}
          </button>
        </div>
      </form>
      <p className={`text-muted ${compact ? "mt-1.5 text-[14px]" : "mt-4 text-[16px] leading-relaxed"}`}>
        Or try {EXAMPLES.map((ex, i) => (
          <span key={ex.key}>
            {i > 0 && (i === EXAMPLES.length - 1 ? " or " : ", ")}
            <button
              type="button"
              disabled={running}
              onClick={() => {
                setDraft(DEMO_SENTENCES[ex.key]);
                submit(DEMO_SENTENCES[ex.key]);
              }}
              title={DEMO_SENTENCES[ex.key]}
              className="text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent disabled:opacity-50"
            >
              {ex.label}
            </button>
          </span>
        ))}
        .
      </p>
    </div>
  );
}
