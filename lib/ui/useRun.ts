"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialRunState, readNdjson, runReducer } from "./runState";

/** The live-run passcode for this tab (sessionStorage), sent with every run; demos ignore it. */
const PASSCODE_KEY = "unblock-passcode";
function storedPasscode(): string | undefined {
  try {
    return sessionStorage.getItem(PASSCODE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
function storePasscode(p: string | null) {
  try {
    if (p) sessionStorage.setItem(PASSCODE_KEY, p);
    else sessionStorage.removeItem(PASSCODE_KEY);
  } catch {
    // storage blocked: the passcode is still sent with this run
  }
}

/** Streams POST /api/run into RunState. Starting a new run aborts the previous one. */
export function useRun() {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const ctrl = useRef<AbortController | null>(null);

  const start = useCallback(async (text: string, opts: { fast?: boolean; passcode?: string } = {}) => {
    const t = text.trim();
    if (!t) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const passcode = opts.passcode?.trim() || storedPasscode();
    if (opts.passcode?.trim()) storePasscode(opts.passcode.trim());
    dispatch({ type: "start", text: t, at: Date.now() });
    try {
      const res = await fetch(opts.fast ? "/api/run?fast=1" : "/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passcode ? { text: t, passcode } : { text: t }),
        signal: c.signal,
      });
      if (!res.body) throw new Error(`the server answered ${res.status} with no content`);
      for await (const event of readNdjson(res.body)) {
        if (c.signal.aborted) return;
        if (event.type === "locked") storePasscode(null); // wrong or missing: ask again
        dispatch({ type: "event", event, at: Date.now() });
      }
      if (!c.signal.aborted) dispatch({ type: "end", at: Date.now() });
    } catch (err) {
      if (c.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "fail", message: `Could not reach the planner (${msg}). Check that the server is running and try again.`, at: Date.now() });
    }
  }, []);

  const reset = useCallback((keepText = false) => {
    ctrl.current?.abort();
    dispatch({ type: "reset", keepText });
  }, []);

  useEffect(() => () => ctrl.current?.abort(), []);

  return { state, start, reset };
}
