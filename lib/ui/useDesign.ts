"use client";
// The result page's design: "Classic" (the original) or "Journey" (the Journey.dc.html mockup). Presentation only:
// both read the same run. ?design=journey|classic in the URL wins; else the last choice (localStorage); else Classic.
import { useCallback, useSyncExternalStore } from "react";

export const DESIGNS = [
  { id: "classic", label: "Classic" },
  { id: "journey", label: "Journey" },
] as const;
export type Design = (typeof DESIGNS)[number]["id"];
export const DEFAULT_DESIGN: Design = "classic";

const KEY = "unblock:design";
const EVENT = "unblock:design";

const isDesign = (v: string | null | undefined): v is Design => DESIGNS.some((d) => d.id === v);

/** The URL's ?design= when valid, else the stored choice when valid, else Classic. */
export function designFrom(search: string, stored: string | null): Design {
  const q = new URLSearchParams(search).get("design");
  if (isDesign(q)) return q;
  if (isDesign(stored)) return stored;
  return DEFAULT_DESIGN;
}

/** The URL with ?design= set to `d`, only when the URL already names a design (otherwise unchanged). */
export function urlWithDesign(href: string, d: Design): string {
  const u = new URL(href);
  if (!u.searchParams.has("design")) return href;
  u.searchParams.set("design", d);
  return u.toString();
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("popstate", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("popstate", cb);
    window.removeEventListener("storage", cb);
  };
}

export function useDesign(): [Design, (d: Design) => void] {
  const design = useSyncExternalStore(
    subscribe,
    () => designFrom(window.location.search, readStored()),
    () => DEFAULT_DESIGN,
  );
  const set = useCallback((d: Design) => {
    try {
      window.localStorage.setItem(KEY, d);
    } catch {
      // Private mode or blocked storage: the choice lasts for this page only (and the URL, if it names one).
    }
    const next = urlWithDesign(window.location.href, d);
    if (next !== window.location.href) window.history.replaceState(window.history.state, "", next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [design, set];
}
