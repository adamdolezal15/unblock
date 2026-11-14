"use client";
import type { RunState } from "@/lib/ui/runState";
import type { Selection } from "@/lib/ui/selection";
import { Term } from "../Help";
import { Interchange, Station } from "../line/primitives";
import { C, LINE } from "../line/spec";
import { MetroMap } from "../map/MetroMap";
import { StepsPreview } from "../StepsPreview";

/** Legend drawn with the map's own parts. */
function Legend() {
  const item = "flex items-center gap-2";
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] text-muted">
      <li className={item}>
        <svg width="44" height="16" aria-hidden>
          <line x1="2" y1="8" x2="42" y2="8" stroke={C.blue} strokeWidth={LINE.main} strokeLinecap="round" />
          <Station x={22} y={8} main />
        </svg>
        <Term term="slowest" long />
      </li>
      <li className={item}>
        <svg width="20" height="20" aria-hidden>
          <Interchange x={10} y={10} />
        </svg>
        <Term term="either" />
      </li>
      <li className={item}>
        <svg width="44" height="20" aria-hidden>
          <rect x="1" y="2" width="42" height="16" rx="8" fill={C.white} stroke={C.ink} strokeOpacity={0.35} strokeWidth={1.5} />
          <Station x={12} y={10} scale={0.7} />
          <Station x={32} y={10} scale={0.7} />
        </svg>
        <Term term="oneVisit" />
      </li>
      <li className={item}>
        <svg width="24" height="24" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="none" stroke={C.amber} strokeWidth={2.5} />
          <Station x={12} y={12} scale={0.8} />
        </svg>
        <Term term="disagree" long />
      </li>
      <li className={item}>
        <svg width="18" height="18" aria-hidden>
          <Station x={9} y={9} hollow />
        </svg>
        <Term term="estimate" />
      </li>
    </ul>
  );
}

export function MapView({ state, selection, onSelect }: { state: RunState; selection: Selection; onSelect: (s: Selection) => void }) {
  const running = state.phase === "running";
  return (
    <section aria-label="Map">
      <p className="max-w-[680px] text-[16px] text-muted">
        {state.graph ? "Your plan as a metro line. The blue line decides when you are done; grey routes branch off it. Click a station for its sources." : "Stations appear here as I confirm them."}
      </p>
      <div className="mt-4">{state.graph && <Legend />}</div>
      <div className="mt-6">
        {state.graph ? (
          <MetroMap
            graph={state.graph.graph}
            steps={state.steps}
            items={state.schedule?.schedule.items}
            criticalPath={state.schedule?.criticalPath.stepIds}
            conflicts={state.conflicts}
            selection={selection}
            onSelect={onSelect}
          />
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
