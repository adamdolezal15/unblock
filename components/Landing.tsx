"use client";
import { PROMISE } from "./Header";
import { RunInput } from "./RunInput";
import { IconCheck } from "./icons";
import { useState } from "react";
import { mentions } from "@/lib/ui/mentions";
import { BrandStripe } from "./brand";
import { LineMark } from "./line/LineMark";

/** The first screen: name, one-line promise, the field, three examples. Nothing else. */
export function Landing({ runKey, value = "", onSubmit }: { runKey: number; value?: string; onSubmit: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  const m = mentions(draft);
  return (
    <div className="flex min-h-screen flex-col">
      <BrandStripe />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="-mt-[6vh] w-full max-w-[680px] text-center">
          <LineMark
            mode={draft.trim() ? "typing" : "idle"}
            lit={[m.citizenship, m.city, m.date, m.purpose]}
            className="mx-auto h-9 w-[284px]"
          />
          <h1 className="mt-8 text-[64px] font-bold leading-none tracking-[-0.02em] text-ink">Unblock</h1>
          <p className="mx-auto mt-4 max-w-[30ch] text-[23px] leading-snug text-muted">{PROMISE}</p>
          <div className="mt-10">
            <RunInput key={runKey} value={value} running={false} compact={false} onSubmit={onSubmit} onDraftChange={setDraft} />
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
