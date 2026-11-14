"use client";
import { useCallback, useMemo, useState } from "react";
import { useRun } from "@/lib/ui/useRun";
import type { RunState } from "@/lib/ui/runState";
import { buildLetter } from "@/lib/ui/letter";
import { correction } from "@/lib/ui/profileSentence";
import { useView } from "@/lib/ui/useView";
import { compareWithUsual } from "@/lib/ui/compare";
import { runProgress } from "@/lib/ui/progress";
import { ActivityFeed } from "./ActivityFeed";
import type { Selection } from "./graph/PlanGraph";
import { Hero } from "./Hero";
import { Closing } from "./letter/Closing";
import { LetterView, Prose } from "./letter/LetterView";
import { ProfileSentence } from "./letter/ProfileSentence";
import { SourcesList } from "./letter/SourcesList";
import { ErrorState, OutOfScopeState, PartialNotice } from "./States";
import { Landing } from "./Landing";
import { SidePanel } from "./panel/SidePanel";
import { TopBar } from "./TopBar";
import { DayByDay } from "./views/DayByDay";
import { Insights } from "./views/Insights";
import { MapView } from "./views/MapView";
import { ViewTabs } from "./ViewTabs";
import { Working } from "./Working";

export function App() {
  const { state, start, reset } = useRun();

  if (state.phase === "idle") return <Landing runKey={state.runKey} value={state.text} onSubmit={start} />;

  return (
    <div className="min-h-screen">
      <TopBar onEdit={() => reset(true)} onHome={() => reset(false)} icsUrl={state.phase === "done" ? state.calendar?.icsUrl : undefined}
        progress={state.phase === "running" ? runProgress(state).value : undefined} />
      {state.phase === "out_of_scope" && <OutOfScopeState message={state.outOfScope ?? ""} />}
      {state.phase === "error" && state.stepOrder.length === 0 && (
        <ErrorState message={state.error ?? "Something went wrong."} onRetry={() => start(state.text)} />
      )}
      {(state.phase === "running" || state.phase === "done" || (state.phase === "error" && state.stepOrder.length > 0)) && (
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

  // "How I worked this out": closed by default once the plan is shown.
  const [feedOpen, setFeedOpen] = useState<{ runKey: number; open: boolean } | null>(null);
  const showFeed = feedOpen?.runKey === state.runKey && feedOpen.open;
  const elapsed = state.summary?.totalMs ?? (state.finishedAt ? state.finishedAt - state.startedAt : undefined);

  // Selection for the details drawer (per run). Clicking a step in any view opens it.
  const [sel, setSel] = useState<{ runKey: number; selection: Selection }>({ runKey: 0, selection: null });
  const selection = sel.runKey === state.runKey ? sel.selection : null;
  const runKey = state.runKey;
  const select = useCallback((selection: Selection) => setSel({ runKey, selection }), [runKey]);
  const openStep = useCallback((id: string) => select({ kind: "step", id }), [select]);

  // Until the schedule exists there is no answer to show: one calm progress card instead.
  if (!state.schedule || !doc.letter) {
    return (
      <main className="px-6 pb-24">
        <Working state={state} />
        {state.error && <p className="mx-auto mt-6 max-w-[560px] text-center text-[16px] text-ink">{state.error}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1040px] px-6 pb-24">
      <div className="pt-12">
        {state.profile && (
          <div className="mb-6 max-w-[720px]">
            <ProfileSentence
              profile={state.profile}
              text={state.text}
              disabled={running}
              size="sm"
              onCorrect={(field, value) => onRerun(`${state.text} ${correction(field, value, state.profile!.assumptions)}`)}
            />
          </div>
        )}
        <Hero state={state} doc={doc} comparison={comparison} onOpen={openStep} />
        {running && <p className="mt-4 text-[15px] text-muted">Still cross-checking sources…</p>}
      </div>

      <div className="mt-14">
        <ViewTabs view={view} onChange={setView} />
      </div>
      {(state.partial || state.error) && (
        <div className="mt-6 max-w-[680px] space-y-3">
          {state.partial && <PartialNotice message={state.partial.message} missing={state.partial.missing} />}
          {state.error && <p className="text-[16px] text-ink">{state.error}</p>}
        </div>
      )}

      <div className="mt-8">
        {view === "summary" && (
          <div className="max-w-[680px]">
            <LetterView letter={doc.letter} onShow={openStep} />
          </div>
        )}
        {view === "days" && (
          <div className="max-w-[880px]">
            <DayByDay
              state={state}
              doc={doc}
              onOpen={openStep}
              extra={<Insights insights={doc.letter.insights} onOpen={openStep} />}
              shortcut={(id) => {
                const sc = comparison?.shortcuts.find((x) => x.id === id);
                return sc ? (
                  <p className="mt-1 text-[15px] text-ink">
                    <span className="mr-2 rounded-[3px] bg-accent px-1.5 py-[2px] text-[14px] font-bold text-white">Shortcut</span>
                    <Prose segs={sc.text} />
                  </p>
                ) : null;
              }}
            />
          </div>
        )}
        {view === "map" && <MapView state={state} selection={selection} onSelect={select} />}
      </div>

      <footer className="mt-20 max-w-[680px] border-t border-rule pt-8">
        {state.summary && <Closing summary={state.summary} />}
        <button
          type="button"
          onClick={() => setFeedOpen({ runKey: state.runKey, open: !showFeed })}
          aria-expanded={showFeed}
          className="mt-3 text-[15px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
        >
          {showFeed ? "Hide how I worked this out" : "How I worked this out"}
        </button>
        {showFeed && (
          <div className="mt-4 text-left">
            <ActivityFeed
              statuses={state.statuses}
              notes={state.notes}
              running={running}
              elapsedMs={elapsed}
              collapsed={false}
              onToggle={() => setFeedOpen({ runKey: state.runKey, open: false })}
            />
          </div>
        )}
      </footer>

      {state.phase === "done" && doc.sources.length > 0 && (
        <div className="mt-12 max-w-[880px]">
          <SourcesList sources={doc.sources} />
        </div>
      )}
      {selection && <SidePanel state={state} doc={doc} selection={selection} onSelect={select} />}
    </main>
  );
}
