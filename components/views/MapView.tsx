"use client";
import type { RunState } from "@/lib/ui/runState";
import { GraphLegend, PlanGraph, type Selection } from "../graph/PlanGraph";
import { StepsPreview } from "../StepsPreview";

export function MapView({ state, selection, onSelect }: { state: RunState; selection: Selection; onSelect: (s: Selection) => void }) {
  const running = state.phase === "running";
  return (
    <section aria-label="Map">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <p className="max-w-[680px] text-[16px] text-muted">
          {state.graph ? "Time runs left to right, one row per office. Click a step or an arrow to see the sources behind it." : "Steps appear here as I confirm them."}
        </p>
        {state.graph && <GraphLegend />}
      </div>
      <div className="mt-5">
        {state.graph ? (
          <div className="h-[clamp(420px,70vh,680px)]">
            <PlanGraph
              graph={state.graph.graph}
              steps={state.steps}
              items={state.schedule?.schedule.items}
              criticalPath={state.schedule?.criticalPath.stepIds}
              conflicts={state.conflicts}
              deadlocks={state.graph.deadlocks}
              selection={selection}
              onSelect={onSelect}
            />
          </div>
        ) : (
          <StepsPreview steps={state.stepOrder.map((id) => state.steps[id])} stubs={state.stubs} running={running} items={state.schedule?.schedule.items} />
        )}
        {state.graph && state.stubs.length > 0 && (
          <ul className="mt-4 space-y-1 text-[15px] text-muted">
            {state.stubs.map((s) => (
              <li key={s.id}>
                <span className="font-semibold text-ink">{s.label}:</span> {s.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
