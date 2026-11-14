"use client";
// Drafts in the browser: which ones this plan can offer, and one shared store per run so a draft prepared
// from a day card shows the same text in the "Ready to send" section.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { draftOffers, type Draft, type DraftOffer, type DraftSource } from "@/lib/agent/draftOffers";
import { isReplaying, type RunState } from "./runState";

/** The run cut down to what drafts read (POST /api/drafts). Steps in run order, communityTips left out. */
export function draftSource(state: RunState): DraftSource | null {
  const profile = state.profile?.profile;
  if (!profile || state.phase !== "done") return null;
  const items = state.schedule?.schedule.items ?? {};
  return {
    profile,
    steps: state.stepOrder.map((id) => state.steps[id]).filter(Boolean).map((s) => {
        const slim = { ...s };
        delete slim.communityTips;
        return slim;
      }),
    conflicts: state.conflicts,
    dates: Object.fromEntries(Object.entries(items).map(([id, it]) => [id, it.startDate])),
    visits: Object.fromEntries(Object.entries(items).flatMap(([id, it]) => (it.visitId ? [[id, it.visitId]] : []))),
  };
}

export type DraftEntry = { status: "idle" | "loading" | "ready" | "error"; draft?: Draft; error?: string };
export type DraftsApi = {
  offers: DraftOffer[];
  forStep: (stepId: string) => DraftOffer[];
  get: (offerId: string) => DraftEntry;
  prepare: (offerId: string) => Promise<void>;
};

export function useDrafts(state: RunState): DraftsApi {
  const source = useMemo(() => draftSource(state), [state]);
  const offers = useMemo(() => (source ? draftOffers(source) : []), [source]);
  const [store, setStore] = useState<{ runKey: number; entries: Record<string, DraftEntry> }>({ runKey: state.runKey, entries: {} });
  const entries = store.runKey === state.runKey ? store.entries : {};
  const set = useCallback(
    (id: string, e: DraftEntry) => setStore((s) => ({ runKey: state.runKey, entries: { ...(s.runKey === state.runKey ? s.entries : {}), [id]: e } })),
    [state.runKey],
  );

  const prepare = useCallback(
    async (offerId: string) => {
      if (!source) return;
      set(offerId, { status: "loading" });
      try {
        const res = await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId, source }) });
        const json = (await res.json()) as { draft?: Draft; error?: string };
        if (!res.ok || !json.draft) set(offerId, { status: "error", error: json.error ?? "The draft could not be prepared." });
        else set(offerId, { status: "ready", draft: json.draft });
      } catch {
        set(offerId, { status: "error", error: "The draft could not be prepared. Check your connection and try again." });
      }
    },
    [source, set],
  );

  // A saved demo replay: its drafts are in demo-cache, so load them all up front (no click, no live call).
  const replay = isReplaying(state.statuses);
  const asked = useRef<{ runKey: number; ids: Set<string> }>({ runKey: -1, ids: new Set() });
  useEffect(() => {
    if (!replay || !source) return;
    if (asked.current.runKey !== state.runKey) asked.current = { runKey: state.runKey, ids: new Set() };
    for (const o of offers) {
      if (asked.current.ids.has(o.id)) continue;
      asked.current.ids.add(o.id);
      void prepare(o.id);
    }
  }, [replay, source, offers, prepare, state.runKey]);

  return {
    offers,
    forStep: (stepId) => offers.filter((o) => o.stepId === stepId),
    get: (offerId) => entries[offerId] ?? { status: "idle" },
    prepare,
  };
}
