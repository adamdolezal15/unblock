"use client";
// The logo: one ink line, three small ink dots, and the "either one is enough" diamond (Finnish blue outline)
// between dots 2 and 3, the only colored element. Static everywhere; while a plan is being worked out the
// diamond turns slowly (2 s per turn, linear). Reduced motion: no turn.
import { Interchange, Station } from "./primitives";
import { C, LINE } from "./spec";

const X = [12, 78, 208] as const; // dot 1, dot 2, dot 3
const MID = 143; // diamond, halfway between dots 2 and 3
const Y = 16;

export function LineMark({ spinning = false, className = "h-7 w-[220px]", label }: { spinning?: boolean; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 220 32" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <line x1={X[0]} y1={Y} x2={X[2]} y2={Y} stroke={C.ink} strokeWidth={LINE.branch} />
      {X.map((x) => (
        <Station key={x} x={x} y={Y} scale={0.7} />
      ))}
      <Interchange x={MID} y={Y} scale={1.25} color={C.blue} className={spinning ? "lm-spin" : undefined} />
    </svg>
  );
}
