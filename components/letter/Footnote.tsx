"use client";
import { useState } from "react";
import type { Ref } from "@/lib/ui/letter";
import { anchorOf, Popover, type Anchor } from "../Popover";
import { QuoteCard } from "./QuoteCard";

/** One source number as a solid blue circle; clicking it opens the verified quote behind the sentence. */
function FootnoteButton({ r, big }: { r: Ref; big: boolean }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
        aria-label={`Source ${r.n}: show the quote`}
        aria-expanded={!!anchor}
        className={`fn num ${big ? "fn-big" : ""} ${anchor ? "fn-open" : ""}`}
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

/** Adjacent source numbers as a tight group of circles, raised like a superscript, never split across lines. */
export function Footnotes({ refs, big = false }: { refs: Ref[]; big?: boolean }) {
  const unique = refs.filter((r, i) => refs.findIndex((x) => x.n === r.n) === i);
  return (
    <span className="fn-group">
      {unique.map((r, i) => (
        <FootnoteButton key={`${r.n}-${i}`} r={r} big={big} />
      ))}
    </span>
  );
}

/** A single source number. */
export function Footnote({ r, big = false }: { r: Ref; big?: boolean }) {
  return <Footnotes refs={[r]} big={big} />;
}
