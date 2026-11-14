"use client";
import { useState } from "react";
import type { Ref } from "@/lib/ui/letter";
import { anchorOf, Popover, type Anchor } from "../Popover";
import { QuoteCard } from "./QuoteCard";

/** One source number as a button; clicking it opens the verified quote behind the sentence. */
function FootnoteButton({ r, big }: { r: Ref; big: boolean }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
        aria-label={`Source ${r.n}: show the quote`}
        aria-expanded={!!anchor}
        className={`num rounded-[3px] px-[1px] font-sans font-semibold text-accent hover:bg-accent-soft hover:underline ${big ? "text-[18px]" : "text-[14px]"} ${anchor ? "bg-accent-soft" : ""}`}
      >
        {r.n}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} label={`Source ${r.n}`}>
          <QuoteCard citation={r.citation} n={r.n} />
        </Popover>
      )}
    </>
  );
}

/** Adjacent source numbers as one tight superscript: ⁵,⁶ (no spaces, never split across lines). */
export function Footnotes({ refs, big = false }: { refs: Ref[]; big?: boolean }) {
  const unique = refs.filter((r, i) => refs.findIndex((x) => x.n === r.n) === i);
  return (
    <sup className="ml-[1px] whitespace-nowrap" style={{ lineHeight: 0, verticalAlign: "super", position: "static" }}>
      {unique.map((r, i) => (
        <span key={`${r.n}-${i}`}>
          {i > 0 && <span className={`font-sans text-muted ${big ? "text-[18px]" : "text-[14px]"}`}>,</span>}
          <FootnoteButton r={r} big={big} />
        </span>
      ))}
    </sup>
  );
}

/** A single source number. */
export function Footnote({ r, big = false }: { r: Ref; big?: boolean }) {
  return <Footnotes refs={[r]} big={big} />;
}
