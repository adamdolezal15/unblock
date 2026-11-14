"use client";
import { useState } from "react";
import { mailtoHref, type DraftOffer } from "@/lib/agent/draftOffers";
import type { DraftsApi } from "@/lib/ui/useDrafts";
import type { Step, StepForm } from "@/lib/types";
import type { FormLine } from "@/lib/ui/forms";
import { IconDocument, IconExternal } from "../icons";

const secondary =
  "btn-secondary";
const link = "text-[15px] link";

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
/** What a draft is, in a few words: "Booking note", "Email to the bank", "Email to your employer". */
const draftKindName = (o: DraftOffer) => (o.kind === "booking" ? "Booking note" : o.title);
/** "Prepare booking note" / "Preparing booking note…" / "Booking note ready". */
export function draftLabel(o: DraftOffer, status?: string): string {
  const name = draftKindName(o);
  return status === "ready" ? `${name} ready` : status === "loading" ? `Preparing ${lowerFirst(name)}…` : `Prepare ${lowerFirst(name)}`;
}

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
      {draftLabel(offer, status)}
    </button>
  );
}

/**
 * One draft, in "Ready to send" only. Before it is prepared: its title and "Prepare draft". Once ready it stays
 * collapsed: title, subject, Copy and Open in email (or Open booking); "Read the draft" shows the full text,
 * at its own height (no inner scrollbar).
 */
function DraftCard({ offer, drafts }: { offer: DraftOffer; drafts: DraftsApi }) {
  const entry = drafts.get(offer.id);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const d = entry.draft;

  const copy = async () => {
    if (!d) return;
    try {
      await navigator.clipboard.writeText(offer.email ? `Subject: ${d.subject}

${d.body}` : d.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div id={draftAnchor(offer.id)} className="card scroll-mt-24 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-ink">{offer.title}</p>
          {d && offer.email && <p className="mt-1 text-[15px] text-muted">Subject: <span className="text-ink">{d.subject}</span></p>}
        </div>
        {entry.status !== "ready" ? (
          <button type="button" className={secondary} disabled={entry.status === "loading"} onClick={() => void drafts.prepare(offer.id)}>
            {entry.status === "loading" ? "Preparing…" : "Prepare draft"}
          </button>
        ) : (
          d && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={secondary} onClick={() => void copy()}>
                {copied ? "Copied" : "Copy"}
              </button>
              {offer.email ? (
                <a href={mailtoHref(d)} className={secondary}>
                  Open in email
                </a>
              ) : (
                d.bookingUrl && (
                  <a href={d.bookingUrl} target="_blank" rel="noreferrer" className={secondary}>
                    Open booking <IconExternal className="h-3.5 w-3.5" />
                  </a>
                )
              )}
            </div>
          )
        )}
      </div>
      {entry.status === "error" && <p className="mt-2 text-[15px] text-ink">{entry.error}</p>}
      {d && (
        <div className="mt-3">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-[15px] link">
            {open ? "Hide the draft" : "Read the draft"}
          </button>
          {open && (
            <>
              <div className="mt-3 whitespace-pre-wrap rounded-[10px] border border-hairline bg-paper px-4 py-4 text-[15px] leading-normal text-ink">{d.body}</div>
              <p className="mt-2 text-[13px] text-muted">Fill in the [brackets] and check it before sending.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** "Ready to send": the one place drafts are shown, under the plan. Forms first, as a plain list. */
export function ReadyToSend({ drafts, forms = [] }: { drafts: DraftsApi; forms?: { form: StepForm; steps: Step[]; line: FormLine }[] }) {
  if (!drafts.offers.length && !forms.length) return null;
  return (
    <section aria-label="Ready to send" className="mt-12">
      <h2 className="text-[28px] font-bold text-ink">Ready to send</h2>
      {forms.length > 0 && (
        <div className="mt-4" aria-label="Official forms">
          <h3 className="text-[20px] font-bold text-ink">Official forms</h3>
          <p className="mt-1 max-w-[62ch] text-[17px] text-muted">Forms you need to bring or fill in online.</p>
          <ul className="mt-3 max-w-[680px] border-t border-hairline">
            {forms.map((f) => (
              <li key={f.form.id} className="flex items-start justify-between gap-4 border-b border-hairline py-3">
                <span className="flex min-w-0 items-start gap-2 text-[17px] leading-normal">
                  <IconDocument className="mt-[4px] h-4 w-4 shrink-0 text-accent" />
                  <span className="font-semibold text-ink">{f.line.name}</span>
                </span>
                <a href={f.line.href} target="_blank" rel="noreferrer" aria-label={`${f.line.linkLabel}: ${f.line.name}`} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap pt-[2px] text-[15px] link">
                  {f.line.shortLabel} <IconExternal className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {drafts.offers.length > 0 && (
        <div className={forms.length > 0 ? "mt-8" : "mt-4"}>
          {forms.length > 0 && <h3 className="text-[20px] font-bold text-ink">Drafts</h3>}
          <p className="mt-1 max-w-[62ch] text-[17px] text-muted">Written only from the verified facts in your plan. Nothing is sent for you.</p>
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
