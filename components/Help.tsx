"use client";
import { useState } from "react";
import { TERMS, type Term } from "@/lib/ui/glossary";
import { anchorOf, Popover, type Anchor } from "./Popover";

/** A small "?" that opens a one-sentence explanation in an opaque popover. */
export function Help({ term }: { term: Term }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const t = TERMS[term];
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(anchor ? null : anchorOf(e.currentTarget));
        }}
        aria-label={`What does "${t.short}" mean?`}
        aria-expanded={!!anchor}
        className="ml-1 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-rule-strong align-[1px] text-[13px] font-semibold leading-none text-muted hover:border-ink hover:text-ink"
      >
        ?
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} label={t.short} width={340}>
          <p className="text-[16px] font-semibold text-ink">{t.short}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-ink">{t.help}</p>
        </Popover>
      )}
    </>
  );
}

/** A plain label followed by its "?". */
export function Term({ term, long = false }: { term: Term; long?: boolean }) {
  return (
    <span className="inline-flex items-center">
      {long ? TERMS[term].label : TERMS[term].short}
      <Help term={term} />
    </span>
  );
}
