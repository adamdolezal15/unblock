"use client";
import { PROMISE } from "./Header";
import { RunInput } from "./RunInput";
import { IconCheck } from "./icons";
import { BrandStripe } from "./brand";
import { LineMark } from "./line/LineMark";
import { Contours } from "./motion/Contours";

/** The first screen: name, one-line promise, the field, three examples. Nothing else. */
export function Landing({ runKey, value = "", locked, onSubmit }: { runKey: number; value?: string; locked?: string; onSubmit: (text: string, passcode?: string) => void }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Contours variant="hero" />
      <BrandStripe />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="-mt-[6vh] w-full max-w-[680px] text-center">
          <LineMark className="mx-auto h-9 w-[284px]" />
          <h1 className="display mt-8 text-[56px]">Unblock</h1>
          <p className="mx-auto mt-4 max-w-[40ch] text-[20px] leading-normal text-muted">{PROMISE}</p>
          <div className="mt-10">
            <RunInput key={runKey} value={value} running={false} locked={locked} onSubmit={onSubmit} />
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
