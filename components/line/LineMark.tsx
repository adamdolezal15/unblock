"use client";
// The logo is the product: a route of steps, an "either one is enough" diamond, and the finish.
// Static everywhere. The only motion: while a plan is being worked out the diamond turns slowly
// (2 s per turn, linear); it stops in its normal position when the run ends. Reduced motion: no turn.
import { Interchange, Station, Terminus } from "./primitives";
import { C, LINE } from "./spec";

const X = [10, 58, 106, 160] as const;
const END = 206;
const Y = 14;

export function LineMark({ spinning = false, className = "h-7 w-[220px]", label }: { spinning?: boolean; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 220 28" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <line x1={X[0]} y1={Y} x2={X[3]} y2={Y} stroke={C.grey} strokeWidth={LINE.branch} />
      <line x1={X[3]} y1={Y} x2={END} y2={Y} stroke={C.blue} strokeWidth={LINE.main} strokeLinecap="round" />
      <Station x={X[0]} y={Y} scale={0.75} />
      <Station x={X[1]} y={Y} scale={0.75} />
      <Station x={X[3]} y={Y} scale={0.75} />
      <Terminus x={END} y={Y} scale={0.85} />
      <Interchange x={X[2]} y={Y} scale={0.9} className={spinning ? "lm-spin" : undefined} />
    </svg>
  );
}
