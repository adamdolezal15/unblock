"use client";
import { useEffect, useRef } from "react";
import { onScrollFrame } from "@/lib/ui/scrollMotion";
import { useMotionAllowed } from "./useMotionAllowed";

// Depth lines of two lakes, the way a Finnish basemap draws them: nested, uneven, never concentric.
const LAKES = [
  // west lake, three depths
  "M188 412c64-92 214-128 330-96 118 32 196 118 172 214-22 92-138 128-246 150-112 22-232 6-284-74-46-70-28-122 28-194z",
  "M262 438c52-58 156-78 232-52 80 28 118 86 98 148-20 62-102 86-178 96-80 10-158-8-188-62-24-46-6-80 36-130z",
  "M338 470c34-28 92-36 132-18 42 20 54 54 40 86-16 34-62 48-104 50-44 2-82-14-92-44-8-26 2-48 24-74z",
  // east lake, two depths, larger and lower
  "M930 880c96-74 262-86 380-30 120 58 168 170 122 270-46 98-178 140-312 146-138 6-266-34-312-128-42-86 26-186 122-258z",
  "M1010 930c72-46 186-52 266-12 82 42 108 116 74 180-34 62-124 90-214 92-92 2-176-26-204-86-24-54 12-122 78-174z",
  // a long shoreline crossing the lower left
  "M-40 1290c180-60 340-30 470 20 150 58 270 64 410 10 120-46 230-40 330 6v360H-40z",
];

/**
 * Faint lake contours fixed behind the page, drifting at 0.08 of the scroll. Purely decorative:
 * aria-hidden, no pointer events, behind everything, hidden below 640px, static under reduced motion.
 */
export function Contours() {
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

  return (
    <div aria-hidden className="contours pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden sm:block">
      <svg
        ref={ref}
        className="absolute left-0 top-0 h-[calc(100vh+600px)] w-full will-change-transform"
        viewBox="0 0 1440 1600"
        preserveAspectRatio="xMidYMin slice"
        fill="none"
        stroke="#003580"
        strokeOpacity={0.05}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      >
        {LAKES.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  );
}
