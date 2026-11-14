"use client";
import { useState } from "react";
import { mailtoHref, type DraftOffer } from "@/lib/agent/draftOffers";
import type { DraftsApi } from "@/lib/ui/useDrafts";
import { IconExternal } from "../icons";

const primary =
  "inline-flex items-center gap-2 rounded-[5px] bg-accent px-4 py-2 text-[15px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-rule-strong";
const secondary =
  "inline-flex items-center gap-2 rounded-[5px] border border-rule-strong bg-raised px-4 py-2 text-[15px] font-medium text-ink transition-colors hover:border-ink";
const link = "text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";

/** One draft: prepare on click, then a preview you can check, copy, or open in your email app. */
export function DraftCard({ offer, drafts, compact = false }: { offer: DraftOffer; drafts: DraftsApi; compact?: boolean }) {
  const entry = drafts.get(offer.id);
  const [copied, setCopied] = useState(false);
  const d = entry.draft;

  const copy = async () => {
    if (!d) return;
    try {
      await navigator.clipboard.writeText(offer.email ? `Subject: ${d.subject}\n\n${d.body}` : d.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={compact ? "mt-3 rounded-[6px] border border-rule bg-paper px-4 py-3" : "rounded-[8px] border border-rule bg-raised px-5 py-4"}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className={compact ? "text-[15px] font-semibold text-ink" : "text-[17px] font-bold text-ink"}>{offer.title}</p>
        {entry.status !== "ready" && (
          <button type="button" className={compact ? secondary : primary} disabled={entry.status === "loading"} onClick={() => void drafts.prepare(offer.id)}>
            {entry.status === "loading" ? "Preparing…" : "Prepare draft"}
          </button>
        )}
      </div>
      {entry.status === "error" && <p className="mt-2 text-[15px] text-ink">{entry.error}</p>}
      {d && (
        <div className="mt-3">
          {offer.email && (
            <p className="text-[15px] text-muted">
              Subject: <span className="text-ink">{d.subject}</span>
            </p>
          )}
          <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-[6px] border border-rule bg-paper px-4 py-3 font-sans text-[15px] leading-relaxed text-ink">
            {d.body}
          </pre>
          <p className="mt-2 text-[14px] text-muted">
            Every fact ends with its source number. Fill in the [brackets] and check it before sending.
            {d.sources.length > 0 && " Sources: "}
            {d.sources.map((s, i) => (
              <span key={s.n}>
                {i > 0 && ", "}
                <a href={s.url} target="_blank" rel="noreferrer" title={s.quote} className={link}>
                  [{s.n}]
                </a>
              </span>
            ))}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {offer.email ? (
              <a href={mailtoHref(d)} className={primary}>
                Approve and open in email
              </a>
            ) : (
              d.bookingUrl && (
                <a href={d.bookingUrl} target="_blank" rel="noreferrer" className={primary}>
                  Approve and open booking <IconExternal className="h-3.5 w-3.5" />
                </a>
              )
            )}
            <button type="button" className={secondary} onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Ready to send": every draft this plan can back with verified facts, under the plan. */
export function ReadyToSend({ drafts }: { drafts: DraftsApi }) {
  if (!drafts.offers.length) return null;
  return (
    <section aria-label="Ready to send" className="mt-14 border-t border-rule pt-8">
      <h2 className="text-[22px] font-bold text-ink">Ready to send</h2>
      <p className="mt-1 max-w-[62ch] text-[16px] text-muted">
        Drafts written only from the verified facts in your plan. Nothing is sent for you: prepare one, check it, then approve.
      </p>
      <div className="mt-5 space-y-4">
        {drafts.offers.map((o) => (
          <DraftCard key={o.id} offer={o} drafts={drafts} />
        ))}
      </div>
    </section>
  );
}
