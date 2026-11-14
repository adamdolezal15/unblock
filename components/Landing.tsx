"use client";
import { PROMISE } from "./Header";
import { RunInput } from "./RunInput";
import { IconCheck } from "./icons";
import { BrandStripe } from "./brand";
import { LineMark } from "./line/LineMark";

/** The first screen: name, one-line promise, the field, three examples. Nothing else. */
export function Landing({ runKey, value = "", onSubmit }: { runKey: number; value?: string; onSubmit: (text: string) => void }) {
  return (
    <div className="flex min-h-screen flex-col">
      <BrandStripe />
      <main className="flex flex-1 items-center justify-center overflow-x-clip px-6 py-16">
        <div className="-mt-[6vh] w-full max-w-[680px] text-center">
          <LineMark className="mx-auto h-9 w-[284px]" />
          <h1 className="display mt-8 text-[64px]">Unblock</h1>
          <p className="mx-auto mt-4 max-w-[30ch] text-[23px] leading-snug text-muted">{PROMISE}</p>
          <div className="mt-10">
            <RunInput key={runKey} value={value} running={false} onSubmit={onSubmit} line />
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
