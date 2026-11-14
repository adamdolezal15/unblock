"use client";
import { useEffect, useRef, useState } from "react";

/** Wraps the finish marker: one soft ring pulse the first time it scrolls into view (CSS .end-pulse). */
export function PulseOnView({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <span ref={ref} className={`end-pulse relative block ${seen ? "end-pulse-on" : ""}`}>
      {children}
    </span>
  );
}
