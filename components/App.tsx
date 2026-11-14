"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_SENTENCES, type DemoKey } from "@/lib/demo/sentences";
import { useRun } from "@/lib/ui/useRun";
import { refineRows, type RefineKey, type RefineRow } from "@/lib/refine/refine";
import { refineInput, refineState } from "@/lib/ui/refineState";
import { useRefinements, writeRefinements } from "@/lib/ui/useRefinements";
import type { RunState } from "@/lib/ui/runState";
import { buildLetter } from "@/lib/ui/letter";
import { fallbackSteps } from "@/lib/ui/days";
import { correction } from "@/lib/ui/profileSentence";
import { useView } from "@/lib/ui/useView";
import { compareWithUsual } from "@/lib/ui/compare";
import { runProgress } from "@/lib/ui/progress";
import { coverage as coverageOf } from "@/lib/ui/coverage";
import { ActivityFeed } from "./ActivityFeed";
import type { Selection } from "@/lib/ui/selection";
import { Hero } from "./Hero";
import { Refine } from "./Refine";
import { Closing } from "./letter/Closing";
import { LetterView } from "./letter/LetterView";
import { ProfileSentence } from "./letter/ProfileSentence";
import { SourcesList } from "./letter/SourcesList";
import { ErrorState, OutOfScopeState, PartialNotice } from "./States";
import { Landing } from "./Landing";
import { Watch } from "./Watch";
import { SidePanel } from "./panel/SidePanel";
import { TopBar } from "./TopBar";
import { DayByDay } from "./views/DayByDay";
import { Insights } from "./views/Insights";
import { MapView } from "./views/MapView";
import { ViewTabs } from "./ViewTabs";
import { Working } from "./Working";

export function App() {
  const { state: run, start, reset } = useRun();
  // "Make it more accurate": the answers live in the URL; the views read the run with them applied (pure, in the browser).
  const [answers, setAnswers] = useRefinements();
  const input = useMemo(() => refineInput(run), [run]);
  const state = useMemo(() => refineState(run, answers, input), [run, answers, input]);
  const rows = useMemo(() => (input ? refineRows(input, answers) : []), [input, answers]);
  // A new sentence is a new plan: its answers do not carry over.
  const begin = useCallback((text: string, opts?: { fast?: boolean }) => {
    writeRefinements([]);
    return start(text, opts);
  }, [start]);
  const home = useCallback((keepText: boolean) => {
    writeRefinements([]);
    reset(keepText);
  }, [reset]);

  // Demo links: /?demo=marta#days starts that example straight away (&fast=1 skips the replay pauses).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const key = q.get("demo");
    if (key && key in DEMO_SENTENCES) void start(DEMO_SENTENCES[key as DemoKey], { fast: q.get("fast") === "1" });
  }, [start]);

  if (state.phase === "idle") return <Landing runKey={state.runKey} value={state.text} onSubmit={begin} />;

  return (
    <div className="min-h-screen">
      <TopBar onEdit={() => home(true)} onHome={() => home(false)} icsUrl={state.phase === "done" ? state.calendar?.icsUrl : undefined}
        progress={state.phase === "running" ? runProgress(state).value : undefined}
        running={state.phase === "running"} />
      {state.phase === "out_of_scope" && <OutOfScopeState message={state.outOfScope ?? ""} />}
      {state.phase === "error" && state.stepOrder.length === 0 && (
        <ErrorState message={state.error ?? "Something went wrong."} onRetry={() => begin(state.text)} />
      )}
      {(state.phase === "running" || state.phase === "done" || (state.phase === "error" && state.stepOrder.length > 0)) && (
        <Results state={state} rows={rows} onAnswer={setAnswers} onRerun={(t) => void begin(t)} />
      )}
    </div>
  );
}

function Results({ state, rows, onAnswer, onRerun }: { state: RunState; rows: RefineRow[]; onAnswer: (keys: RefineKey[]) => void; onRerun: (text: string) => void }) {
  const running = state.phase === "running";
  const doc = useMemo(() => buildLetter(state), [state]);
  const [view, setView] = useView();
  const comparison = useMemo(() => compareWithUsual(state, doc.ref), [state, doc]);

  // "How I worked this out": closed by default once the plan is shown.
  const [feedOpen, setFeedOpen] = useState<{ runKey: number; open: boolean } | null>(null);
  const showFeed = feedOpen?.runKey === state.runKey && feedOpen.open;
  const coverage = useMemo(
    () => coverageOf(state.text, state.profile?.profile, state.profile?.people, Object.values(state.steps)),
    [state.text, state.profile, state.steps],
  );
  const showAndScrollFeed = useCallback(() => {
    setFeedOpen({ runKey: state.runKey, open: true });
    setTimeout(() => document.getElementById("activity-feed")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [state.runKey]);
  const elapsed = state.summary?.totalMs ?? (state.finishedAt ? state.finishedAt - state.startedAt : undefined);

  // Selection for the details drawer (per run). Clicking a step in any view opens it.
  const [sel, setSel] = useState<{ runKey: number; selection: Selection }>({ runKey: 0, selection: null });
  const selection = sel.runKey === state.runKey ? sel.selection : null;
  const runKey = state.runKey;
  const select = useCallback((selection: Selection) => setSel({ runKey, selection }), [runKey]);
  const openStep = useCallback((id: string) => select({ kind: "step", id }), [select]);
  const openSources = useCallback((id: string) => select({ kind: "step", id, focus: "sources" }), [select]);

  // Steps but no dated plan (for any reason, once the run has a schedule or is over): the steps as a list.
  const listOnly = !!fallbackSteps(state) && (!!state.schedule || state.phase === "done");

  // Until the schedule exists there is no answer to show: one calm progress card instead.
  if (!listOnly && (!state.schedule || !doc.letter)) {
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
        <Hero state={state} doc={doc} comparison={comparison} onOpen={openStep} coverage={coverage} onShowFeed={state.phase === "done" ? showAndScrollFeed : undefined} />
        {state.phase === "done" && !listOnly && <Refine rows={rows} onChange={onAnswer} />}
        {running && <p className="mt-4 text-[15px] text-muted">Still cross-checking sources…</p>}
        {state.phase === "done" && state.summary?.runId && (
          <div className="mt-8">
            <Watch key={state.summary.runId} runId={state.summary.runId} />
          </div>
        )}
      </div>

      <div className="mt-16">
        <ViewTabs view={view} onChange={setView} />
      </div>
      {(state.partial || state.error) && (
        <div className="mt-6 max-w-[680px] space-y-3">
          {state.partial && <PartialNotice message={state.partial.message} missing={state.partial.missing} />}
          {state.error && <p className="text-[16px] text-ink">{state.error}</p>}
        </div>
      )}

      <div className="mt-8">
        {view === "summary" && listOnly && (
          <div className="max-w-[880px]">
            <DayByDay state={state} doc={doc} onOpen={openStep} onSources={openSources} />
          </div>
        )}
        {view === "summary" && !listOnly && (
          <div className="max-w-[680px]">
            <LetterView letter={doc.letter!} onShow={openStep} headline={false} />
          </div>
        )}
        {view === "days" && (
          <div className="max-w-[880px]">
            <DayByDay
              state={state}
              doc={doc}
              onOpen={openStep}
              onSources={openSources}
              extra={doc.letter ? <Insights insights={doc.letter.insights} onOpen={openStep} /> : undefined}
              shortcut={(id) => {
                const sc = comparison?.shortcuts.find((x) => x.id === id);
                // A tag only: the answer above already says what the shortcut gains.
                return sc ? (
                  <span title={sc.text.map((x) => ("t" in x ? x.t : "")).join("")} className="rounded-[3px] bg-accent px-1.5 py-[2px] text-[14px] font-bold text-white">
                    Shortcut
                  </span>
                ) : null;
              }}
            />
          </div>
        )}
        {view === "map" && <MapView state={state} selection={selection} onSelect={select} />}
      </div>

      <footer id="activity-feed" className="mt-16 max-w-[680px] border-t border-rule pt-8">
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
              activity={state.summary?.activity}
            />
          </div>
        )}
      </footer>

      {state.phase === "done" && doc.sources.length > 0 && (
        <div className="mt-16 max-w-[880px]">
          <SourcesList sources={doc.sources} />
        </div>
      )}
      {selection && <SidePanel state={state} doc={doc} selection={selection} onSelect={select} />}
    </main>
  );
}
