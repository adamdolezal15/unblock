"use client";
// The results view (Summary / Day by day / Map), kept in the URL hash so it survives reloads and
// can be linked. Default: Day by day.
import { useCallback, useSyncExternalStore } from "react";

export const VIEWS = [
  { id: "summary", label: "Summary" },
  { id: "days", label: "Day by day" },
  { id: "map", label: "Map" },
] as const;
export type View = (typeof VIEWS)[number]["id"];
export const DEFAULT_VIEW: View = "days";

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function viewFromHash(hash: string): View {
  const h = hash.replace(/^#/, "");
  return (VIEWS.find((v) => v.id === h)?.id ?? DEFAULT_VIEW) as View;
}

export function useView(): [View, (v: View) => void] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const set = useCallback((v: View) => {
    // replaceState does not fire hashchange; dispatch it so the store re-reads.
    window.history.replaceState(null, "", `#${v}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);
  return [viewFromHash(hash), set];
}
