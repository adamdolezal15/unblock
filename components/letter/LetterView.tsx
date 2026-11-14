"use client";
import type { Letter, Ref, Seg } from "@/lib/ui/letter";
import { Footnotes } from "./Footnote";

/** Text with footnotes; consecutive refs render as ¹,². */
export function Prose({ segs, big }: { segs: Seg[]; big?: boolean }) {
  const out: React.ReactNode[] = [];
  let refs: Ref[] = [];
  const flush = (k: number) => {
    if (refs.length) out.push(<Footnotes key={`r${k}`} refs={refs} big={big} />);
    refs = [];
  };
  segs.forEach((s, i) => {
    if ("ref" in s) refs.push(s.ref);
    else {
      flush(i);
      out.push(<span key={i}>{s.t}</span>);
    }
  });
  flush(segs.length);
  return <>{out}</>;
}

export function LetterView({ letter, onShow }: { letter: Letter; onShow: (stepId: string) => void }) {
  return (
    <div className="rise max-w-[680px]">
      <h1 className="font-serif text-[38px] font-semibold leading-[1.18] tracking-[-0.01em] text-ink">
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
      <p className="font-serif text-[38px] font-semibold leading-[1.18] text-faint">Working out your plan…</p>
      <div className="mt-6 space-y-3">
        {[100, 94, 97, 60].map((w, i) => (
          <div key={i} className="skeleton h-[18px] rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
