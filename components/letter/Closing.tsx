"use client";
import { useState } from "react";
import type { DropReason, RunSummary } from "@/lib/types";
import { domainOf, fmtSeconds, plural } from "@/lib/ui/format";
import { anchorOf, Popover, type Anchor } from "../Popover";

const REASON: Record<DropReason, string> = {
  quote_not_found: "The quote is not on the page",
  url_not_allowed: "The source is not on the allowed list",
  page_unavailable: "The page could not be read",
  unknown_step_id: "It refers to an unknown step",
  invalid_value: "The value could not be read",
  too_short: "The quote is too short to prove anything",
  merged_sentences: "The quote was stitched from separate sentences",
  value_not_in_quote: "The quote does not state the value",
  not_own_step: "The quote is about another step",
};

/** The stats as one plain sentence at the end of the letter. "rejected N claims" opens the list. */
export function Closing({ summary }: { summary: RunSummary }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const sources = Object.values(summary.sourcesByTrust).reduce((a, b) => a + b, 0);
  return (
    <p className="text-[16px] leading-[1.65] text-muted">
      That&apos;s {plural(summary.steps, "step")} and {plural(summary.inPersonVisits, "visit")}. I checked {summary.verifiedQuotes} quotes word for word against{" "}
      {plural(sources, "source")}
      {summary.droppedClaims > 0 ? (
        <>
          {" "}
          and{" "}
          <button
            type="button"
            onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
            aria-expanded={!!anchor}
            className="text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
          >
            rejected {plural(summary.droppedClaims, "claim")}
          </button>{" "}
          that didn&apos;t hold up
        </>
      ) : null}
      .{summary.notFound > 0 && <> I couldn&apos;t confirm {plural(summary.notFound, "step")} from any source; they are listed under the map.</>}{" "}
      {summary.partial ? "I stopped early, so this is a partial plan." : `It took ${fmtSeconds(summary.totalMs)}.`}
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} label="Rejected claims" width={560}>
          <h3 className="text-[20px] font-bold text-ink">Claims I threw away</h3>
          <p className="mt-1 text-[15px] text-muted">
            The extractor proposed these, but the quote did not hold up against the page text. None of them is used in your plan.
          </p>
          <ul className="mt-3 divide-y divide-rule">
            {summary.rejected.map((r, i) => (
              <li key={i} className="py-3">
                <p className="text-[15px] font-semibold text-ink">{REASON[r.reason] ?? r.reason}</p>
                <p className="mt-1 font-serif text-[16px] italic leading-snug text-muted">“{r.quote}”</p>
                <p className="mt-1 text-[14px] text-muted">
                  {r.stepId.replace(/_/g, " ")}, {r.kind.replace(/_/g, " ")},{" "}
                  <a href={r.url} target="_blank" rel="noreferrer" className="underline decoration-rule-strong underline-offset-2 hover:text-ink">
                    {domainOf(r.url)}
                  </a>
                </p>
              </li>
            ))}
            {summary.droppedClaims > summary.rejected.length && <li className="py-3 text-[14px] text-muted">And {summary.droppedClaims - summary.rejected.length} more.</li>}
          </ul>
        </Popover>
      )}
    </p>
  );
}
