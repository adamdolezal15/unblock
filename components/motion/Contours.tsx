"use client";
import { useEffect, useRef } from "react";
import { onScrollFrame } from "@/lib/ui/scrollMotion";
import { HERO_DEEP, HERO_LAKES, lakeRings, MOBILE_LAKES, RESULT_LAKES, ringPath } from "@/lib/ui/contours";
import { C } from "../line/spec";
import { useMotionAllowed } from "./useMotionAllowed";

// Precomputed once: the same strings on the server and in the browser.
const HERO = HERO_LAKES.flatMap(lakeRings);
const HERO_FILL = ringPath(HERO_DEEP, HERO_DEEP.rings - 1);
const RESULT = RESULT_LAKES.flatMap(lakeRings);
const MOBILE = MOBILE_LAKES.flatMap(lakeRings);

/**
 * Lake contours fixed behind the page, with slow scroll parallax (0.08) and, on the homepage, a 40 s ambient
 * drift of a few px. Decoration only: aria-hidden, no pointer events, behind everything. Reduced motion:
 * static. Below 640px: four rings at half opacity, static.
 */
export function Contours({ variant }: { variant: "hero" | "result" }) {
  const ref = useRef<SVGSVGElement>(null);
  const motion = useMotionAllowed();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!motion) {
      el.style.transform = "";
      return;
    }
    return onScrollFrame((y) => {
      el.style.transform = `translate3d(0, ${-Math.min(y * 0.08, 560).toFixed(1)}px, 0)`;
    });
  }, [motion]);

  const hero = variant === "hero";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 640px and up */}
      <svg
        ref={ref}
        className={`absolute left-0 top-0 hidden w-full will-change-transform sm:block ${hero ? "h-[calc(100vh+120px)]" : "h-[calc(100vh+600px)]"}`}
        viewBox={hero ? "0 0 1440 1020" : "0 0 1440 1500"}
        preserveAspectRatio="xMidYMin slice"
        fill="none"
      >
        <g className={hero ? "contour-drift" : undefined} stroke={C.blue} strokeWidth={1} strokeOpacity={hero ? 0.12 : 0.08}>
          {hero && <path d={HERO_FILL} fill={C.blue} fillOpacity={0.03} stroke="none" />}
          {(hero ? HERO : RESULT).map((d, i) => (
            <path key={i} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
      {/* below 640px: static, four rings, half opacity */}
      <svg className="absolute inset-0 h-full w-full sm:hidden" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" fill="none">
        <g stroke={C.blue} strokeWidth={1} strokeOpacity={hero ? 0.06 : 0.04}>
          {MOBILE.map((d, i) => (
            <path key={i} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
    </div>
  );
}

const RING_OUT = ringPath({ cx: 200, cy: 80, r: 62, rings: 1, seed: 1.9, stretch: 2.9 }, 0);

/** One contour ring behind the plan's finish date (6%). Behind the text, never moves. */
export function DateRing() {
  return (
    <svg aria-hidden className="pointer-events-none absolute -left-12 -top-7 -z-10 hidden h-[150px] sm:block w-[400px]" viewBox="0 0 400 150" fill="none">
      <path d={RING_OUT} stroke={C.blue} strokeOpacity={0.06} strokeWidth={1.5} />
    </svg>
  );
}
