"use client";
import { useState } from "react";
import { useRun } from "@/lib/ui/useRun";
import type { RunState } from "@/lib/ui/runState";
import { ActivityFeed } from "./ActivityFeed";
import { Header } from "./Header";
import { ProfileStrip } from "./ProfileStrip";
import { RunInput } from "./RunInput";
import { EmptyState, ErrorState, OutOfScopeState, PartialNotice } from "./States";
import { StepsPreview } from "./StepsPreview";
import { SummaryBar } from "./SummaryBar";

export function App() {
  const { state, start, reset } = useRun();
  const running = state.phase === "running";
  const idle = state.phase === "idle";

  return (
    <div className="flex min-h-screen flex-col">
      <Header onHome={reset} />
      <RunInput key={state.runKey} value={state.text} running={running} compact={!idle} onSubmit={start} />
      {idle && <EmptyState />}
      {state.phase === "out_of_scope" && <OutOfScopeState message={state.outOfScope ?? ""} />}
      {state.phase === "error" && state.stepOrder.length === 0 && <ErrorState message={state.error ?? "Something went wrong."} onRetry={() => start(state.text)} />}
      {(running || state.phase === "done" || (state.phase === "error" && state.stepOrder.length > 0)) && (
        <Workspace state={state} onCorrect={(c) => start(`${state.text} (correction: ${c})`)} />
      )}
    </div>
  );
}

function Workspace({ state, onCorrect }: { state: RunState; onCorrect: (correction: string) => void }) {
  const running = state.phase === "running";
  // Feed collapses by itself when the run is done; the user can override it per run.
  const [feedPref, setFeedPref] = useState<{ runKey: number; collapsed: boolean } | null>(null);
  const collapsed = feedPref?.runKey === state.runKey ? feedPref.collapsed : state.phase === "done";
  const toggleFeed = () => setFeedPref({ runKey: state.runKey, collapsed: !collapsed });
  const elapsed = state.summary?.totalMs ?? (state.finishedAt ? state.finishedAt - state.startedAt : undefined);
  const steps = state.stepOrder.map((id) => state.steps[id]);

  const feed = (
    <ActivityFeed statuses={state.statuses} running={running} elapsedMs={elapsed} collapsed={collapsed} onToggle={toggleFeed} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-rule">
      {collapsed && feed}
      <div className={`grid min-h-[calc(100vh-150px)] flex-1 ${collapsed ? "grid-cols-1" : "grid-cols-[300px_minmax(0,1fr)]"}`}>
        {!collapsed && <aside className="flex max-h-[calc(100vh-150px)] min-h-0 flex-col border-r border-rule bg-sunk/40">{feed}</aside>}
        <main className="flex min-w-0 flex-col gap-4 px-6 py-4">
          {state.profile ? (
            <ProfileStrip profile={state.profile} disabled={running} onCorrect={(_a, c) => onCorrect(c)} />
          ) : (
            <ProfileSkeleton />
          )}
          {state.summary ? <SummaryBar summary={state.summary} /> : running ? <RunningLine state={state} /> : null}
          {state.partial && <PartialNotice message={state.partial.message} missing={state.partial.missing} />}
          {state.error && <p className="text-[15px] text-ink">{state.error}</p>}
          {state.notes.length > 0 && (
            <ul className="space-y-1 text-[14px] text-muted">
              {state.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <StepsPreview steps={steps} stubs={state.stubs} running={running} items={state.schedule?.schedule.items} order={state.graph?.order} />
        </main>
      </div>
    </div>
  );
}

function RunningLine({ state }: { state: RunState }) {
  const actionable = state.stepOrder.filter((id) => !state.steps[id].milestone).length;
  const stage = !state.profile
    ? "Reading your situation"
    : !state.graph
      ? `Researching steps · ${actionable} confirmed so far`
      : !state.schedule
        ? `Checking what people who did it say · ${state.tips.length} tips`
        : "Cross-checking sources for conflicts";
  return (
    <p className="num flex items-center gap-2 text-[15px] text-muted" role="status">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      {stage}…
    </p>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="mr-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Your situation</span>
      {[96, 120, 80, 140].map((w) => (
        <span key={w} className="skeleton h-7 rounded-full" style={{ width: w }} />
      ))}
    </div>
  );
}
