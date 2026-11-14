"use client";
// The logo is the product: a route of steps, an "either one is enough" diamond, and the finish.
// It mirrors what the planner is doing. Motion uses transform / opacity only (CSS in globals.css,
// .lm-*), and prefers-reduced-motion turns it off.
import { useId } from "react";
import { Interchange, Station, Terminus } from "./primitives";
import { C, LINE } from "./spec";

export type MarkMode = "idle" | "typing" | "running" | "done" | "error";

type Props = {
  mode: MarkMode;
  /** typing: which of citizenship / city / date / purpose are mentioned (stations light up). */
  lit?: [boolean, boolean, boolean, boolean];
  /** running: changes on every status event; each change sends one pulse along the line. */
  pulse?: number;
  /** running: the plan's shape is known (graph event): the diamond turns. */
  turned?: boolean;
  className?: string;
  label?: string;
};

const X = [10, 58, 106, 160] as const;
const END = 206;
const Y = 14;

export function LineMark({ mode, lit = [false, false, false, false], pulse = 0, turned = false, className = "h-7 w-[220px]", label }: Props) {
  const clip = useId().replace(/:/g, "");
  const showLit = mode === "typing";
  return (
    <svg viewBox="0 0 220 28" className={`linemark linemark--${mode} ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <clipPath id={`lm-${clip}`}>
          <rect x={X[0]} y={Y - 3} width={END - X[0]} height={6} />
        </clipPath>
      </defs>

      <g className="lm-left">
        <line x1={X[0]} y1={Y} x2={X[2]} y2={Y} stroke={C.grey} strokeWidth={LINE.branch} />
        <Station x={X[0]} y={Y} lit={showLit && lit[0]} scale={0.75} />
        <Station x={X[1]} y={Y} lit={showLit && lit[1]} scale={0.75} />
      </g>
      <g className="lm-right">
        <line x1={X[2]} y1={Y} x2={X[3]} y2={Y} stroke={C.grey} strokeWidth={LINE.branch} />
        <line x1={X[3]} y1={Y} x2={END} y2={Y} stroke={C.blue} strokeWidth={LINE.main} strokeLinecap="round" />
        <Station x={X[3]} y={Y} lit={showLit && lit[3]} scale={0.75} />
        <Terminus x={END} y={Y} scale={0.85} done={mode !== "running"} checkClass={mode === "done" ? "lm-check-draw" : undefined} />
      </g>
      <Interchange key={turned ? "turned" : "still"} x={X[2]} y={Y} lit={showLit && lit[2]} scale={0.9} className={`lm-diamond ${turned && mode === "running" ? "lm-turn" : ""}`} />

      {(mode === "idle" || mode === "typing") && (
        <g clipPath={`url(#lm-${clip})`}>
          <rect className="lm-shimmer" x={X[0] - 30} y={Y - 2} width={30} height={4} fill={C.lake} />
        </g>
      )}
      {mode === "running" && <circle key={pulse} className="lm-pulse" cx={X[0]} cy={Y} r={3.2} fill={C.blue} />}
    </svg>
  );
}
