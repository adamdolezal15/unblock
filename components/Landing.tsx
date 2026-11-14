"use client";
import { PROMISE } from "./Header";
import { RunInput } from "./RunInput";
import { IconCheck } from "./icons";

/** A small route: offices as stops, an "either one" diamond, the last leg in the critical-path blue. */
function RouteMark() {
  return (
    <svg viewBox="0 0 220 28" className="mx-auto h-7 w-[220px]" aria-hidden>
      <line x1="10" y1="14" x2="166" y2="14" stroke="#c4bdb0" strokeWidth="1.5" strokeDasharray="0" />
      <line x1="166" y1="14" x2="208" y2="14" stroke="#003580" strokeWidth="3" strokeLinecap="round" />
      <circle cx="10" cy="14" r="4.5" fill="#16181d" />
      <circle cx="58" cy="14" r="4.5" fill="#16181d" />
      <rect x="99" y="7" width="14" height="14" transform="rotate(45 106 14)" fill="#f7f5f0" stroke="#16181d" strokeWidth="1.5" />
      <circle cx="160" cy="14" r="4.5" fill="#16181d" />
      <circle cx="208" cy="14" r="7" fill="#003580" />
      <path d="M204.5 14.2l2.4 2.4 4.6-4.8" fill="none" stroke="#f7f5f0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The first screen: name, one-line promise, the field, three examples. Nothing else. */
export function Landing({ runKey, onSubmit }: { runKey: number; onSubmit: (text: string) => void }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="-mt-[6vh] w-full max-w-[680px] text-center">
          <RouteMark />
          <h1 className="mt-8 font-serif text-[64px] font-semibold leading-none tracking-[-0.02em] text-ink">Unblock</h1>
          <p className="mx-auto mt-4 max-w-[30ch] font-serif text-[23px] leading-snug text-muted">{PROMISE}</p>
          <div className="mt-10">
            <RunInput key={runKey} value="" running={false} compact={false} onSubmit={onSubmit} />
          </div>
        </div>
      </main>
      <footer className="flex items-center justify-center gap-2 px-6 pb-8 text-[15px] text-muted">
        <IconCheck className="h-4 w-4 text-done" />
        Every claim links to the sentence on the page it came from.
      </footer>
    </div>
  );
}
