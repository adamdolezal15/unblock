"use client";
// The one field of the first screen: an auto-growing sentence with the primary action inside, and three
// example moves. (Results have no field: "Edit your situation" brings you back here with your sentence.)
import { useLayoutEffect, useRef, useState } from "react";
import { DEMO_SENTENCES, type DemoKey } from "@/lib/demo/sentences";

export const EXAMPLES: { key: DemoKey; short: string }[] = [
  { key: "marta", short: "Czech, job and a master's in Helsinki" },
  { key: "brazil", short: "Brazilian PhD in Tampere" },
  { key: "india", short: "Indian engineer, arriving next week" },
];

type Props = {
  /** Sentence to start from (when coming back to edit). */
  value: string;
  running: boolean;
  onSubmit: (text: string) => void;
};

export function RunInput({ value, running, onSubmit }: Props) {
  const [draft, setDraft] = useState(value);
  // Height follows the text, never a scrollbar.
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  const submit = (t: string) => {
    if (t.trim() && !running) onSubmit(t);
  };
  const pick = (key: DemoKey) => {
    setDraft(DEMO_SENTENCES[key]);
    submit(DEMO_SENTENCES[key]);
  };

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
            placeholder="Where are you moving, when, and why?"
            className="min-w-0 flex-1 resize-none self-center overflow-hidden bg-transparent py-2.5 text-[19px] leading-7 text-ink placeholder:text-faint focus:outline-none"
          />
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
