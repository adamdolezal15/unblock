"use client";
import type { DraftOffer } from "@/lib/agent/draftOffers";
import type { DayStep } from "@/lib/ui/days";
import { fmtDay, fmtDow } from "@/lib/ui/format";
import { plainText, shortFormName, type JourneyTicket, type WorthItem } from "@/lib/ui/journey";
import type { DraftsApi } from "@/lib/ui/useDrafts";
import { draftLabel } from "../drafts/DraftCard";
import { IconCalendar, IconExternal } from "../icons";
import { skipLine } from "../views/DayByDay";

export type TicketCtx = {
  drafts: DraftsApi;
  /** Money and conflict lines by step (Worth knowing), shown on the step they concern too. */
  notes: Map<string, WorthItem[]>;
  onOpen: (id: string) => void;
  onSources: (id: string) => void;
  /** Prepare (if needed) and open a draft in the Paperwork viewer. */
  onDraft: (offer: DraftOffer) => void;
  /** The whole plan as one .ics file. */
  icsUrl?: string;
  onSummary: () => void;
};

/** A step's reason as the card says it: the short "Skip it" line for a consequence, else the sentence (as in Day by day). */
function reasonOf(s: DayStep): string {
  if (s.noSource) return "No official source found.";
  const why = plainText(s.whyNow);
  return skipLine(why)?.line ?? why;
}

const STUB: Record<"done" | "shortcut" | "plain", string> = {
  done: "bg-j-done",
  shortcut: "bg-j-shortcut",
  plain: "bg-j-ink",
};

const btnDark = "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[12px] bg-j-ink px-4 text-[14px] font-semibold text-j-bg hover:bg-[color-mix(in_srgb,var(--j-ink)_88%,var(--j-primary))]";
const btnLight = "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-[12px] border border-j-hairline bg-white px-4 text-[14px] font-semibold text-j-ink hover:border-[var(--j-unreached)]";

/**
 * One visit as a ticket: a coloured stub (office, day, weekday, how), a dashed perforation, then the steps,
 * "bring" chips, the key verified quote with its source, and the actions. A shortcut visit gets a coral stub.
 */
export function Ticket({ t, ctx }: { t: JourneyTicket; ctx: TicketCtx }) {
  const tone = t.kind === "done" ? "done" : t.shortcut ? "shortcut" : "plain";
  const [day] = fmtDay(t.date).split(" ");
  const month = fmtDay(t.date).split(" ")[1];
  const lead = t.steps[0]?.id;
  const offers = t.steps.flatMap((s) => ctx.drafts.forStep(s.id));
  const form = t.forms[0];
  const offer = form ? undefined : offers[0];

  return (
    <article className="flex flex-col overflow-hidden rounded-[24px] border border-j-hairline bg-white shadow-[0_8px_24px_rgba(15,42,35,0.06)] sm:flex-row">
      <div className={`flex flex-none items-end justify-between gap-4 px-5 py-4 text-j-bg sm:w-[150px] sm:flex-col sm:items-stretch sm:px-[22px] sm:py-[26px] ${STUB[tone]}`}>
        <div className="flex items-baseline gap-3 sm:block">
          <p className="text-[13px] font-semibold uppercase tracking-[1.5px] opacity-80">{t.office}</p>
          <p className="num font-j-serif text-[30px] font-bold leading-none sm:mt-1.5 sm:text-[34px]">{day}</p>
          <p className="text-[14px] opacity-85 sm:mt-1">
            {month} · {fmtDow(t.date)}
          </p>
        </div>
        <p className="text-[13px] opacity-85">{t.mode}</p>
      </div>
      <div aria-hidden className="h-0 border-t-2 border-dashed border-j-hairline sm:h-auto sm:w-0 sm:border-l-2 sm:border-t-0" />
      <div className="min-w-0 flex-1 px-5 py-5 sm:px-[30px] sm:py-[26px]">
        {t.kind === "done" ? (
          <>
            <h3 className="font-j-serif text-[24px] font-medium leading-tight sm:text-[26px]">You&apos;re fully set up</h3>
            <p className="mt-1.5 text-j-muted">The last step on your route is done by {fmtDay(t.date)}. Everything before it is on the stops above.</p>
            <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
              {ctx.icsUrl && (
                <a href={ctx.icsUrl} className={btnDark}>
                  <IconCalendar className="h-4 w-4" /> Add all to calendar
                </a>
              )}
              <button type="button" onClick={ctx.onSummary} className={btnLight}>
                Read the summary
              </button>
            </div>
          </>
        ) : (
          <>
            {t.steps.map((s, i) => (
              <StepBlock key={s.id} s={s} first={i === 0} shortcut={i === 0 && t.shortcut} ctx={ctx} />
            ))}
            {t.bring.length > 0 && (
              <div className="mt-[18px]">
                <p className="sr-only">Bring</p>
                <ul aria-label="Bring" className="flex flex-wrap gap-2">
                  {t.bring.map((b) => (
                    <li key={b} className="rounded-[10px] bg-j-chip px-3 py-[7px] text-[14px] leading-snug">
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {t.quote && (
              <figure className="mt-[18px]">
                <blockquote className="border-l-[3px] border-j-primary pl-4 font-j-serif text-[17px] leading-[1.45] sm:text-[18px]">“{t.quote.text}”</blockquote>
                <figcaption className="ml-[19px] mt-1.5 text-[13px] text-j-muted">
                  <a href={t.quote.url} target="_blank" rel="noreferrer" className="link">
                    {t.quote.domain}
                  </a>
                  {t.quote.trust === "university" ? " · university" : " · official"} · checked word for word
                  <span aria-hidden className="mx-1.5">·</span>
                  <button type="button" onClick={() => lead && ctx.onSources(lead)} className="link">
                    All quotes
                  </button>
                </figcaption>
              </figure>
            )}
            <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
              {t.calendarUrl && (
                <a href={t.calendarUrl} target="_blank" rel="noreferrer" className={btnDark}>
                  <IconCalendar className="h-4 w-4" /> Add to calendar
                </a>
              )}
              {form && (
                <a href={form.href} target="_blank" rel="noreferrer" aria-label={`${form.linkLabel}: ${form.name}`} title={form.name} className={`${btnLight} max-w-full`}>
                  <span className="truncate">{shortFormName(form.name)}</span> <IconExternal className="h-3.5 w-3.5 shrink-0" />
                </a>
              )}
              {offer && (
                <button type="button" onClick={() => ctx.onDraft(offer)} className={btnLight}>
                  {draftLabel(offer, ctx.drafts.get(offer.id).status)}
                </button>
              )}
              {lead && (
                <button type="button" onClick={() => ctx.onOpen(lead)} className="h-10 px-2 text-[14px] font-semibold text-j-ink underline decoration-[var(--j-unreached)] underline-offset-[3px] hover:decoration-[var(--j-primary)]">
                  Details
                </button>
              )}
              {t.wait && (
                <span className="ml-1 text-[13px] text-j-muted" title={t.waitTitle}>
                  {t.wait}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function StepBlock({ s, first, shortcut, ctx }: { s: DayStep; first: boolean; shortcut: boolean; ctx: TicketCtx }) {
  const notes = ctx.notes.get(s.id) ?? [];
  const money = notes.find((n) => n.key === "money");
  const conflict = notes.find((n) => n.key === "conflict");
  return (
    <div className={first ? "" : "mt-5 border-t border-j-hairline pt-4"}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={`font-j-serif font-medium leading-[1.2] ${first ? "text-[22px] sm:text-[26px]" : "text-[19px] sm:text-[20px]"}`}>{s.title}</h3>
        {shortcut && (
          <span className="mt-1 flex-none rounded-full bg-j-shortcut-chip px-3 py-[5px] text-[12px] font-bold tracking-[1px] text-j-shortcut-chip-text">SHORTCUT</span>
        )}
      </div>
      {money?.strong ? (
        <p className="mt-1.5">
          {money.strong.lead}, <strong className="font-semibold">{money.strong.amount}</strong> of your {money.strong.of} is withheld each month.
        </p>
      ) : (
        <p className="mt-1.5 text-j-muted">{money ? money.text : reasonOf(s)}</p>
      )}
      {conflict && (
        <p className="mt-2 flex items-baseline gap-2 text-[14px] text-j-warn-text">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-j-warn-text" />
          <span>
            {conflict.text}{" "}
            <button type="button" onClick={() => ctx.onOpen(s.id)} className="underline decoration-j-warn-border underline-offset-[3px] hover:decoration-j-warn-text">
              See both sides
            </button>
          </span>
        </p>
      )}
    </div>
  );
}
