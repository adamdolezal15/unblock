"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRun } from "@/lib/ui/useRun";
import type { RunState } from "@/lib/ui/runState";
import { buildLetter } from "@/lib/ui/letter";
import { correction } from "@/lib/ui/profileSentence";
import { ActivityFeed } from "./ActivityFeed";
import { Header, PROMISE } from "./Header";
import { GraphLegend, PlanGraph, type Selection } from "./graph/PlanGraph";
import { Closing } from "./letter/Closing";
import { LetterSkeleton, LetterView } from "./letter/LetterView";
import { ProfileSentence } from "./letter/ProfileSentence";
import { SourcesList } from "./letter/SourcesList";
import { RunInput } from "./RunInput";
import { ErrorState, LandingNote, OutOfScopeState, PartialNotice } from "./States";
import { SidePanel } from "./panel/SidePanel";
import { StepsPreview } from "./StepsPreview";

export function App() {
  const { state, start, reset } = useRun();
  const running = state.phase === "running";

  if (state.phase === "idle") {
    return (
      <main className="min-h-screen px-8 pb-24 pt-[12vh]">
        <div className="max-w-[760px]">
          <h1 className="font-serif text-[56px] font-semibold leading-none tracking-[-0.01em] text-ink">Unblock</h1>
          <p className="mb-10 mt-3 font-serif text-[24px] leading-snug text-muted">{PROMISE}</p>
          <RunInput key={state.runKey} value="" running={false} compact={false} onSubmit={start} />
          <LandingNote />
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <Header onHome={reset} />
      <RunInput key={state.runKey} value={state.text} running={running} compact onSubmit={start} />
      {state.phase === "out_of_scope" && <OutOfScopeState message={state.outOfScope ?? ""} />}
      {state.phase === "error" && state.stepOrder.length === 0 && <ErrorState message={state.error ?? "Something went wrong."} onRetry={() => start(state.text)} />}
      {(running || state.phase === "done" || (state.phase === "error" && state.stepOrder.length > 0)) && (
        <Results state={state} onRerun={(t) => start(t)} />
      )}
    </div>
  );
}

function Results({ state, onRerun }: { state: RunState; onRerun: (text: string) => void }) {
  const running = state.phase === "running";
  const doc = useMemo(() => buildLetter(state), [state]);

  // Feed collapses by itself when the run is done; the user can reopen it (per run).
  const [feedPref, setFeedPref] = useState<{ runKey: number; collapsed: boolean } | null>(null);
  const collapsed = feedPref?.runKey === state.runKey ? feedPref.collapsed : state.phase === "done";
  const elapsed = state.summary?.totalMs ?? (state.finishedAt ? state.finishedAt - state.startedAt : undefined);

  // Map selection (per run).
  const [sel, setSel] = useState<{ runKey: number; selection: Selection }>({ runKey: 0, selection: null });
  const selection = sel.runKey === state.runKey ? sel.selection : null;
  const runKey = state.runKey;
  const select = useCallback((selection: Selection) => setSel({ runKey, selection }), [runKey]);
  const mapRef = useRef<HTMLElement>(null);
  const openStep = (id: string) => select({ kind: "step", id });

  const steps = state.stepOrder.map((id) => state.steps[id]);

  return (
    <main className="px-8">
      <div className="grid gap-x-14 gap-y-8 pt-8 lg:grid-cols-[minmax(0,680px)_minmax(260px,380px)]">
        <article className="min-w-0 space-y-8">
          {state.profile ? (
            <ProfileSentence
              profile={state.profile}
              text={state.text}
              disabled={running}
              onCorrect={(field, value) => onRerun(`${state.text} ${correction(field, value, state.profile!.assumptions)}`)}
            />
          ) : (
            <div className="skeleton h-5 w-3/4 rounded" aria-hidden />
          )}
          {doc.letter ? <LetterView letter={doc.letter} onShow={openStep} /> : <LetterSkeleton />}
          {state.partial && <PartialNotice message={state.partial.message} missing={state.partial.missing} />}
          {state.error && <p className="text-[17px] text-ink">{state.error}</p>}
          {state.summary && <Closing summary={state.summary} />}
        </article>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ActivityFeed
            statuses={state.statuses}
            notes={state.notes}
            running={running}
            elapsedMs={elapsed}
            collapsed={collapsed}
            onToggle={() => setFeedPref({ runKey: state.runKey, collapsed: !collapsed })}
          />
        </aside>
      </div>

      <section ref={mapRef} aria-labelledby="map" className="mt-16 scroll-mt-4 border-t border-rule pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <div>
            <h2 id="map" className="font-serif text-[26px] font-semibold text-ink">
              Your map
            </h2>
            <p className="mt-1 text-[16px] text-muted">
              {state.graph
                ? "Time runs left to right, one row per office. Click a step or an arrow to see the sources behind it."
                : "Steps appear here as I confirm them."}
            </p>
          </div>
          {state.graph && <GraphLegend />}
        </div>
        <div className="mt-5">
          {state.graph ? (
            <div className="h-[clamp(420px,68vh,640px)]">
              <PlanGraph
                graph={state.graph.graph}
                steps={state.steps}
                items={state.schedule?.schedule.items}
                criticalPath={state.schedule?.criticalPath.stepIds}
                conflicts={state.conflicts}
                deadlocks={state.graph.deadlocks}
                selection={selection}
                onSelect={select}
              />
            </div>
          ) : (
            <StepsPreview steps={steps} stubs={state.stubs} running={running} items={state.schedule?.schedule.items} />
          )}
          {state.graph && state.stubs.length > 0 && (
            <ul className="mt-4 space-y-1 text-[15px] text-muted">
              {state.stubs.map((s) => (
                <li key={s.id}>
                  <span className="font-semibold text-ink">{s.label}:</span> {s.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {state.phase === "done" && doc.sources.length > 0 && (
        <div className="mt-16">
          <SourcesList sources={doc.sources} />
        </div>
      )}
      {selection && <SidePanel state={state} doc={doc} selection={selection} onSelect={select} />}
    </main>
  );
}
