"use client";
import { useEffect, useRef } from "react";
import type { Citation, Conflict, Step, Tip } from "@/lib/types";
import type { RunState } from "@/lib/ui/runState";
import type { LetterDoc } from "@/lib/ui/letter";
import { conflictNote, topicText, whatToDoShort } from "@/lib/ui/letter";
import { nodeLabel } from "@/lib/ui/labels";
import { fmtLongDay } from "@/lib/ui/format";
import { appliesCitation, conflictsFor, edgeEvidence, milestoneOptions, needs, stepFacts, tipsFor, unblocks, visitMates, type Fact } from "@/lib/ui/panel";
import type { Selection } from "@/lib/ui/selection";
import { Footnote } from "../letter/Footnote";
import { QuoteCard } from "../letter/QuoteCard";
import { IconClose, MODE_LABEL } from "../icons";
import { Help, Term } from "../Help";
import { disagreeLabel } from "@/lib/ui/glossary";
import { bookingHref } from "@/lib/calendar/bookingUrl";

type Props = { state: RunState; doc: LetterDoc; selection: NonNullable<Selection>; onSelect: (s: Selection) => void };

/** Opaque side panel next to the map. Escape or the close button closes it. */
export function SidePanel({ state, doc, selection, onSelect }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onSelect(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  // Keyboard users land in the drawer when it opens and go back where they were when it closes.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => back?.focus?.({ preventScroll: true });
  }, []);
  const selKey = selection.kind === "edge" ? selection.id : `s:${selection.id}`;
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [selKey]);

  const ctx: Ctx = {
    state,
    cite: (c?: Citation) => (c ? <Footnote r={doc.ref(c)} /> : null),
    n: (c: Citation) => doc.ref(c).n,
    name: (id: string) => nodeLabel(id, state.steps[id]?.title ?? id.replace(/_/g, " ")),
    open: (id: string) => onSelect({ kind: "step", id }),
  };

  let body: React.ReactNode;
  if (selection.kind === "edge") body = <EdgeView ctx={ctx} source={selection.source} target={selection.target} />;
  else if (state.steps[selection.id]?.milestone && milestoneOptions(state, selection.id).length) body = <MilestoneView ctx={ctx} id={selection.id} />;
  else body = <StepView ctx={ctx} id={selection.id} />;

  // A fixed drawer: opens from any view and never resizes the map behind it.
  return (
    <aside
      ref={scroller}
      aria-label="Details"
      className="fixed inset-y-0 right-0 z-40 w-[min(480px,100vw)] overflow-y-auto border-l border-rule-strong bg-paper px-7 pb-12 pt-6 shadow-[-12px_0_32px_rgba(26,36,51,0.12)]"
    >
      <button ref={closeRef} type="button" onClick={() => onSelect(null)} className="absolute right-4 top-4 rounded p-1.5 text-muted hover:bg-sunk hover:text-ink" aria-label="Close details">
        <IconClose className="h-5 w-5" />
      </button>
      {body}
    </aside>
  );
}

const TIER_TITLE: Record<Citation["trust"], string> = {
  official: "Official",
  provider: "Banks and providers",
  university: "Universities",
  news: "News",
  community: "People who did it",
};

/** Every quote behind a step, grouped by trust tier, numbered like the letter. */
function StepSources({ ctx, step }: { ctx: Ctx; step: Step }) {
  const all = [...(step.claims ?? []).map((c) => c.citation), ...step.citations];
  const unique = all.filter((c, i) => all.findIndex((d) => d.url === c.url && d.quote === c.quote) === i);
  if (!unique.length) return null;
  return (
    <section className="mt-8 border-t border-rule pt-5">
      <h3 className="text-[16px] font-semibold text-ink">Sources</h3>
      {(Object.keys(TIER_TITLE) as Citation["trust"][]).map((t) => {
        const list = unique.filter((c) => c.trust === t).sort((a, b) => ctx.n(a) - ctx.n(b));
        if (!list.length) return null;
        return (
          <div key={t} className="mt-4">
            <p className="text-[15px] text-muted">{TIER_TITLE[t]}</p>
            <div className="mt-2 space-y-4">
              {list.map((c, i) => (
                <QuoteCard key={i} citation={c} n={ctx.n(c)} size="sm" />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** One plain sentence: who, how, when. */
function plainSummary(step: Step, date?: string): string {
  const how = step.mode === "online" ? "online" : step.mode === "in_person" ? "in person" : "online or in person";
  const at = /^Your /.test(step.authority) ? step.authority.replace(/^Your/, "your") : step.authority;
  return `You do this ${how}, with ${at}${date ? `, planned for ${fmtLongDay(date)}` : ""}.`;
}

type Ctx = { state: RunState; cite: (c?: Citation) => React.ReactNode; n: (c: Citation) => number; name: (id: string) => string; open: (id: string) => void };

function StepLink({ ctx, id }: { ctx: Ctx; id: string }) {
  return (
    <button type="button" onClick={() => ctx.open(id)} className="text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
      {lower(ctx.name(id))}
    </button>
  );
}

const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(DVV|Vero|Kela|Migri|Police|EU|ID|Finnish|University)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

function List({ ctx, ids }: { ctx: Ctx; ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && (i === ids.length - 1 ? " and " : ", ")}
          <StepLink ctx={ctx} id={id} />
        </span>
      ))}
    </>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 text-[16px] font-semibold text-ink">{children}</h3>;
}

function StepView({ ctx, id }: { ctx: Ctx; id: string }) {
  const { state } = ctx;
  const step = state.steps[id];
  const stub = state.stubs.find((s) => s.id === id);
  if (!step) {
    return (
      <div className="pr-8">
        <h2 className="text-[24px] font-bold leading-tight text-ink">{stub?.label ?? ctx.name(id)}</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-ink">
          Not found in any source I could verify.{" "}
          {stub?.checkUrl && (
            <>
              Check{" "}
              <a href={stub.checkUrl} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2">
                {stub.checkUrl}
              </a>
              .
            </>
          )}
        </p>
      </div>
    );
  }
  const item = state.schedule?.schedule.items[id];
  const facts = stepFacts(step);
  const un = unblocks(state, id);
  const need = needs(state, id);
  const mates = visitMates(state, id);
  const tips = tipsFor(state.tips, id);
  const conflicts = conflictsFor(state.conflicts, id);
  const choice = state.schedule?.visitChoices.find((v) => v.members.includes(id));
  const critical = state.schedule?.criticalPath.stepIds.includes(id);
  const applies = appliesCitation(step);

  return (
    <div>
      <p className="pr-8 text-[15px] text-muted">
        {step.authority}, {MODE_LABEL[step.mode].toLowerCase()}
        {critical && (
          <span className="text-accent">
            , <Term term="slowest" />
          </span>
        )}
      </p>
      <h2 className="mt-1 pr-8 text-[26px] font-bold leading-[1.2] text-ink">
        {step.title}
        {ctx.cite(applies)}
      </h2>
      {step.done ? (
        <p className="mt-3 text-[16px] text-done">You told me you already have this, so I didn&apos;t research it.</p>
      ) : (
        <p className="num mt-3 text-[17px] leading-relaxed text-ink">
          {plainSummary(step, item?.startDate)}
          {item?.estimated && (
            <span className="text-muted">
              {" "}
              <Term term="estimate" />
            </span>
          )}
          {item?.movedBy && <span className="text-muted"> Moved from {fmtLongDay(item.movedBy.from)} for {item.movedBy.holiday}.</span>}
          {item?.note && !item.estimated && <span className="block text-[15px] text-muted">Timing: {item.note}.</span>}
        </p>
      )}

      {conflicts.map((c, i) => (
        <ConflictCallout key={i} ctx={ctx} c={c} />
      ))}

      {(un.direct.length > 0 || un.via || facts.costOfDelay.length > 0) && (
        <>
          <H>Why it matters</H>
          <div className="mt-2 space-y-2 text-[16px] leading-relaxed text-ink">
            {un.direct.length > 0 && (
              <p>
                It unblocks <List ctx={ctx} ids={un.direct} />.
              </p>
            )}
            {un.via && (
              <p>
                It gives you your {lower(state.steps[un.via.milestone]?.title ?? ctx.name(un.via.milestone))}
                {ctx.cite(milestoneOptions(state, un.via.milestone).find((o) => o.id === id)?.citation)}, which <List ctx={ctx} ids={un.via.steps} />{" "}
                {un.via.steps.length === 1 ? "needs" : "need"}.
              </p>
            )}
            {facts.costOfDelay.map((f) => (
              <p key={f.value}>
                If it waits: {f.value}
                {ctx.cite(f.citation)}
              </p>
            ))}
          </div>
        </>
      )}

      {need.length > 0 && (
        <>
          <H>You need first</H>
          <ul className="mt-2 space-y-1 text-[16px] text-ink">
            {need.map((n) => (
              <li key={n.id}>
                <StepLink ctx={ctx} id={n.id} />
                {ctx.cite(n.citation)}
              </li>
            ))}
          </ul>
        </>
      )}

      {(facts.documents.length > 0 || facts.visit.length > 0 || mates.length > 0) && (
        <>
          <H>Your visit</H>
          {mates.length > 0 && (
            <p className="mt-2 text-[16px] text-ink">
              Same visit as <List ctx={ctx} ids={mates.map((m) => m.id)} />
              {mates.map((m) => ctx.cite(m.citation))}.
            </p>
          )}
          {facts.visit.length > 0 && (
            <dl className="mt-2 space-y-2 text-[16px]">
              {facts.visit.map((f) => (
                <div key={f.label + f.value}>
                  <dt className="text-[15px] text-muted">{f.label}</dt>
                  <dd className="text-ink">
                    {f.label === "Booking" && bookingHref(f.value) ? (
                      <a href={bookingHref(f.value)!} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2">
                        {f.value}
                      </a>
                    ) : (
                      f.value
                    )}
                    {ctx.cite(f.citation)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {facts.documents.length > 0 && (
            <>
              <p className="mt-3 text-[15px] text-muted">What to bring</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[16px] text-ink marker:text-rule-strong">
                {facts.documents.map((f) => (
                  <li key={f.value}>
                    {f.value}
                    {ctx.cite(f.citation)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {choice && <p className="mt-3 text-[15px] leading-relaxed text-muted">{choice.description}</p>}
        </>
      )}

      {facts.other.length > 0 && (
        <>
          <H>Good to know</H>
          <dl className="mt-2 space-y-2 text-[16px]">
            {facts.other.map((f: Fact) => (
              <div key={f.label + f.value}>
                <dt className="text-[15px] text-muted">{f.label}</dt>
                <dd className="text-ink">
                  {f.label === "Online or in person" ? MODE_LABEL[f.value as Step["mode"]] ?? f.value : f.value}
                  {ctx.cite(f.citation)}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {tips.length > 0 && <Tips ctx={ctx} tips={tips} />}
      <StepSources ctx={ctx} step={step} />
    </div>
  );
}

const TIP_KIND: Record<Tip["kind"], string> = { wait_time: "Waiting", trick: "Trick", gotcha: "Watch out", document: "Paperwork" };

function Tips({ ctx, tips }: { ctx: Ctx; tips: Tip[] }) {
  return (
    <section className="mt-8 border-t border-rule pt-5">
      <h3 className="text-[16px] font-semibold text-ink">From people who did it</h3>
      <p className="mt-1 text-[14px] text-muted">Forums, blogs and university guides. Useful, but not official.</p>
      <ul className="mt-3 space-y-3">
        {tips.map((t, i) => (
          <li key={i} className="text-[15px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">{TIP_KIND[t.kind]}{t.waitDays !== undefined ? `, about ${t.waitDays} working days` : ""}.</span> {t.tip}
            {ctx.cite(t.citation)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConflictCallout({ ctx, c }: { ctx: Ctx; c: Conflict }) {
  return (
    <section className="mt-6 rounded-[6px] border border-amber-line bg-amber-soft px-4 py-4" aria-label={disagreeLabel(c.a.trust === "official" && c.b.trust === "official")}>
      <h3 className="flex items-center gap-2 text-[16px] font-semibold text-amber">
        <span className="h-3 w-3 shrink-0 rounded-full bg-amber-dot" />
        {disagreeLabel(c.a.trust === "official" && c.b.trust === "official")}: {topicText(c.topic, ctx.name)}
        <Help term="disagree" />
      </h3>
      <p className="mt-1 text-[15px] leading-relaxed text-ink">{conflictNote(c.note, c.a, c.b)}</p>
      <div className="mt-3 grid gap-4">
        <QuoteCard citation={c.a} n={ctx.n(c.a)} size="sm" />
        <QuoteCard citation={c.b} n={ctx.n(c.b)} size="sm" />
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        <span className="font-semibold">What to do: </span>
        {whatToDoShort(c.whatToDo)}
      </p>
    </section>
  );
}

function MilestoneView({ ctx, id }: { ctx: Ctx; id: string }) {
  const { state } = ctx;
  const ms = state.steps[id];
  const options = milestoneOptions(state, id);
  const items = state.schedule?.schedule.items;
  const deps = (state.graph?.graph.edges ?? []).filter((e) => e.source === id && !e.anyOf).map((e) => e.target);
  return (
    <div>
      <p className="pr-8 text-[15px] text-muted">
        <Term term="either" />
      </p>
      <h2 className="mt-1 pr-8 text-[26px] font-bold leading-[1.2] text-ink">{ms?.title ?? ctx.name(id)}</h2>
      <H>Ways to get it</H>
      <ul className="mt-2 space-y-2 text-[16px] text-ink">
        {options
          .sort((a, b) => (items?.[a.id]?.readyIndex ?? 0) - (items?.[b.id]?.readyIndex ?? 0))
          .map((o) => (
            <li key={o.id}>
              <StepLink ctx={ctx} id={o.id} />
              {ctx.cite(o.citation)}
              {items?.[o.id] && <span className="num text-muted">, usable from {fmtLongDay(items[o.id].readyDate)}</span>}
            </li>
          ))}
      </ul>
      {deps.length > 0 && (
        <>
          <H>What needs it</H>
          <p className="mt-2 text-[16px] text-ink">
            <List ctx={ctx} ids={deps} />.
          </p>
        </>
      )}
    </div>
  );
}

function EdgeView({ ctx, source, target }: { ctx: Ctx; source: string; target: string }) {
  const evidence = edgeEvidence(ctx.state, source, target);
  const anyOf = ctx.state.steps[target]?.milestone;
  return (
    <div>
      <p className="pr-8 text-[15px] text-muted">{anyOf ? "One of the ways to get it" : "Why this order"}</p>
      <h2 className="mt-1 pr-8 text-[24px] font-bold leading-[1.25] text-ink">
        {anyOf ? (
          <>
            <StepLink ctx={ctx} id={source} /> gives you your {lower(ctx.state.steps[target]?.title ?? ctx.name(target))}
          </>
        ) : (
          <>
            <StepLink ctx={ctx} id={target} /> needs <StepLink ctx={ctx} id={source} /> first
          </>
        )}
      </h2>
      <div className="mt-5 space-y-5">
        {evidence.length ? (
          evidence.map((c, i) => <QuoteCard key={i} citation={c} n={ctx.n(c)} />)
        ) : (
          <p className="text-[16px] leading-relaxed text-muted">No single quote links these two steps directly; the order comes from the steps&apos; own requirements. Open either step to see its sources.</p>
        )}
      </div>
    </div>
  );
}

