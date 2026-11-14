"use client";
import { useEffect, useRef, useState } from "react";
import type { DropReason, RunSummary } from "@/lib/types";
import { domainOf, fmtDate, plural } from "@/lib/ui/format";
import { IconClose } from "./icons";

const REASON: Record<DropReason, string> = {
  quote_not_found: "Quote not found on the page",
  url_not_allowed: "Source not on the allowed list",
  page_unavailable: "Page could not be read",
  unknown_step_id: "Refers to an unknown step",
  invalid_value: "Value could not be read",
  too_short: "Quote too short to prove anything",
  merged_sentences: "Quote stitched from separate sentences",
  value_not_in_quote: "The quote does not state the value",
};

export function SummaryBar({ summary }: { summary: RunSummary }) {
  const [open, setOpen] = useState(false);
  const sources = Object.values(summary.sourcesByTrust).reduce((a, b) => a + b, 0);
  const end = summary.criticalPath.endDate;

  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink">
      <Item>{plural(summary.steps, "step")}</Item>
      <Dot />
      <Item>{plural(summary.inPersonVisits, "visit")}</Item>
      {end && (
        <>
          <Dot />
          <Item>
            ready by <strong className="font-semibold text-accent">{fmtDate(end)}</strong>
          </Item>
        </>
      )}
      <Dot />
      <Item>
        {summary.verifiedQuotes} quotes verified from {plural(sources, "source")}
      </Item>
      {summary.droppedClaims > 0 && (
        <>
          <Dot />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="num underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
          >
            {summary.droppedClaims} {summary.droppedClaims === 1 ? "claim" : "claims"} rejected
          </button>
        </>
      )}
      {summary.notFound > 0 && (
        <>
          <Dot />
          <Item>{summary.notFound} not found</Item>
        </>
      )}
      {open && <RejectedList summary={summary} onClose={() => setOpen(false)} />}
    </div>
  );
}

const Item = ({ children }: { children: React.ReactNode }) => <span className="num">{children}</span>;
const Dot = () => <span className="text-rule-strong" aria-hidden>·</span>;

function RejectedList({ summary, onClose }: { summary: RunSummary; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const shown = summary.rejected ?? [];
  return (
    <div ref={ref} role="dialog" aria-label="Rejected claims" className="overlay left-0 top-full mt-2 flex max-h-[min(60vh,32rem)] w-[min(40rem,90vw)] flex-col p-4 text-left">
      <div className="mb-1 flex items-start justify-between gap-4">
        <h3 className="text-[16px] font-semibold">Claims we threw away</h3>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
          <IconClose />
        </button>
      </div>
      <p className="mb-3 text-[14px] text-muted">
        The extractor proposed these, but the quote did not hold up against the page text Exa returned. They are not used anywhere in your plan.
      </p>
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {shown.map((r, i) => (
          <li key={i} className="border-t border-rule pt-3">
            <p className="text-[14px] font-medium text-ink">{REASON[r.reason] ?? r.reason}</p>
            <p className="mt-1 font-serif text-[15px] italic leading-snug text-muted">“{r.quote}”</p>
            <p className="mt-1 text-[14px] text-muted">
              {r.stepId.replace(/_/g, " ")} · {r.kind.replace(/_/g, " ")} ·{" "}
              <a href={r.url} target="_blank" rel="noreferrer" className="underline decoration-rule-strong underline-offset-2 hover:text-ink">
                {domainOf(r.url)}
              </a>
            </p>
          </li>
        ))}
        {summary.droppedClaims > shown.length && (
          <li className="border-t border-rule pt-3 text-[14px] text-muted">and {summary.droppedClaims - shown.length} more.</li>
        )}
      </ul>
    </div>
  );
}
