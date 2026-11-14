"use client";
import { useSyncExternalStore } from "react";
import { MOTION_QUERY } from "@/lib/ui/scrollMotion";

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(MOTION_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** True at 640px+ without prefers-reduced-motion. False on the server, so the static look renders first. */
export function useMotionAllowed() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOTION_QUERY).matches, () => false);
}
