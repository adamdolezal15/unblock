"use client";
// The plan as a metro map, in the line's visual language (components/line). Layout is pure and memoised
// (lib/ui/metroLayout); hover and selection only change classes, so nothing re-lays out or flickers.
import { useMemo, useState } from "react";
import type { Graph, ScheduledStep } from "@/lib/graph/types";
import type { Conflict, Step } from "@/lib/types";
import { LINE_H, layoutMetro, type MetroEdge, type MetroStation, type Point } from "@/lib/ui/metroLayout";
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

const R = 9; // corner radius
const TIP_GAP = 13; // arrow tip stops this far from the station's centre
const ARROW = { len: 7, half: 4 };

/** Route with rounded corners, shortened at the end so the arrowhead sits just before the station. */
function roundedPath(pts: Point[]): string {
  const p = [...pts];
  const n = p.length;
  const last = p[n - 1];
  const prev = p[n - 2];
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  const cut = TIP_GAP + ARROW.len - 1;
  p[n - 1] = { x: last.x - ((last.x - prev.x) / len) * cut, y: last.y - ((last.y - prev.y) / len) * cut };
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1];
    const b = p[i];
    const c = p[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(R, l1 / 2, l2 / 2);
    const s = { x: b.x - ((b.x - a.x) / l1) * r, y: b.y - ((b.y - a.y) / l1) * r };
    const e = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r };
    d += ` L${s.x} ${s.y} Q${b.x} ${b.y} ${e.x} ${e.y}`;
  }
  const end = p[p.length - 1];
  return `${d} L${end.x} ${end.y}`;
}

/** Small filled triangle at the target end, pointing along the last segment. */
function arrowHead(pts: Point[]): string {
  const b = pts[pts.length - 1];
  const a = pts[pts.length - 2];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const tip = { x: b.x - ux * TIP_GAP, y: b.y - uy * TIP_GAP };
  const base = { x: tip.x - ux * ARROW.len, y: tip.y - uy * ARROW.len };
  return `${tip.x},${tip.y} ${base.x - uy * ARROW.half},${base.y + ux * ARROW.half} ${base.x + uy * ARROW.half},${base.y - ux * ARROW.half}`;
}

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

  // Real bounding box of stations, their labels, routes and pills, so nothing is clipped at any width.
  const box = useMemo(() => {
    let x0 = 0, y0 = 0, x1 = L.width, y1 = L.height;
    for (const s of L.stations) {
      const ls = [...s.name.map((t) => t.length * 8.6), ...(s.office ?? []).map((t) => t.length * 7.8), ...(s.date ? [s.date.length * 7.8] : []), ...(s.estimate ? [60] : [])];
      const hw = Math.max(40, ...ls) / 2 + 6;
      x0 = Math.min(x0, s.x - hw);
      x1 = Math.max(x1, s.x + hw);
    }
    for (const e of L.edges) for (const q of e.points) { x0 = Math.min(x0, q.x - 8); x1 = Math.max(x1, q.x + 8); y0 = Math.min(y0, q.y - 8); y1 = Math.max(y1, q.y + 8); }
    for (const p of L.pills) { x0 = Math.min(x0, p.x - 4); x1 = Math.max(x1, p.x + p.w + 4); }
    return { x: x0 - 12, y: y0, w: x1 - x0 + 24, h: y1 - y0 };
  }, [L]);

  const open = (id: string) => onSelect({ kind: "step", id });
  const edgeEls = [...L.edges].sort((a, b) => Number(a.main) - Number(b.main));

  return (
    <div>
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMinYMin meet" className="block h-auto w-full" style={{ width: "100%" }} role="group" aria-label="Map of your plan">
        {/* Routes: the main line drawn last so it sits on top. */}
        <g>
          {edgeEls.map((e) => {
            const faded = !!focus && !touches(e);
            const sel = selectedEdge === e.id;
            const color = sel ? C.ink : e.main ? C.blue : touches(e) ? "#7d7768" : C.grey;
            return (
              <g
                key={e.id}
                className="cursor-pointer"
                style={{ opacity: faded ? 0.18 : 1, transition: "opacity 140ms" }}
                onClick={() => onSelect({ kind: "edge", id: e.id, source: e.source, target: e.target })}
              >
                <path d={roundedPath(e.points)} fill="none" stroke="transparent" strokeWidth={16} />
                <path d={roundedPath(e.points)} fill="none" stroke={color} strokeWidth={e.main ? LINE.main : touches(e) || sel ? 3 : LINE.branch} strokeLinecap="butt" strokeLinejoin="round" />
                <polygon points={arrowHead(e.points)} fill={color} />
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

        {/* One-line hint for the station under the pointer. */}
        {hover && <Hint s={L.stations.find((s) => s.id === hover)} width={L.width} />}
      </svg>
    </div>
  );
}

function Hint({ s, width }: { s?: MetroStation; width: number }) {
  if (!s) return null;
  const w = Math.min(s.hint.length * 6.9 + 20, width - 8);
  const x = Math.max(4, Math.min(s.x - w / 2, width - w - 4));
  const y = s.labelSide === "above" ? s.y + 20 : s.y - 44;
  return (
    <g pointerEvents="none" role="tooltip">
      <rect x={x} y={y} width={w} height={26} rx={6} fill={C.ink} />
      <text x={x + 10} y={y + 17.5} fontSize={13} fill={C.white}>
        {s.hint}
      </text>
    </g>
  );
}

function StationMark({ s, faded, selected, onEnter, onLeave, onOpen }: { s: MetroStation; faded: boolean; selected: boolean; onEnter: () => void; onLeave: () => void; onOpen: () => void }) {
  const lines = [...s.name.map((t) => ({ t, bold: true })), ...(s.office ?? []).map((t) => ({ t, bold: false })), ...(s.date ? [{ t: s.date, bold: false }] : []), ...(s.estimate ? [{ t: "estimate", bold: false }] : [])];
  const LH = LINE_H;
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

