"use client";
import type { Letter, Ref, Seg } from "@/lib/ui/letter";
import { Footnotes } from "./Footnote";

/**
 * A sentence or paragraph with at most ONE source number, at its end. The text reads uninterrupted; the
 * first source cited in it is the number (the details panel lists every source). The last word is glued
 * to the number so it never wraps onto a line by itself.
 */
export function Prose({ segs, big }: { segs: Seg[]; big?: boolean }) {
  const text = segs
    .map((s) => ("t" in s ? s.t : ""))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:;!?])/g, "$1")
    .trim();
  const ref = segs.find((s): s is { ref: Ref } => "ref" in s)?.ref;
  if (!ref) return <>{text}</>;
  // The number closes the sentence: after its last word and punctuation.
  const m = text.match(/^([\s\S]*?)(\S+)$/);
  const head = m ? m[1] : "";
  const word = m ? m[2] : text;
  return (
    <>
      {head}
      <span className="whitespace-nowrap">
        {word}
        <Footnotes refs={[ref]} big={big} />
      </span>
    </>
  );
}

export function LetterView({ letter, onShow, headline = true }: { letter: Letter; onShow: (stepId: string) => void; headline?: boolean }) {
  return (
    <div className="max-w-[680px]">
      {headline && (
        <h1 className="display text-[28px]">
          <Prose segs={letter.headline} big />
        </h1>
      )}
      <div className={`${headline ? "mt-6" : ""} space-y-4 text-[17px] leading-normal text-ink`}>
        {letter.paras.map((p) => (
          <p key={p.key}>
            <Prose segs={p.segs} />
            {p.stepId && (
              <>
                {" "}
                <button type="button" onClick={() => onShow(p.stepId!)} className="text-[17px] link">
                  Details
                </button>
              </>
            )}
          </p>
        ))}
      </div>
    </div>
  );
}

export function LetterSkeleton() {
  return (
    <div aria-hidden>
      <p className="text-[28px] font-bold leading-[1.2] text-faint">Working out your plan…</p>
      <div className="mt-6 space-y-3">
        {[100, 94, 97, 60].map((w, i) => (
          <div key={i} className="skeleton h-[18px] rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
