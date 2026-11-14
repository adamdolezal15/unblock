"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialRunState, readNdjson, runReducer } from "./runState";

/** Streams POST /api/run into RunState. Starting a new run aborts the previous one. */
export function useRun() {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const ctrl = useRef<AbortController | null>(null);

  const start = useCallback(async (text: string, opts: { fast?: boolean } = {}) => {
    const t = text.trim();
    if (!t) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    dispatch({ type: "start", text: t, at: Date.now() });
    try {
      const res = await fetch(opts.fast ? "/api/run?fast=1" : "/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
        signal: c.signal,
      });
      if (!res.body) throw new Error(`the server answered ${res.status} with no content`);
      for await (const event of readNdjson(res.body)) {
        if (c.signal.aborted) return;
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
