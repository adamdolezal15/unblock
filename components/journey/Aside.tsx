"use client";
import type { DraftOffer } from "@/lib/agent/draftOffers";
import { say, type PlanNumbers } from "@/lib/ui/counts";
import { fmtDay } from "@/lib/ui/format";
import type { FormLine } from "@/lib/ui/forms";
import { shortFormName, type AnytimeRow, type WorthItem } from "@/lib/ui/journey";
import type { DraftsApi } from "@/lib/ui/useDrafts";
import { draftKindName } from "../drafts/DraftCard";

const label = "font-sans text-[13px] font-semibold uppercase tracking-[1.5px]";

/** Money at stake and sources that disagree, each pointing at its step. */
export function WorthKnowing({ items, onOpen }: { items: WorthItem[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <section aria-label="Worth knowing" className="rounded-[22px] border border-j-warn-border bg-j-warn-bg px-6 py-6 sm:px-[26px]">
      <h2 className={`${label} text-j-warn-text`}>Worth knowing</h2>
      {items.map((w, i) => (
        <div key={`${w.key}:${w.stepId}`} className={i === 0 ? "mt-2.5" : "mt-3"}>
          <p>
            {w.strong ? (
              <>
                {w.strong.lead}, <strong className="font-semibold">{w.strong.amount}</strong> of your {w.strong.of} is withheld each month.
              </>
            ) : (
              w.text
            )}{" "}
            <button type="button" onClick={() => onOpen(w.stepId)} className="link whitespace-nowrap">
              {w.key === "conflict" ? "See both sides" : "See the step"}
            </button>
          </p>
        </div>
      ))}
    </section>
  );
}

/** Online steps off the slowest chain (and optional ones): no fixed date, "from <first possible day>". */
export function Anytime({ rows, onOpen }: { rows: AnytimeRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) return null;
  return (
    <section aria-label="Anytime, no fixed date" className="rounded-[22px] border border-j-hairline bg-white px-6 py-6 sm:px-[26px]">
      <h2 className={`${label} text-j-muted`}>Anytime, no fixed date</h2>
      <ul className="mt-3">
        {rows.map((r, i) => (
          <li key={r.step.id} className={`flex items-baseline justify-between gap-3 py-3 ${i < rows.length - 1 ? "border-b border-[#E6EDE9]" : ""}`}>
            <button type="button" onClick={() => onOpen(r.step.id)} className="min-w-0 text-left hover:text-j-primary">
              {r.step.title}
              {r.optional && <span className="ml-2 rounded-full border border-j-hairline px-2 py-[1px] text-[12px] font-semibold text-j-muted">Optional</span>}
            </button>
            <span className="num shrink-0 whitespace-nowrap text-[14px] text-j-primary">from {fmtDay(r.from)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The dark "Paperwork ready" panel: the official forms (open) and the drafts (open in the viewer below). */
export function Paperwork({ forms, drafts, onDraft }: { forms: { line: FormLine; office: string }[]; drafts: DraftsApi; onDraft: (o: DraftOffer) => void }) {
  if (!forms.length && !drafts.offers.length) return null;
  const row = "flex items-center justify-between gap-3 rounded-[12px] bg-white/[0.07] px-3.5 py-3 text-left text-j-bg hover:bg-white/[0.12]";
  return (
    <section aria-label="Paperwork ready" className="rounded-[22px] bg-j-ink px-6 py-6 text-j-bg sm:px-[26px]">
      <h2 className={`${label} text-j-panel-muted`}>Paperwork ready</h2>
      <ul className="mt-3.5 flex flex-col gap-2.5">
        {forms.map(({ line, office }) => (
          <li key={line.form.id}>
            <a href={line.href} target="_blank" rel="noreferrer" aria-label={`${line.linkLabel}: ${line.name}`} title={line.name} className={row}>
              <span className="min-w-0">
                {shortFormName(line.name)}
                <span className="text-j-panel-muted"> · {office}</span>
              </span>
              <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
        {drafts.offers.map((o) => {
          const status = drafts.get(o.id).status;
          return (
            <li key={o.id}>
              <button type="button" onClick={() => onDraft(o)} className={`w-full ${row}`}>
                <span className="min-w-0">{draftKindName(o)}</span>
                <span className="shrink-0 text-[14px]">{status === "ready" ? "Read" : status === "loading" ? "Preparing…" : "Prepare"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3.5 text-[13px] text-j-panel-muted">Written from verified facts. Nothing is sent for you.</p>
    </section>
  );
}

/** Verified quotes, dropped claims, sources: the run summary's numbers (lib/ui/counts), nothing recounted here. */
export function TrustCounters({ n }: { n: PlanNumbers }) {
  if (n.quotes === null) return null;
  // The shared wording (say.*), with the number set large: "90 verified quotes" -> 90 / "verified quotes".
  const words = (s: string) => s.replace(/^\d+\s+/, "");
  const items = [
    { v: n.quotes, l: words(say.quotes(n.quotes)), c: "text-j-done" },
    { v: n.dropped ?? 0, l: words(say.dropped(n.dropped ?? 0)), c: "text-j-warn-text" },
    { v: n.sources ?? 0, l: words(say.sources(n.sources ?? 0)), c: "text-j-ink" },
  ];
  return (
    <section aria-label="How it was checked" className="flex flex-wrap gap-x-[22px] gap-y-3 rounded-[22px] border border-j-hairline bg-white px-6 py-[22px] sm:px-[26px]">
      {items.map((x) => (
        <div key={x.l}>
          <p className={`num font-j-serif text-[30px] font-bold leading-tight ${x.c}`}>{x.v}</p>
          <p className="text-[13px] text-j-muted">{x.l}</p>
        </div>
      ))}
    </section>
  );
}
