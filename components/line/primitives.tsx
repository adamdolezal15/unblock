// SVG building blocks of the line, drawn exactly the same everywhere (logo, hero, Day by day, map).
import { C, DIAMOND, STATION, TERMINUS } from "./spec";

type P = { x: number; y: number };

/** A station. Filled ink, or blue on the slowest chain; hollow when the date is an estimate or it is online. */
export function Station({ x, y, main = false, hollow = false, lit = false, done = false, scale = 1 }: P & { main?: boolean; hollow?: boolean; lit?: boolean; done?: boolean; scale?: number }) {
  const r = STATION.r * scale;
  const color = done ? C.green : main || lit ? C.blue : C.ink;
  return (
    <g>
      <circle cx={x} cy={y} r={r + STATION.halo * scale} fill={C.paper} />
      {hollow ? (
        <circle cx={x} cy={y} r={r - (STATION.hollowStroke * scale) / 2} fill={C.paper} stroke={color} strokeWidth={STATION.hollowStroke * scale} />
      ) : (
        <circle cx={x} cy={y} r={r} fill={color} />
      )}
    </g>
  );
}

/** "Either one is enough": the diamond. */
export function Interchange({ x, y, lit = false, scale = 1, className }: P & { lit?: boolean; scale?: number; className?: string }) {
  const s = DIAMOND.size * scale;
  return (
    <g className={className} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
      <rect
        x={x - s / 2}
        y={y - s / 2}
        width={s}
        height={s}
        transform={`rotate(45 ${x} ${y})`}
        fill={lit ? C.lake : C.paper}
        stroke={lit ? C.blue : C.ink}
        strokeWidth={DIAMOND.stroke * scale}
      />
    </g>
  );
}

/** The end of the line: "Set up". */
export function Terminus({ x, y, scale = 1, checkClass, done = true }: P & { scale?: number; checkClass?: string; done?: boolean }) {
  const r = TERMINUS.r * scale;
  const k = scale;
  return (
    <g>
      <circle cx={x} cy={y} r={r + STATION.halo * scale} fill={C.paper} />
      <circle cx={x} cy={y} r={r} fill={done ? C.blue : C.paper} stroke={C.blue} strokeWidth={done ? 0 : STATION.hollowStroke * scale} />
      {done && (
        <path
          className={checkClass}
          d={`M${x - 3.6 * k} ${y + 0.2 * k} l${2.6 * k} ${2.6 * k} l${4.9 * k} ${-5.2 * k}`}
          fill="none"
          stroke={C.paper}
          strokeWidth={TERMINUS.check * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}
