"use client";
import { useState } from "react";
import { mailtoHref, type DraftOffer } from "@/lib/agent/draftOffers";
import type { DraftsApi } from "@/lib/ui/useDrafts";
import type { Step, StepForm } from "@/lib/types";
import type { FormLine } from "@/lib/ui/forms";
import { IconDocument, IconEnvelope, IconExternal, IconPencil } from "../icons";

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

/** "Email to your employer" -> ["Email", "to your employer"]; "Booking note: Register …" -> ["Booking note", "Register …"]. */
function splitTitle(o: DraftOffer): [string, string] {
  const colon = o.title.indexOf(": ");
  if (colon > 0) return [o.title.slice(0, colon), o.title.slice(colon + 2)];
  const to = o.title.indexOf(" to ");
  if (to > 0) return [o.title.slice(0, to), o.title.slice(to + 1)];
  return [o.title, ""];
}

/** One row's actions, small links separated by dots. */
function Actions({ children }: { children: React.ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-y-1 whitespace-nowrap text-[15px]">
      {items.map((c, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && (
            <span aria-hidden className="mx-2 text-muted">
              ·
            </span>
          )}
          {c}
        </span>
      ))}
    </span>
  );
}

/**
 * One draft, in "Ready to send" only, as a quiet row: icon, title, "Read · Copy · Open in email ↗" (or "Open
 * booking ↗"). Before it is prepared the row offers "Prepare draft". "Read" shows the full text inline.
 */
function DraftRow({ offer, drafts }: { offer: DraftOffer; drafts: DraftsApi }) {
  const entry = drafts.get(offer.id);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const d = entry.draft;
  const [name, rest] = splitTitle(offer);
  const Icon = offer.kind === "booking" ? IconPencil : IconEnvelope;

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
    <li id={draftAnchor(offer.id)} className="scroll-mt-24 border-b border-hairline py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <span className="flex min-w-0 flex-1 items-start gap-3 text-[17px] leading-snug">
          <Icon className="mt-[3px] h-[18px] w-[18px] shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="font-semibold text-ink">{name}</span>
            {rest && <span className="text-muted"> · {rest}</span>}
            {d && offer.email && <span className="mt-0.5 block text-[13px] text-muted">Subject: {d.subject}</span>}
          </span>
        </span>
        {entry.status !== "ready" || !d ? (
          <button type="button" className={`pt-[2px] text-[15px] ${entry.status === "loading" ? "text-muted" : "link"}`} disabled={entry.status === "loading"} onClick={() => void drafts.prepare(offer.id)}>
            {entry.status === "loading" ? "Preparing…" : "Prepare draft"}
          </button>
        ) : (
          <span className="pt-[2px]">
            <Actions>
              {[
                <button key="r" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="link">
                  {open ? "Hide" : "Read"}
                </button>,
                <button key="c" type="button" onClick={() => void copy()} className="link">
                  {copied ? "Copied" : "Copy"}
                </button>,
                offer.email ? (
                  <a key="m" href={mailtoHref(d)} className="inline-flex items-center gap-1 link">
                    Open in email <IconExternal className="h-3.5 w-3.5" />
                  </a>
                ) : d.bookingUrl ? (
                  <a key="b" href={d.bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 link">
                    Open booking <IconExternal className="h-3.5 w-3.5" />
                  </a>
                ) : null,
              ]}
            </Actions>
          </span>
        )}
      </div>
      {entry.status === "error" && <p className="mt-2 pl-[30px] text-[15px] text-ink">{entry.error}</p>}
      {d && open && (
        <div className="mt-3 pl-[30px]">
          <div className="whitespace-pre-wrap rounded-[10px] border border-hairline bg-paper px-4 py-4 text-[15px] leading-normal text-ink">{d.body}</div>
          <p className="mt-2 text-[13px] text-muted">Fill in the [brackets] and check it before sending.</p>
        </div>
      )}
    </li>
  );
}

/** "Ready to send": official forms and the prepared emails and notes, both as the same quiet list. */
export function ReadyToSend({ drafts, forms = [] }: { drafts: DraftsApi; forms?: { form: StepForm; steps: Step[]; line: FormLine }[] }) {
  if (!drafts.offers.length && !forms.length) return null;
  return (
    <section aria-label="Ready to send" className="mt-12">
      <h2 className="text-[28px] font-bold text-ink">Ready to send</h2>
      <p className="mt-1 max-w-[62ch] text-[15px] text-muted">Written only from verified facts. Nothing is sent for you.</p>
      {forms.length > 0 && (
        <div className="mt-6" aria-label="Official forms">
          <h3 className="text-[17px] font-semibold text-ink">Official forms</h3>
          <ul className="mt-2 max-w-[760px] border-t border-hairline">
            {forms.map((f) => (
              <li key={f.form.id} className="flex items-start justify-between gap-6 border-b border-hairline py-3">
                <span className="flex min-w-0 items-start gap-3 text-[17px] leading-snug">
                  <IconDocument className="mt-[3px] h-[18px] w-[18px] shrink-0 text-accent" />
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
        <div className="mt-8" aria-label="Emails and notes">
          <h3 className="text-[17px] font-semibold text-ink">Emails and notes</h3>
          <ul className="mt-2 max-w-[760px] border-t border-hairline">
            {drafts.offers.map((o) => (
              <DraftRow key={o.id} offer={o} drafts={drafts} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
