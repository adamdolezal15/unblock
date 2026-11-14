"use client";
import { useState } from "react";
import type { Ref } from "@/lib/ui/letter";
import { anchorOf, Popover, type Anchor } from "../Popover";
import { QuoteCard } from "./QuoteCard";

/** Superscript source number. Clicking it opens the verified quote behind the sentence. */
export function Footnote({ r, big = false }: { r: Ref; big?: boolean }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return (
    <>
      <sup className="ml-[1px] align-super leading-none">
        <button
          type="button"
          onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
          aria-label={`Source ${r.n}: show the quote`}
          aria-expanded={!!anchor}
          className={`num rounded-[3px] px-[2px] font-sans font-semibold text-accent hover:bg-accent-soft hover:underline ${big ? "text-[18px]" : "text-[14px]"} ${anchor ? "bg-accent-soft" : ""}`}
        >
          {r.n}
        </button>
      </sup>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} label={`Source ${r.n}`}>
          <QuoteCard citation={r.citation} n={r.n} />
        </Popover>
      )}
    </>
  );
}

/** Several refs in a row: ¹,² */
export function Footnotes({ refs, big }: { refs: Ref[]; big?: boolean }) {
  return (
    <>
      {refs.map((r, i) => (
        <span key={`${r.n}-${i}`}>
          {i > 0 && <sup className={`text-muted ${big ? "text-[18px]" : "text-[14px]"}`}>,</sup>}
          <Footnote r={r} big={big} />
        </span>
      ))}
    </>
  );
}
