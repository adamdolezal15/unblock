"use client";
import { useState } from "react";
import type { DropReason, RunSummary } from "@/lib/types";
import { say, type PlanNumbers } from "@/lib/ui/counts";
import { domainOf, plural } from "@/lib/ui/format";
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

/**
 * The stats as one plain sentence at the end of the letter, in the shared wording (lib/ui/counts).
 * "N claims dropped" opens the list. A replay names the original live run's time; unknown -> no time.
 */
export function Closing({ summary, numbers: n }: { summary: RunSummary; numbers: PlanNumbers }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const replayed = summary.calls.exaLive + summary.calls.llmLive === 0;
  const dropped = n.dropped ?? 0;
  return (
    <p className="text-[17px] leading-normal text-muted">
      That&apos;s {say.steps(n.steps)} and {say.visits(n.visits)}, from {say.quotes(n.quotes ?? 0)} in {say.sources(n.sources ?? 0)}, each checked word for word
      {dropped > 0 ? (
        <>
          ;{" "}
          <button
            type="button"
            onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
            aria-expanded={!!anchor}
            className="link"
          >
            {say.dropped(dropped)}
          </button>{" "}
          because they didn&apos;t hold up
        </>
      ) : null}
      .{summary.notFound > 0 && <> I couldn&apos;t confirm {plural(summary.notFound, "step")} from any source; they are listed under the map.</>}{" "}
      {summary.partial
        ? "I stopped early, so this is a partial plan."
        : n.durationMs !== null
          ? replayed
            ? `The live run took ${say.duration(n.durationMs)}.`
            : `It took ${say.duration(n.durationMs)}.`
          : null}
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
                <p className="mt-1 font-serif text-[17px] italic leading-snug text-muted">“{r.quote}”</p>
                <p className="mt-1 text-[13px] text-muted">
                  {r.stepId.replace(/_/g, " ")}, {r.kind.replace(/_/g, " ")},{" "}
                  <a href={r.url} target="_blank" rel="noreferrer" className="link">
                    {domainOf(r.url)}
                  </a>
                </p>
              </li>
            ))}
            {summary.droppedClaims > summary.rejected.length && <li className="py-3 text-[13px] text-muted">And {summary.droppedClaims - summary.rejected.length} more.</li>}
          </ul>
        </Popover>
      )}
    </p>
  );
}
