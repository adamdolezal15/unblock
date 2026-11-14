"use client";
import { useCallback, useMemo, useState } from "react";
import { useRun } from "@/lib/ui/useRun";
import type { RunState } from "@/lib/ui/runState";
import { buildLetter } from "@/lib/ui/letter";
import { correction } from "@/lib/ui/profileSentence";
import { useView } from "@/lib/ui/useView";
import { compareWithUsual } from "@/lib/ui/compare";
import { ActivityFeed } from "./ActivityFeed";
import { Header, PROMISE } from "./Header";
import type { Selection } from "./graph/PlanGraph";
import { Closing } from "./letter/Closing";
import { LetterSkeleton, LetterView, Prose } from "./letter/LetterView";
import { ProfileSentence } from "./letter/ProfileSentence";
import { SourcesList } from "./letter/SourcesList";
import { RunInput } from "./RunInput";
import { ErrorState, LandingNote, OutOfScopeState, PartialNotice } from "./States";
import { SidePanel } from "./panel/SidePanel";
import { StepsPreview } from "./StepsPreview";
import { DayByDay } from "./views/DayByDay";
import { Insights } from "./views/Insights";
import { MapView } from "./views/MapView";
import { ViewTabs } from "./ViewTabs";

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
  const [view, setView] = useView();
  const comparison = useMemo(() => compareWithUsual(state, doc.ref), [state, doc]);

  // Feed collapses by itself when the run is done; the user can reopen it (per run).
  const [feedPref, setFeedPref] = useState<{ runKey: number; collapsed: boolean } | null>(null);
  const collapsed = feedPref?.runKey === state.runKey ? feedPref.collapsed : state.phase === "done";
  const elapsed = state.summary?.totalMs ?? (state.finishedAt ? state.finishedAt - state.startedAt : undefined);

  // Selection for the details drawer (per run). Clicking a step in any view opens it.
  const [sel, setSel] = useState<{ runKey: number; selection: Selection }>({ runKey: 0, selection: null });
  const selection = sel.runKey === state.runKey ? sel.selection : null;
  const runKey = state.runKey;
  const select = useCallback((selection: Selection) => setSel({ runKey, selection }), [runKey]);
  const openStep = useCallback((id: string) => select({ kind: "step", id }), [select]);

  return (
    <main className="px-8">
      <div className="grid gap-x-14 gap-y-8 pt-8 lg:grid-cols-[minmax(0,880px)_minmax(240px,340px)]">
        <div className="min-w-0 space-y-7">
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
          <ViewTabs view={view} onChange={setView} />
          {state.partial && <PartialNotice message={state.partial.message} missing={state.partial.missing} />}
          {state.error && <p className="text-[17px] text-ink">{state.error}</p>}
          {view === "summary" && (doc.letter ? <LetterView letter={doc.letter} onShow={openStep} /> : <LetterSkeleton />)}
          {view === "days" &&
            (state.schedule ? (
              <DayByDay
                state={state}
                doc={doc}
                onOpen={openStep}
                extra={
                  <>
                    {doc.letter && <Insights insights={doc.letter.insights} onOpen={openStep} />}
                    {comparison && (
                      <p className="mb-6 rounded-[8px] border border-rule bg-raised px-5 py-4 text-[17px] leading-[1.6] text-ink">
                        <Prose segs={comparison.sentence} />
                      </p>
                    )}
                  </>
                }
                shortcut={(id) => {
                  const sc = comparison?.shortcuts.find((x) => x.id === id);
                  return sc ? (
                    <p className="mt-1 text-[15px] text-ink">
                      <span className="mr-2 rounded-[3px] border border-accent px-1.5 py-[1px] text-[14px] font-semibold text-accent">Shortcut</span>
                      <Prose segs={sc.text} />
                    </p>
                  ) : null;
                }}
              />
            ) : (
              <StepsPreview steps={state.stepOrder.map((id) => state.steps[id])} stubs={state.stubs} running={running} />
            ))}
        </div>
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

      {view === "map" && (
        <div className="mt-8">
          <MapView state={state} selection={selection} onSelect={select} />
        </div>
      )}

      {state.summary && (
        <div className="mt-12 max-w-[680px] border-t border-rule pt-6">
          <Closing summary={state.summary} />
        </div>
      )}
      {state.phase === "done" && doc.sources.length > 0 && (
        <div className="mt-12">
          <SourcesList sources={doc.sources} />
        </div>
      )}
      {selection && <SidePanel state={state} doc={doc} selection={selection} onSelect={select} />}
    </main>
  );
}
