"use client";
// The "Make it more accurate" answers, kept in the URL (?r=has_code,no_bank) so a reload or a shared link
// shows the same plan. Read with useSyncExternalStore; written with replaceState (no navigation, no request).
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseRefinements, REFINE_PARAM, serializeRefinements, type RefineKey } from "@/lib/refine/refine";

const CHANGED = "unblock:refinements";

function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("popstate", cb);
  };
}

/** Write the answers into the URL (other parameters and the #view stay), and tell every reader. */
export function writeRefinements(keys: readonly RefineKey[]) {
  const url = new URL(window.location.href);
  if (keys.length) url.searchParams.set(REFINE_PARAM, serializeRefinements(keys));
  else url.searchParams.delete(REFINE_PARAM);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(CHANGED));
}

export function useRefinements(): [RefineKey[], (keys: readonly RefineKey[]) => void] {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const keys = useMemo(() => parseRefinements(new URLSearchParams(search).get(REFINE_PARAM)), [search]);
  return [keys, useCallback((next) => writeRefinements(next), [])];
}
