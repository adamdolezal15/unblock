"use client";
import { useEffect, type RefObject } from "react";
import { onScrollFrame } from "@/lib/ui/scrollMotion";
import { useMotionAllowed } from "./useMotionAllowed";

/** Where on screen the reader is: a little below the middle. */
const READ_LINE = 0.55;

/**
 * Scroll progress on the Day by day rail: segments ([data-rail]) fill blue down to the reading line,
 * stations ([data-station]) above it get data-passed, the last of them data-current.
 * Without motion (narrow screens, reduced motion) nothing is set and the rail keeps its static look.
 */
export function useRailProgress(ref: RefObject<HTMLElement | null>, deps: unknown) {
  const motion = useMotionAllowed();
  useEffect(() => {
    const root = ref.current;
    if (!root || !motion) return;
    root.dataset.progress = "on";
    const off = onScrollFrame((_, h) => {
      const line = h * READ_LINE;
      for (const seg of root.querySelectorAll<HTMLElement>("[data-rail]")) {
        const r = seg.getBoundingClientRect();
        const f = r.height > 0 ? Math.min(1, Math.max(0, (line - r.top) / r.height)) : 0;
        seg.style.setProperty("--fill", `${(f * 100).toFixed(1)}%`);
      }
      let current: HTMLElement | null = null;
      for (const st of root.querySelectorAll<HTMLElement>("[data-station]")) {
        const r = st.getBoundingClientRect();
        const passed = r.top + r.height / 2 <= line;
        if (passed) current = st;
        st.toggleAttribute("data-passed", passed);
        st.removeAttribute("data-current");
      }
      current?.setAttribute("data-current", "");
    });
    return () => {
      off();
      delete root.dataset.progress;
      for (const seg of root.querySelectorAll<HTMLElement>("[data-rail]")) seg.style.removeProperty("--fill");
      for (const st of root.querySelectorAll<HTMLElement>("[data-station]")) {
        st.removeAttribute("data-passed");
        st.removeAttribute("data-current");
      }
    };
  }, [ref, motion, deps]);
}
