"use client";
import type { RunState } from "@/lib/ui/runState";
import { runProgress } from "@/lib/ui/progress";
import { Favicon } from "./ActivityFeed";
import { LineMark } from "./line/LineMark";

/** While the plan is being built: one calm card with progress and the last few things the agent did. */
export function Working({ state }: { state: RunState }) {
  const { value, label } = runProgress(state);
  const pct = Math.round(value * 100);
  const recent = state.statuses.slice(-5);

  return (
    <section aria-live="polite" className="mx-auto mt-16 max-w-[560px] text-center">
      <LineMark spinning={state.phase === "running"} className="mx-auto mb-8 h-9 w-[284px]" />
      <h1 className="display text-[34px]">Working out your plan</h1>
      <p className="mt-2 text-[16px] text-muted">{label}…</p>
      <div className="mx-auto mt-6 flex max-w-[400px] items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
        <span className="num w-10 text-right text-[14px] text-muted">{pct}%</span>
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
