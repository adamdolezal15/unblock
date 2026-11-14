"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { DEMO_SENTENCES, type DemoKey } from "@/lib/demo/sentences";

export const EXAMPLES: { key: DemoKey; label: string; short: string }[] = [
  { key: "marta", label: "a Czech citizen moving to Helsinki for a job and a master's", short: "Czech, job and a master's in Helsinki" },
  { key: "brazil", label: "a Brazilian PhD student moving to Tampere with a spouse", short: "Brazilian PhD in Tampere" },
  { key: "india", label: "an Indian software engineer arriving next week", short: "Indian engineer, arriving next week" },
];

type Props = {
  /** The sentence of the current run; shown in the field. */
  value: string;
  running: boolean;
  /** Slim bar above results (true) vs. the landing page's hero field (false). */
  compact: boolean;
  onSubmit: (text: string) => void;
  /** Every keystroke (the landing page's logo reacts to what is typed). */
  onDraftChange?: (text: string) => void;
};

export function RunInput({ value, running, compact, onSubmit, onDraftChange }: Props) {
  // Local draft; the parent re-keys this component per run so it shows that run's sentence.
  const [draft, setDraftState] = useState(value);
  const setDraft = (t: string) => {
    setDraftState(t);
    onDraftChange?.(t);
  };
  // Auto-growing field: height follows the text, never a scrollbar.
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + (compact ? 2 : 0)}px`;
  }, [draft, compact]);
  const submit = (t: string) => {
    if (t.trim() && !running) onSubmit(t);
  };
  const pick = (key: DemoKey) => {
    setDraft(DEMO_SENTENCES[key]);
    submit(DEMO_SENTENCES[key]);
  };
  const textarea = (cls: string, placeholder: string) => (
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
      placeholder={placeholder}
      className={`min-w-0 flex-1 resize-none overflow-hidden text-ink placeholder:text-faint focus:outline-none ${cls}`}
    />
  );

  if (!compact) {
    return (
      <div className="w-full">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <label htmlFor="situation" className="sr-only">
            Describe your move in one sentence
          </label>
          <div className="flex items-end gap-2 rounded-[16px] border border-rule-strong bg-raised p-2 pl-5 text-left shadow-[0_1px_0_rgba(26,36,51,0.04),0_18px_40px_-18px_rgba(26,36,51,0.25)] transition-colors focus-within:border-accent">
            {textarea("self-center bg-transparent py-2.5 text-[19px] leading-7", "Where are you moving, when, and why?")}
            <button
              type="submit"
              disabled={running || !draft.trim()}
              className="inline-flex h-12 shrink-0 items-center rounded-[10px] bg-accent px-6 text-[16px] font-bold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-rule-strong"
            >
              Plan my move
            </button>
          </div>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[15px]">
          <span className="mr-1 text-muted">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.key}
              type="button"
              disabled={running}
              onClick={() => pick(ex.key)}
              title={DEMO_SENTENCES[ex.key]}
              className="rounded-[8px] px-2.5 py-1 text-ink underline decoration-rule-strong underline-offset-[5px] transition-colors hover:bg-sunk hover:decoration-accent disabled:opacity-50"
            >
              {ex.short}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] px-8 pb-2 pt-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor="situation" className="sr-only">
          Describe your move in one sentence
        </label>
        <div className="flex items-stretch gap-3">
          {textarea(
            "rounded-[5px] border border-rule-strong bg-raised px-4 py-2 text-[16px] leading-6 focus:border-accent",
            "e.g. I'm a Czech citizen moving to Helsinki on 1 December for a job, salary 3200 EUR",
          )}
          <button
            type="submit"
            disabled={running || !draft.trim()}
            className="inline-flex min-h-[42px] shrink-0 items-center justify-center self-stretch rounded-[5px] border border-accent bg-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:border-rule-strong disabled:bg-rule-strong"
          >
            {running ? "Planning…" : "Plan my move"}
          </button>
        </div>
      </form>
      <p className="mt-1.5 text-[14px] text-muted">
        Or try{" "}
        {EXAMPLES.map((ex, i) => (
          <span key={ex.key}>
            {i > 0 && (i === EXAMPLES.length - 1 ? " or " : ", ")}
            <button
              type="button"
              disabled={running}
              onClick={() => pick(ex.key)}
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
