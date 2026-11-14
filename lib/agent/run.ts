// The whole pipeline (SPEC "Pipeline") as one call that reports typed events as it goes:
//   parseProfile → findSteps (steps stream as they are confirmed)
//     → graph (pure, immediately)  ∥  findCommunityTips  ∥  detectConflicts for steps that get no tips
//     → schedule + calendar (need the tips' waits)  ∥  detectConflicts for the tip steps (need their tips)
//   → persist .cache/runs/<runId>.json → done (summary).
// Status lines come from lib/exa and lib/llm themselves (lib/events/context), so the feed shows real work.
// A global timeout (75 s) never yields a blank result: whatever finished is completed with the pure steps
// (graph, schedule, calendar), a `partial` event says what is missing, and `done` still follows.
import { googleTemplateUrl, eventsFromSchedule } from "../calendar";
import { newMeter, RunAbortedError, withRunContext, type RunMeter } from "../events/context";
import { buildGraph, criticalNode, criticalPath, describeVisitAlternative, schedule, topoOrder } from "../graph";
import type { CriticalPath, Graph, Schedule } from "../graph/types";
import type { Citation, Conflict, DroppedClaim, PipelineEvent, Profile, RunSummary, Step, StepStub, StreamCalEvent, Tip, Trust } from "../types";
import { detectConflicts } from "./detectConflicts";
import { estimatesWithTips } from "./estimates";
import { attachTips, findCommunityTips, tipTargets, type FindTipsResult } from "./findCommunityTips";
import { findSteps, type FindStepsResult } from "./findSteps";
import { parseProfile } from "./parseProfile";
import { partnerDifferences } from "./partnerSteps";
import { newRunId, saveRun, type RunRecord } from "./runStore";
import { STEP_TAXONOMY } from "./stepTaxonomy";
import { normalizeUrl } from "./verifyCitations";

export const RUN_TIMEOUT_MS = 75_000;

export type RunOptions = {
  /** Client disconnect: stop starting new work and emit nothing more. */
  signal?: AbortSignal;
  onEvent?: (e: PipelineEvent) => void;
  /** Global deadline; on expiry the run finishes with what it has (partial). Default 75 s. */
  timeoutMs?: number;
  /** YYYY-MM-DD (Helsinki). Defaults to today; pins relative dates and the schedule start in tests. */
  today?: string;
  runId?: string;
  /** Cost / cache meter for this run; pass one in to watch it while streaming (demo replay). */
  meter?: RunMeter;
  /** Write .cache/runs/<runId>.json (default true). */
  persist?: boolean;
};

export type RunOutcome =
  | { kind: "done"; runId: string; record: RunRecord; savedTo: string | null }
  | { kind: "out_of_scope"; message: string }
  | { kind: "aborted" };

const TRUSTS: Trust[] = ["official", "provider", "university", "news", "community"];

/** Short lowercase name for visit-choice text ("bank account", "DVV registration"). */
function shortName(id: string): string {
  const label = STEP_TAXONOMY.find((d) => d.id === id)?.label ?? id.replace(/_/g, " ");
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

/** findSteps / tips / conflicts progress lines, reworded for the feed. Lines lib/llm already covers are skipped. */
function progressLine(m: string): string | null {
  let x: RegExpMatchArray | null;
  if ((x = m.match(/^searching official sources: (.+)$/))) return `Searching official sources for ${x[1]}…`;
  if ((x = m.match(/^searching community sources: (.+)$/))) return `Searching forums and guides for ${x[1]}…`;
  if ((x = m.match(/^verifying (\d+) quotes: (.+)$/))) return `Verifying ${x[1]} quotes for ${x[2]}…`;
  if (/^(reading|comparing) /.test(m)) return null;
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Rejects as soon as `signal` aborts; the underlying work is not awaited further. */
function until<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new RunAbortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new RunAbortedError());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => (signal.removeEventListener("abort", onAbort), resolve(v)),
      (e) => (signal.removeEventListener("abort", onAbort), reject(e)),
    );
  });
}

const conflictKey = (c: Conflict) =>
  [`${normalizeUrl(c.a.url)}|${c.a.quote}`, `${normalizeUrl(c.b.url)}|${c.b.quote}`].sort().join("||");

export async function run(text: string, opts: RunOptions = {}): Promise<RunOutcome> {
  const t0 = Date.now();
  const runId = opts.runId ?? newRunId();
  const meter = opts.meter ?? newMeter();
  const sink = opts.onEvent ?? (() => {});

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), opts.timeoutMs ?? RUN_TIMEOUT_MS);
  const onClientAbort = () => controller.abort("client");
  if (opts.signal?.aborted) onClientAbort();
  opts.signal?.addEventListener("abort", onClientAbort, { once: true });
  const signal = controller.signal;
  const clientGone = () => signal.aborted && signal.reason === "client";

  // Status lines are held back until the profile is known: out-of-scope input gets exactly one event.
  let held: PipelineEvent[] | null = [];
  const emit = (e: PipelineEvent) => {
    if (clientGone()) return;
    if (held && e.type === "status") held.push(e);
    else sink(e);
  };
  const flushHeld = () => {
    const h = held ?? [];
    held = null;
    for (const e of h) emit(e);
  };

  // --- what has finished so far (the partial result is built from this)
  const s: {
    profile?: Profile;
    assumptions: string[];
    stepMap: Map<string, Step>;
    found?: FindStepsResult;
    tipsResult?: FindTipsResult;
    tips: Tip[];
    tipsDone: boolean;
    conflicts: Conflict[];
    conflictKeys: Set<string>;
    conflictDropped: DroppedClaim[];
    conflictsDone: boolean;
    graphSent: boolean;
    sched?: { steps: Step[]; schedule: Schedule; path: CriticalPath; events: StreamCalEvent[] };
    fatal?: string;
  } = {
    assumptions: [],
    stepMap: new Map(),
    tips: [],
    tipsDone: false,
    conflicts: [],
    conflictKeys: new Set(),
    conflictDropped: [],
    conflictsDone: false,
    graphSent: false,
  };

  const onProgress = (m: string) => {
    const line = progressLine(m);
    if (line && !signal.aborted) emit({ type: "status", message: line });
  };

  const addConflict = (c: Conflict) => {
    if (signal.aborted) return;
    const k = conflictKey(c);
    if (s.conflictKeys.has(k)) return;
    s.conflictKeys.add(k);
    s.conflicts.push(c);
    emit({ type: "conflict", conflict: c });
  };

  const sendGraph = (steps: Step[]) => {
    const graph = buildGraph(steps);
    const topo = topoOrder(graph);
    // Nodes carry their Step for lib/graph; the step events already sent it, so it is left out here.
    const slim: Graph = { nodes: graph.nodes.map((n) => ({ ...n, step: undefined })), edges: graph.edges };
    emit({ type: "graph", graph: slim, criticalNode: criticalNode(graph), order: topo.order, deadlocks: topo.deadlocks });
    s.graphSent = true;
  };

  const sendSchedule = (steps: Step[], tips: Tip[]) => {
    const profile = s.profile!;
    const graph = buildGraph(steps);
    const sched = schedule(graph, profile, {
      estimates: estimatesWithTips(steps, tips),
      ...(opts.today ? { today: opts.today } : {}),
    });
    const path = criticalPath(graph, sched);
    emit({
      type: "schedule",
      schedule: sched,
      criticalPath: path,
      visitChoices: sched.visitChoices.map((c) => ({ ...c, description: describeVisitAlternative(c, shortName) })),
    });
    const events = eventsFromSchedule(steps, sched).map((e) => ({ ...e, googleTemplateUrl: googleTemplateUrl(e) }));
    emit({ type: "calendar", events, icsUrl: `/api/calendar.ics?runId=${runId}` });
    s.sched = { steps, schedule: sched, path, events };
  };

  /** Per-step failures inside a stage (e.g. a cache miss in read mode) are not fatal, but never silent. */
  const reportFailures = (stage: string, reports: { stepId: string; error?: string }[]) => {
    const failed = reports.filter((x) => x.error);
    if (!failed.length || signal.aborted) return;
    emit({
      type: "error",
      message: `${stage} skipped for ${failed.map((x) => x.stepId).join(", ")}: ${failed[0].error!.slice(0, 120)}`,
      recoverable: true,
    });
  };

  const conflictBatch = (steps: Step[], tips: Tip[]) =>
    detectConflicts(steps, tips, { profile: s.profile!, onProgress }).then(
      (r) => {
        if (signal.aborted) return;
        s.conflictDropped.push(...r.dropped);
        r.conflicts.forEach(addConflict);
        reportFailures("Conflict check", r.reports);
      },
      (e) => {
        if (!signal.aborted) emit({ type: "error", message: `Conflict check failed: ${(e as Error).message}`, recoverable: true });
      },
    );

  const pipeline = async (): Promise<string | null> => {
    const parsed = await until(parseProfile(text, opts.today), signal);
    if (!parsed.ok) {
      held = null; // drop the held status lines
      emit({ type: "out_of_scope", message: parsed.outOfScope });
      return parsed.outOfScope;
    }
    flushHeld();
    const profile = parsed.profile;
    s.profile = profile;
    s.assumptions = parsed.assumptions;
    emit({
      type: "profile",
      profile,
      assumptions: parsed.assumptions,
      people: parsed.people,
      partnerNotes: partnerDifferences(parsed.people).map((d) => d.summary),
      source: parsed.source,
    });

    const found = await until(
      findSteps(profile, {
        onProgress,
        onStep: (step) => {
          if (signal.aborted) return;
          s.stepMap.set(step.id, step);
          emit({ type: "step", step });
        },
      }),
      signal,
    );
    s.found = found;
    for (const stub of found.stubs) emit({ type: "stub", stub });
    reportFailures("Step extraction", found.reports.map((r) => ({ stepId: r.id, error: r.error })));
    const verified = found.reports.reduce((n, r) => n + r.verified, 0);
    emit({ type: "status", message: `${verified} quotes verified against the source text, ${found.dropped.length} dropped` });
    found.conflicts.forEach(addConflict);

    // Tips and the conflict check for steps that get no tips start now; the graph needs neither.
    const targets = new Set(tipTargets(found.steps).map((x) => x.id));
    const tipsP = findCommunityTips(profile, found.steps, { onProgress, ...(opts.today ? { today: opts.today } : {}) });
    const conflictsA = conflictBatch(found.steps.filter((x) => !targets.has(x.id)), []);
    sendGraph(found.steps);

    try {
      s.tipsResult = await until(tipsP, signal);
      s.tips = s.tipsResult.tips;
      for (const tip of s.tips) emit({ type: "tip", tip });
      reportFailures("Community tips", s.tipsResult.reports);
    } catch (e) {
      if (signal.aborted) throw e;
      emit({ type: "error", message: `Community tips unavailable: ${(e as Error).message}`, recoverable: true });
    }
    s.tipsDone = true;

    const withTips = attachTips(found.steps, s.tips);
    sendSchedule(withTips, s.tips);
    const conflictsB = conflictBatch(withTips.filter((x) => targets.has(x.id)), s.tips);
    await until(Promise.all([conflictsA, conflictsB]), signal);
    s.conflictsDone = true;
    return null;
  };

  let outOfScope: string | null = null;
  let timedOut = false;
  try {
    outOfScope = await withRunContext({ onStatus: emit, signal, meter }, pipeline);
  } catch (e) {
    if (clientGone()) return { kind: "aborted" };
    if (signal.aborted) timedOut = true;
    else {
      s.fatal = (e as Error).message;
      emit({ type: "error", message: `The plan could not be finished: ${s.fatal}`, recoverable: false });
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onClientAbort);
  }
  if (outOfScope !== null) return { kind: "out_of_scope", message: outOfScope };
  if (held) flushHeld(); // timed out or failed before the profile: still show what was done

  // --- complete the pure stages from whatever finished
  const baseSteps = s.found?.steps ?? [...s.stepMap.values()];
  const steps = s.sched?.steps ?? attachTips(baseSteps, s.tips);
  if (s.profile && steps.length) {
    if (!s.graphSent) sendGraph(steps);
    if (!s.sched) sendSchedule(steps, s.tips);
  }
  const missing = [
    ...(s.profile ? [] : ["profile"]),
    ...(s.found ? [] : ["official step search (only steps confirmed so far are shown)"]),
    ...(s.tipsDone ? [] : ["community tips (waits use cited or default estimates)"]),
    ...(s.conflictsDone ? [] : ["conflict check"]),
  ];
  const partial = timedOut || !!s.fatal;
  if (timedOut) {
    const secs = Math.round((opts.timeoutMs ?? RUN_TIMEOUT_MS) / 1000);
    emit({
      type: "partial",
      reason: "timeout",
      message: `Stopped after ${secs} s. This is a partial plan built from what was finished; every claim shown is still verified.`,
      missing,
    });
  }

  const summary = summarize({ runId, partial, steps, stubs: s.found?.stubs ?? [], s, meter, ms: Date.now() - t0 });
  const record: RunRecord = {
    runId,
    createdAt: new Date(t0).toISOString(),
    text,
    partial,
    profile: s.profile ?? ({ citizenship: "EU", purpose: [], city: "" } as Profile),
    assumptions: s.assumptions,
    steps,
    stubs: s.found?.stubs ?? [],
    tips: s.tips,
    conflicts: s.conflicts,
    schedule: s.sched?.schedule,
    criticalPath: s.sched?.path,
    events: s.sched?.events ?? [],
    summary,
  };
  const savedTo = s.profile && opts.persist !== false ? await saveRun(record).catch(() => null) : null;
  emit({ type: "done", summary });
  return { kind: "done", runId, record, savedTo };
}

function summarize(a: {
  runId: string;
  partial: boolean;
  steps: Step[];
  stubs: StepStub[];
  s: { tips: Tip[]; conflicts: Conflict[]; found?: FindStepsResult; tipsResult?: FindTipsResult; conflictDropped: DroppedClaim[]; sched?: { schedule: Schedule; path: CriticalPath; events: StreamCalEvent[] } };
  meter: RunMeter;
  ms: number;
}): RunSummary {
  const { steps, s, meter } = a;
  const real = steps.filter((x) => !x.milestone);
  const sched = s.sched?.schedule;

  const visits = new Set<string>();
  for (const x of real) {
    const item = sched?.items[x.id];
    if (x.mode === "in_person" && item) visits.add(item.visitId ?? x.id);
  }

  const citations: Citation[] = [
    ...steps.flatMap((x) => [...x.citations, ...(x.claims ?? []).map((c) => c.citation)]),
    ...s.tips.map((t) => t.citation),
    ...s.conflicts.flatMap((c) => [c.a, c.b]),
  ];
  const urlTrust = new Map<string, Trust>();
  const quotes = new Set<string>();
  for (const c of citations) {
    urlTrust.set(normalizeUrl(c.url), c.trust);
    quotes.add(`${normalizeUrl(c.url)}|${c.quote}`);
  }
  const sourcesByTrust = Object.fromEntries(TRUSTS.map((t) => [t, 0])) as Record<Trust, number>;
  for (const t of urlTrust.values()) sourcesByTrust[t]++;

  const path = s.sched?.path;
  const last = path?.stepIds[path.stepIds.length - 1];
  const events = s.sched?.events ?? [];
  const llm = meter.llmCostUsd;
  const rejected = [...(s.found?.dropped ?? []), ...(s.tipsResult?.dropped ?? []), ...s.conflictDropped];
  return {
    runId: a.runId,
    partial: a.partial,
    steps: real.length,
    alreadyDone: steps.filter((x) => x.done).length,
    online: real.filter((x) => x.mode === "online" || x.mode === "either").length,
    inPersonVisits: visits.size,
    inCalendar: events.filter((e) => e.kind === "visit").length,
    reminders: events.filter((e) => e.kind === "reminder").length,
    notFound: a.stubs.length,
    criticalPath: {
      stepIds: path?.stepIds ?? [],
      workingDays: path?.totalDays ?? 0,
      calendarDays: path?.calendarDays ?? 0,
      endDate: last && sched ? sched.items[last].doneDate : null,
    },
    sourcesByTrust,
    verifiedQuotes: quotes.size,
    droppedClaims: rejected.length,
    rejected: rejected.slice(0, MAX_REJECTED).map(({ stepId, kind, url, quote, reason }) => ({ stepId, kind, url, quote, reason })),
    tips: s.tips.length,
    conflicts: s.conflicts.length,
    totalMs: a.ms,
    costUsd: { exa: round(meter.exaCostUsd), llm: round(llm), total: round(meter.exaCostUsd + llm) },
    calls: { exa: meter.exaCalls, exaLive: meter.exaLive, llm: meter.llmCalls, llmLive: meter.llmLive },
  };
}

/** Rejected claims listed in the summary (the count covers all of them). */
const MAX_REJECTED = 50;

const round = (n: number) => Math.round(n * 10000) / 10000;
