"use client";
import { useEffect, useState, type RefObject } from "react";
import { onScrollFrame } from "@/lib/ui/scrollMotion";
import { ringPath } from "@/lib/ui/contours";
import { fmtDay } from "@/lib/ui/format";
import { IconCheck } from "../icons";

/** Where on screen the reader is (same line as the rail's progress). */
const READ_LINE = 0.55;
const SIZE = 72;
const R = 33; // progress ring radius in a 72 box, stroke 3
const CIRC = 2 * Math.PI * R;
// Faint contours inside the badge, the page's lake rings in miniature.
const RINGS = [0, 1, 2].map((i) => ringPath({ cx: 36, cy: 36, r: 25, rings: 3, seed: 2.3, stretch: 1.25 }, i));

type State = { show: boolean; progress: number; date: string | null; visit: number; total: number; done: boolean };

/**
 * A floating badge bottom-right (1024px+ only) on the Day by day view: an outer Finnish-blue ring fills as
 * the reader scrolls the plan, the centre shows the plan's current date and "visit n of N", and it turns
 * green with a check once the finish is reached. Click: scroll to the next visit. Rows are the rail's
 * <li data-date> (data-visit on rows with a visit, data-done on the finish). Appears once the plan reaches
 * the top of the screen. Reduced motion: no transitions, the click jumps instead of gliding.
 */
export function JourneyCompass({ rail, deps }: { rail: RefObject<HTMLElement | null>; deps: unknown }) {
  const [s, setS] = useState<State>({ show: false, progress: 0, date: null, visit: 0, total: 0, done: false });

  useEffect(() => {
    const root = rail.current;
    if (!root) return;
    return onScrollFrame((_, h) => {
      const line = h * READ_LINE;
      const box = root.getBoundingClientRect();
      const rows = [...root.querySelectorAll<HTMLElement>(":scope > li[data-date]")];
      const count = (r: HTMLElement) => Number(r.dataset.visit ?? 0);
      const totalVisits = rows.reduce((a, r) => a + count(r), 0);

      let date: string | null = rows[0]?.dataset.date ?? null;
      let visit = 0;
      let done = false;
      for (const r of rows) {
        if (r.getBoundingClientRect().top > line) break;
        date = r.dataset.date ?? date;
        visit += count(r);
        if (r.hasAttribute("data-done")) done = true;
      }
      const progress = done ? 1 : box.height > 0 ? Math.min(1, Math.max(0, (line - box.top) / box.height)) : 0;
      const next: State = { show: box.top < 64 && rows.length > 0, progress, date, visit: Math.max(1, visit), total: totalVisits, done };
      setS((p) =>
        p.show === next.show && Math.abs(p.progress - next.progress) < 0.002 && p.date === next.date && p.visit === next.visit && p.total === next.total && p.done === next.done ? p : next,
      );
    });
  }, [rail, deps]);

  const goNext = () => {
    const root = rail.current;
    if (!root) return;
    const line = window.innerHeight * READ_LINE;
    const targets = [...root.querySelectorAll<HTMLElement>(":scope > li[data-visit], :scope > li[data-done]")];
    // The next visit below the reading line (a few px of slack so a row just reached is not chosen again).
    const t = targets.find((el) => el.getBoundingClientRect().top > line + 8) ?? targets[targets.length - 1];
    if (!t) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = window.scrollY + t.getBoundingClientRect().top - window.innerHeight * 0.3;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  };

  const n = s.total;
  const day = s.date ? fmtDay(s.date) : "";
  const label = s.done
    ? "Plan set up: you have reached the finish. Scroll to the finish."
    : `Your progress in the plan: ${day}${n > 0 ? `, visit ${s.visit} of ${n}` : ""}. Go to the next visit.`;

  return (
    <button
      type="button"
      onClick={goNext}
      aria-label={label}
      tabIndex={s.show ? 0 : -1}
      aria-hidden={!s.show}
      className={`fixed bottom-6 right-6 z-30 hidden rounded-full border border-hairline bg-surface shadow-[0_6px_20px_rgba(27,35,48,0.12)] transition-[opacity,transform] duration-300 hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none lg:block ${
        s.show ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0 motion-reduce:translate-y-0"
      }`}
      style={{ width: SIZE, height: SIZE }}
    >
      <svg aria-hidden className="absolute inset-0" width={SIZE} height={SIZE} viewBox="0 0 72 72" fill="none">
        <g stroke="var(--color-accent)" strokeOpacity={0.1} strokeWidth={1}>
          {RINGS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <circle cx={36} cy={36} r={R} stroke="var(--color-hairline)" strokeWidth={3} />
        <circle
          cx={36}
          cy={36}
          r={R}
          stroke={s.done ? "var(--color-done)" : "var(--color-accent)"}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - s.progress)}
          transform="rotate(-90 36 36)"
          className="transition-[stroke] duration-300 motion-reduce:transition-none"
        />
      </svg>
      <span aria-hidden className="relative flex h-full flex-col items-center justify-center leading-none">
        {s.done ? (
          <>
            <IconCheck className="h-5 w-5 text-done" />
            <span className="mt-1 text-[11px] font-bold text-done">Set up</span>
          </>
        ) : (
          <>
            <span className="num whitespace-nowrap text-[15px] font-bold text-ink">{day}</span>
            {n > 0 && (
              <span className="num mt-1 whitespace-nowrap text-[11px] text-muted">
                visit {s.visit} of {n}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}
