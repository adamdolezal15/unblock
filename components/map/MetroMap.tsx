"use client";
// The plan as a metro map, in the line's visual language (components/line). Layout is pure and memoised
// (lib/ui/metroLayout); hover and selection only change classes, so nothing re-lays out or flickers.
import { useMemo, useState } from "react";
import type { Graph, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step } from "@/lib/types";
import { layoutMetro, type MetroEdge, type MetroStation, type Point } from "@/lib/ui/metroLayout";
import type { Selection } from "@/lib/ui/selection";
import { Interchange, Station } from "../line/primitives";
import { C, LINE } from "../line/spec";

type Props = {
  graph: Graph;
  steps: Record<string, Step>;
  items?: Record<string, ScheduledStep>;
  criticalPath?: string[];
  conflicts: Conflict[];
  selection: Selection;
  onSelect: (s: Selection) => void;
};

const path = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");

export function MetroMap({ graph, steps, items, criticalPath, conflicts, selection, onSelect }: Props) {
  const L = useMemo(() => layoutMetro({ graph, steps, items, criticalPath, conflicts, width: 1000 }), [graph, steps, items, criticalPath, conflicts]);
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? (selection?.kind === "step" ? selection.id : null);
  const near = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of L.edges) {
      if (e.source === focus) s.add(e.target);
      if (e.target === focus) s.add(e.source);
    }
    return s;
  }, [focus, L]);
  const touches = (e: MetroEdge) => !!focus && (e.source === focus || e.target === focus);
  const selectedEdge = selection?.kind === "edge" ? selection.id : null;

  const open = (id: string) => onSelect({ kind: "step", id });
  const edgeEls = [...L.edges].sort((a, b) => Number(a.main) - Number(b.main));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${L.width} ${L.height}`} className="block h-auto w-full" style={{ minWidth: L.width > 1000 ? L.width : undefined }} role="group" aria-label="Map of your plan">
        {/* Routes: the main line drawn last so it sits on top. */}
        <g>
          {edgeEls.map((e) => {
            const faded = !!focus && !touches(e);
            const sel = selectedEdge === e.id;
            return (
              <g
                key={e.id}
                className="cursor-pointer"
                style={{ opacity: faded ? 0.18 : 1, transition: "opacity 140ms" }}
                onClick={() => onSelect({ kind: "edge", id: e.id, source: e.source, target: e.target })}
              >
                <path d={path(e.points)} fill="none" stroke="transparent" strokeWidth={16} />
                <path
                  d={path(e.points)}
                  fill="none"
                  stroke={sel ? C.ink : e.main ? C.blue : touches(e) ? "#7d7768" : C.grey}
                  strokeWidth={e.main ? LINE.main : touches(e) || sel ? 3 : LINE.branch}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </g>

        {/* Shared visits: one pill around both stations. */}
        {L.pills.map((p) => (
          <rect key={p.id} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.h / 2} fill={C.white} stroke={C.ink} strokeOpacity={0.35} strokeWidth={1.5} />
        ))}

        {L.stations.map((s) => (
          <StationMark
            key={s.id}
            s={s}
            faded={!!near && !near.has(s.id)}
            selected={selection?.kind === "step" && selection.id === s.id}
            onEnter={() => setHover(s.id)}
            onLeave={() => setHover(null)}
            onOpen={() => open(s.id)}
          />
        ))}
      </svg>
    </div>
  );
}

function StationMark({ s, faded, selected, onEnter, onLeave, onOpen }: { s: MetroStation; faded: boolean; selected: boolean; onEnter: () => void; onLeave: () => void; onOpen: () => void }) {
  const lines = [...s.name.map((t) => ({ t, bold: true })), ...(s.office ? [{ t: s.office, bold: false }] : []), ...(s.date ? [{ t: s.date, bold: false }] : []), ...(s.estimate ? [{ t: "estimate", bold: false }] : [])];
  const LH = 16;
  const top = s.labelSide === "above" ? s.y - 18 - (lines.length - 1) * LH : s.y + 28;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${s.name.join(" ")}${s.date ? `, ${s.date}` : ""}: show details`}
      className="metro-station cursor-pointer"
      style={{ opacity: faded ? 0.3 : 1, transition: "opacity 140ms" }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <rect x={s.x - 40} y={Math.min(top - 14, s.y - 16)} width={80} height={Math.abs(s.y - top) + 34 + (s.labelSide === "below" ? lines.length * LH : 0)} fill="transparent" />
      {selected && <circle cx={s.x} cy={s.y} r={15} fill={C.lake} />}
      {s.conflict && <circle cx={s.x} cy={s.y} r={12} fill="none" stroke={C.amber} strokeWidth={3} />}
      {s.kind === "interchange" ? <Interchange x={s.x} y={s.y} scale={1.15} /> : <Station x={s.x} y={s.y} main={s.main} hollow={s.hollow} done={s.done} />}
      <text x={s.x} y={top} textAnchor="middle" className="metro-label" style={{ paintOrder: "stroke" }} stroke={C.paper} strokeWidth={4} strokeLinejoin="round">
        {lines.map((l, i) => (
          <tspan key={i} x={s.x} dy={i === 0 ? 0 : LH} fontSize={14} fontWeight={l.bold ? 700 : 400} fill={l.bold ? (s.main ? C.blue : C.ink) : "#4a5566"}>
            {l.t}
          </tspan>
        ))}
      </text>
    </g>
  );
}

