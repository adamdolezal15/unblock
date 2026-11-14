"use client";
import type { Letter, Ref, Seg } from "@/lib/ui/letter";
import { Footnotes } from "./Footnote";

/**
 * Text with footnotes. Consecutive refs render as one tight superscript (⁵,⁶), and the word before
 * them is glued to the numbers so a number never wraps onto a line by itself.
 */
export function Prose({ segs, big }: { segs: Seg[]; big?: boolean }) {
  // Group into runs: text followed by the refs that directly follow it.
  const runs: { t: string; refs: Ref[] }[] = [];
  for (const s of segs) {
    if ("ref" in s) {
      if (!runs.length) runs.push({ t: "", refs: [] });
      runs[runs.length - 1].refs.push(s.ref);
    } else runs.push({ t: s.t, refs: [] });
  }
  return (
    <>
      {runs.map((run, i) => {
        if (!run.refs.length) return <span key={i}>{run.t}</span>;
        // Footnotes attach to the text before them: no space between the last word and the number.
        const text = run.t.replace(/\s+$/, "");
        const cut = text.search(/\S+$/);
        const head = cut > 0 ? text.slice(0, cut) : "";
        const tail = cut >= 0 ? text.slice(cut) : text;
        return (
          <span key={i}>
            {head}
            <span className="whitespace-nowrap">
              {tail}
              <Footnotes refs={run.refs} big={big} />
            </span>
          </span>
        );
      })}
    </>
  );
}

export function LetterView({ letter, onShow }: { letter: Letter; onShow: (stepId: string) => void }) {
  return (
    <div className="rise max-w-[680px]">
      <h1 className="text-[38px] font-bold leading-[1.18] tracking-[-0.01em] text-ink">
        <Prose segs={letter.headline} big />
      </h1>
      <div className="mt-6 space-y-4 text-[18px] leading-[1.65] text-ink">
        {letter.paras.map((p) => (
          <p key={p.key}>
            <Prose segs={p.segs} />
            {p.stepId && (
              <>
                {" "}
                <button type="button" onClick={() => onShow(p.stepId!)} className="text-[16px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
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
      <p className="text-[38px] font-bold leading-[1.18] text-faint">Working out your plan…</p>
      <div className="mt-6 space-y-3">
        {[100, 94, 97, 60].map((w, i) => (
          <div key={i} className="skeleton h-[18px] rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
