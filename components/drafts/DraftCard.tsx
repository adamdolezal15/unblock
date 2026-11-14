"use client";
import { useState } from "react";
import { mailtoHref, type DraftOffer } from "@/lib/agent/draftOffers";
import type { DraftsApi } from "@/lib/ui/useDrafts";
import type { Step, StepForm } from "@/lib/types";
import type { FormLine } from "@/lib/ui/forms";
import { FormRow } from "../FormRow";
import { IconExternal } from "../icons";

const primary =
  "inline-flex items-center gap-2 rounded-[5px] bg-accent px-4 py-2 text-[15px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-rule-strong";
const secondary =
  "inline-flex items-center gap-2 rounded-[5px] border border-rule-strong bg-raised px-4 py-2 text-[15px] font-medium text-ink transition-colors hover:border-ink";
const link = "text-[15px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";

export const draftAnchor = (offerId: string) => `draft-${offerId.replace(/[^\w-]/g, "-")}`;

/** On a day card: a small link to the draft in "Ready to send" (prepares it on the way if needed). */
export function DraftLink({ offer, drafts }: { offer: DraftOffer; drafts: DraftsApi }) {
  const status = drafts.get(offer.id).status;
  return (
    <button
      type="button"
      className={`mt-2 block ${link}`}
      onClick={() => {
        if (status === "idle" || status === "error") void drafts.prepare(offer.id);
        document.getElementById(draftAnchor(offer.id))?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {status === "ready" ? "Draft ready →" : status === "loading" ? "Preparing draft →" : "Prepare draft →"}
    </button>
  );
}

/** One draft, in "Ready to send" only: prepare on click, then preview, copy, or approve and open. */
function DraftCard({ offer, drafts }: { offer: DraftOffer; drafts: DraftsApi }) {
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
    <div id={draftAnchor(offer.id)} className="scroll-mt-24 rounded-[8px] border border-rule bg-raised px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[17px] font-bold text-ink">{offer.title}</p>
        {entry.status !== "ready" && (
          <button type="button" className={primary} disabled={entry.status === "loading"} onClick={() => void drafts.prepare(offer.id)}>
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
          <p className="mt-3 text-[14px] text-muted">Fill in the [brackets] and check it before sending.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
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

/** "Ready to send": the one place drafts are shown, under the plan. */
export function ReadyToSend({ drafts, forms = [] }: { drafts: DraftsApi; forms?: { form: StepForm; steps: Step[]; line: FormLine }[] }) {
  if (!drafts.offers.length && !forms.length) return null;
  return (
    <section aria-label="Ready to send" className="mt-14 border-t border-rule pt-8">
      <h2 className="text-[22px] font-bold text-ink">Ready to send</h2>
      {forms.length > 0 && (
        <div className="mt-5" aria-label="Official forms">
          <h3 className="text-[18px] font-bold text-ink">Official forms</h3>
          <p className="mt-1 max-w-[62ch] text-[16px] text-muted">Forms you need to bring or fill in online.</p>
          <ul className="mt-3 space-y-3">
            {forms.map((f) => (
              <li key={f.form.id} className="rounded-[8px] border border-rule bg-raised px-4 py-3">
                <FormRow line={f.line} variant="list" />
                <span className="mt-1 block pl-[28px] text-[14px] text-muted">For {f.steps.map((s) => s.title).join(" and ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {drafts.offers.length > 0 && (
        <div className={forms.length > 0 ? "mt-10" : "mt-5"}>
          {forms.length > 0 && <h3 className="text-[18px] font-bold text-ink">Drafts</h3>}
          <p className="mt-1 max-w-[62ch] text-[16px] text-muted">Written only from the verified facts in your plan. Nothing is sent for you.</p>
          <div className="mt-4 space-y-4">
            {drafts.offers.map((o) => (
              <DraftCard key={o.id} offer={o} drafts={drafts} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
