"use client";
// The one field of the first screen: an auto-growing sentence with the primary action inside, and three
// example moves. (Results have no field: "Edit your situation" brings you back here with your sentence.)
// The examples open the saved demos (/?demo=<key>), never a live run. When the server refuses a live run
// (LIVE_PASSCODE on the deployment), a small Passcode field appears with links to the demos.
import { useLayoutEffect, useRef, useState } from "react";
import { DEMO_SENTENCES, type DemoKey } from "@/lib/demo/sentences";

export const EXAMPLES: { key: DemoKey; short: string }[] = [
  { key: "marta", short: "Czech, job and a master's in Helsinki" },
  { key: "brazil", short: "Brazilian PhD in Tampere" },
  { key: "india", short: "Indian engineer, arriving next week" },
];

/** Where an example chip goes: the saved demo, replayed from demo-cache/ (no passcode, no live calls). */
export const demoHref = (key: DemoKey) => `/?demo=${key}`;

type Props = {
  /** Sentence to start from (when coming back to edit). */
  value: string;
  running: boolean;
  /** Set when a live run needs the passcode: the message to show above the demo links. */
  locked?: string;
  onSubmit: (text: string, passcode?: string) => void;
};

export function RunInput({ value, running, locked, onSubmit }: Props) {
  const [draft, setDraft] = useState(value);
  const [passcode, setPasscode] = useState("");
  // Height follows the text, never a scrollbar.
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  const submit = (t: string) => {
    if (t.trim() && !running) onSubmit(t, locked ? passcode : undefined);
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
        <div className="flex items-center gap-2 rounded-[16px] border border-rule-strong bg-raised p-2 pl-4 text-left shadow-[0_1px_0_rgba(27,35,48,0.04),0_18px_40px_-18px_rgba(27,35,48,0.25)] transition-colors focus-within:border-accent">
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
            className="min-w-0 flex-1 resize-none overflow-hidden border-0 shadow-none bg-transparent py-2 text-[17px] leading-7 text-ink placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={running || !draft.trim()}
            className="btn-primary shrink-0 px-6 text-[17px] disabled:cursor-not-allowed disabled:bg-rule-strong"
          >
            Plan my move
          </button>
        </div>
        {locked && (
          <div className="mt-3 flex items-center justify-center gap-2 text-[15px]">
            <label htmlFor="passcode" className="text-muted">
              Passcode
            </label>
            <input
              id="passcode"
              type="password"
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-40 rounded-[8px] border border-rule-strong bg-raised px-3 py-1 text-ink focus:border-accent"
            />
          </div>
        )}
      </form>
      {locked && (
        <p role="status" className="mt-4 text-[15px] text-ink">
          {locked}{" "}
          {EXAMPLES.map((ex, i) => (
            <span key={ex.key}>
              {i > 0 && <span aria-hidden className="mx-2 inline-block text-muted">·</span>}
              <a href={demoHref(ex.key)} className="link">
                {ex.short}
              </a>
            </span>
          ))}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[15px]">
        <span className="mr-1 text-muted">Try</span>
        {EXAMPLES.map((ex) => (
          // A full page load on purpose: /?demo=<key> starts the saved demo (read-only result page).
          <a key={ex.key} href={demoHref(ex.key)} title={DEMO_SENTENCES[ex.key]} className="inline-block rounded-[8px] px-2 py-1 link">
            {ex.short}
          </a>
        ))}
      </div>
    </div>
  );
}
