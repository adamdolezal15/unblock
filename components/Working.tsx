"use client";
import type { RunState } from "@/lib/ui/runState";
import { Favicon } from "./ActivityFeed";

/** While the plan is being built: one calm card with progress and the last few things the agent did. */
export function Working({ state }: { state: RunState }) {
  const found = state.stepOrder.filter((id) => !state.steps[id].milestone).length;
  const stage = !state.profile ? 0 : !state.graph ? 1 : !state.schedule ? 2 : 3;
  const pct = [8, 20 + Math.min(found, 9) * 4, 70, 92][stage];
  const label = [
    "Reading your situation",
    `Reading official sources · ${found} ${found === 1 ? "step" : "steps"} confirmed`,
    "Checking what people who did it say",
    "Cross-checking sources",
  ][stage].replace(" · ", ", ");
  const recent = state.statuses.slice(-5);

  return (
    <section aria-live="polite" className="mx-auto mt-16 max-w-[560px] text-center">
      <h1 className="font-serif text-[34px] font-semibold text-ink">Working out your plan</h1>
      <p className="mt-2 text-[16px] text-muted">{label}…</p>
      <div className="mx-auto mt-6 h-1.5 max-w-[360px] overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mx-auto mt-8 max-w-[520px] space-y-1 rounded-[12px] border border-rule bg-raised px-5 py-4 text-left">
        {recent.length === 0 && <li className="text-[14px] text-muted">Starting…</li>}
        {recent.map((s, i) => (
          <li key={s.id} className={`flex items-start gap-2.5 py-0.5 text-[14px] leading-5 ${i === recent.length - 1 ? "text-ink" : "text-muted"}`}>
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {s.domain ? <Favicon domain={s.domain} /> : <span className={`h-1.5 w-1.5 rounded-full ${i === recent.length - 1 ? "animate-pulse bg-accent" : "bg-rule-strong"}`} />}
            </span>
            <span className="min-w-0">{s.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
