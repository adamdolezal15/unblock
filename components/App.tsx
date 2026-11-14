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
import { planNumbers } from "@/lib/ui/counts";
import { RefinementChips } from "./RefinementChips";
import type { Selection } from "@/lib/ui/selection";
import { Hero } from "./Hero";
import { CoverageNotice } from "./CoverageNotice";
import { Refine } from "./Refine";
import { Closing } from "./letter/Closing";
import { LetterView } from "./letter/LetterView";
import { ProfileSentence } from "./letter/ProfileSentence";
import { SourcesList } from "./letter/SourcesList";
import { ErrorState, OutOfScopeState, PartialNotice } from "./States";
import { Landing } from "./Landing";
import { Contours } from "./motion/Contours";
import { Watch } from "./Watch";
import { SidePanel } from "./panel/SidePanel";
import { TopBar } from "./TopBar";
import { DayByDay } from "./views/DayByDay";
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

  // A saved demo (/?demo=marta): nothing on the page pretends it can be edited. (Only reached in the browser:
  // the server renders the idle landing page.)
  const demo = new URLSearchParams(window.location.search).has("demo") && (Object.values(DEMO_SENTENCES) as string[]).includes(state.text);

  return (
    <div className="min-h-screen">
      <Contours variant="result" />
      <TopBar demo={demo} onEdit={() => home(true)} onHome={() => home(false)} progress={state.phase === "running" ? runProgress(state).value : undefined} />
      {state.phase === "out_of_scope" && <OutOfScopeState message={state.outOfScope ?? ""} />}
      {state.phase === "error" && state.stepOrder.length === 0 && (
        <ErrorState message={state.error ?? "Something went wrong."} onRetry={() => begin(state.text)} />
      )}
      {(state.phase === "running" || state.phase === "done" || (state.phase === "error" && state.stepOrder.length > 0)) && (
        <Results state={state} demo={demo} rows={rows} answers={answers} onAnswer={setAnswers} onRerun={(t) => void begin(t)} />
      )}
    </div>
  );
}

function Results({ state, demo, rows, answers, onAnswer, onRerun }: {
  state: RunState;
  /** A saved demo run: profile values are plain text, with a link to plan your own move. */
  demo: boolean;
  rows: RefineRow[];
  /** The answers in the URL (?r=), shown as chips under the profile sentence. */
  answers: readonly RefineKey[];
  onAnswer: (keys: RefineKey[]) => void;
  onRerun: (text: string) => void;
}) {
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
  // The duration shown is the live run's (a replay shows the original; unknown -> omitted), never the replay time.
  const numbers = useMemo(() => planNumbers(state), [state]);
  const elapsed = numbers.durationMs ?? undefined;

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
        {state.error && <p className="mx-auto mt-6 max-w-[560px] text-center text-[17px] text-ink">{state.error}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1040px] px-6 pb-24">
      <div className="pt-10">
        {state.profile && (
          <div className="mb-8">
            {demo && (
              <p className="mb-2 text-[13px] text-muted">
                Saved demo
                <span aria-hidden className="mx-2">·</span>
                {/* A full page load on purpose: it drops ?demo= and the saved run, so the landing page starts empty. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" className="link">
                  Plan your own move →
                </a>
              </p>
            )}
            <ProfileSentence
              profile={state.profile}
              text={state.text}
              disabled={running}
              readOnly={demo}
              size="sm"
              onCorrect={(field, value) => onRerun(`${state.text} ${correction(field, value, state.profile!.assumptions)}`)}
            />
            <RefinementChips answers={answers} onChange={onAnswer} />
          </div>
        )}
        <Hero
          state={state}
          doc={doc}
          comparison={comparison}
          onOpen={openStep}
          onShowFeed={state.phase === "done" ? showAndScrollFeed : undefined}
          icsUrl={state.phase === "done" ? state.calendar?.icsUrl : undefined}
        />
        {coverage && <CoverageNotice coverage={coverage} />}
        {running && <p className="mt-4 text-[15px] text-muted">Still cross-checking sources…</p>}
      </div>

        <div className="mt-12">
          <ViewTabs view={view} onChange={setView} />
        </div>
      {(state.partial || state.error) && (
        <div className="mt-6 max-w-[680px] space-y-3">
          {state.partial && <PartialNotice message={state.partial.message} missing={state.partial.missing} />}
          {state.error && <p className="text-[17px] text-ink">{state.error}</p>}
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
              compass
              shortcut={(id) => {
                const sc = comparison?.shortcuts.find((x) => x.id === id);
                // A tag only: the answer above already says what the shortcut gains.
                return sc ? (
                  <span title={sc.text.map((x) => ("t" in x ? x.t : "")).join("")} className="rounded-[6px] bg-accent px-2 py-[2px] text-[13px] font-bold text-surface">
                    Shortcut
                  </span>
                ) : null;
              }}
            />
          </div>
        )}
        {view === "map" && <MapView state={state} selection={selection} onSelect={select} />}
      </div>

      {/* Under the plan: answers that sharpen the dates, and the weekly watch on its official pages. */}
      {state.phase === "done" && ((!listOnly && rows.length > 0) || state.summary?.runId) && (
        <section aria-label="Refine and stay updated" className="mt-12 max-w-[680px]">
          <h2 className="text-[28px] font-bold text-ink">Refine &amp; stay updated</h2>
          {!listOnly && <Refine rows={rows} onChange={onAnswer} />}
          {state.summary?.runId && (
            <div className="mt-8">
              <Watch key={state.summary.runId} runId={state.summary.runId} />
            </div>
          )}
        </section>
      )}

      <footer id="activity-feed" className="mt-12 max-w-[680px]">
        {state.summary && <Closing summary={state.summary} numbers={numbers} />}
        <button
          type="button"
          onClick={() => setFeedOpen({ runKey: state.runKey, open: !showFeed })}
          aria-expanded={showFeed}
          className="mt-3 text-[15px] link"
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
              embedded
              onToggle={() => setFeedOpen({ runKey: state.runKey, open: false })}
              activity={state.summary?.activity}
              numbers={numbers}
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
