"use client";
// "Keep watching it": the browser side of /api/monitors. Nothing starts unless the person clicks.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicStore } from "@/lib/exa/monitorStore";

export type WatchState = {
  phase: "idle" | "starting" | "watching" | "error";
  store: PublicStore | null;
  /** A "Check now" is running (its runs are triggered, results not read yet). */
  checking: boolean;
  /** A check finished at least once in this page view: "no changes" may be said. */
  checkedAt: number | null;
  error: string | null;
};

const POLL_WHILE_PENDING_MS = 2500;
const POLL_WHEN_QUIET_MS = 60_000;
const GIVE_UP_MS = 90_000;

type Reply = { watching?: boolean; store?: PublicStore; error?: string };

async function call(url: string, init?: RequestInit): Promise<Reply> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json" } });
  const body = (await res.json().catch(() => ({}))) as Reply;
  if (!res.ok) throw new Error(body.error ?? "Something went wrong. Try again in a moment.");
  return body;
}

export function useMonitors(runId: string | undefined) {
  const [state, setState] = useState<WatchState>({ phase: "idle", store: null, checking: false, checkedAt: null, error: null });
  const alive = useRef(true);
  const waitingSince = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const apply = useCallback((r: Reply, wasChecking: boolean) => {
    if (!alive.current || !r.store) return;
    const pending = r.store.pending > 0;
    setState((s) => ({
      phase: "watching",
      store: r.store!,
      checking: pending,
      checkedAt: wasChecking && !pending ? Date.now() : s.checkedAt,
      error: null,
    }));
    waitingSince.current = pending ? (waitingSince.current ?? Date.now()) : null;
  }, []);

  const refresh = useCallback(
    async (wasChecking = false) => {
      if (!runId) return;
      try {
        const r = await call(`/api/monitors?runId=${encodeURIComponent(runId)}&sync=1`);
        if (r.watching) apply(r, wasChecking);
      } catch {
        // a quiet failure: the next poll tries again
      }
    },
    [runId, apply],
  );

  // A plan that is already watched (page reloaded, or webhook results arrived): show it, no click needed.
  useEffect(() => {
    if (!runId) return;
    void (async () => {
      try {
        const r = await call(`/api/monitors?runId=${encodeURIComponent(runId)}`);
        if (r.watching) apply(r, false);
      } catch {
        // stays idle
      }
    })();
  }, [runId, apply]);

  // Poll: fast while a run is pending (stops after a while), slowly otherwise so webhook results appear.
  useEffect(() => {
    if (state.phase !== "watching") return;
    const id = setInterval(
      () => {
        if (state.checking && waitingSince.current && Date.now() - waitingSince.current > GIVE_UP_MS) {
          setState((s) => ({ ...s, checking: false, error: "The check is taking longer than usual. It will appear here when it finishes." }));
          waitingSince.current = null;
          return;
        }
        void refresh(state.checking);
      },
      state.checking ? POLL_WHILE_PENDING_MS : POLL_WHEN_QUIET_MS,
    );
    return () => clearInterval(id);
  }, [state.phase, state.checking, refresh]);

  const watch = useCallback(async () => {
    if (!runId) return;
    setState((s) => ({ ...s, phase: "starting", error: null }));
    try {
      const r = await call("/api/monitors", { method: "POST", body: JSON.stringify({ runId }) });
      if (r.store) apply(r, false);
    } catch (e) {
      if (alive.current) setState((s) => ({ ...s, phase: "error", error: (e as Error).message }));
    }
  }, [runId, apply]);

  const checkNow = useCallback(async () => {
    if (!runId) return;
    setState((s) => ({ ...s, checking: true, error: null }));
    waitingSince.current = Date.now();
    try {
      const r = await call("/api/monitors/check", { method: "POST", body: JSON.stringify({ runId }) });
      if (r.store) apply(r, true);
    } catch (e) {
      waitingSince.current = null;
      if (alive.current) setState((s) => ({ ...s, checking: false, error: (e as Error).message }));
    }
  }, [runId, apply]);

  return { state, watch, checkNow };
}
