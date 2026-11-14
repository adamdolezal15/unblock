// Client-side run state: a reducer over the NDJSON PipelineEvent stream from POST /api/run.
// Types only from lib/ (no server code in the client bundle). `step` events are upserts by id.
import type { Actor, Conflict, PipelineEvent, RunSummary, Step, StepStub, Tip } from "@/lib/types";

type Ev<T extends PipelineEvent["type"]> = Extract<PipelineEvent, { type: T }>;
export type ProfileEvent = Omit<Ev<"profile">, "type">;
export type GraphEvent = Omit<Ev<"graph">, "type">;
export type ScheduleEvent = Omit<Ev<"schedule">, "type">;
export type CalendarEvent = Omit<Ev<"calendar">, "type">;

export type Phase = "idle" | "running" | "done" | "out_of_scope" | "error";

export type StatusLine = { id: number; message: string; actor: Actor; domain?: string; cached?: boolean; replay?: boolean; at: number };

export type RunState = {
  phase: Phase;
  /** The sentence this run was started with. */
  text: string;
  /** Increments per run; use as a React key to reset per-run UI state. */
  runKey: number;
  startedAt: number;
  finishedAt?: number;
  statuses: StatusLine[];
  profile?: ProfileEvent;
  steps: Record<string, Step>;
  /** Step ids in first-seen order. */
  stepOrder: string[];
  stubs: StepStub[];
  graph?: GraphEvent;
  tips: Tip[];
  conflicts: Conflict[];
  schedule?: ScheduleEvent;
  calendar?: CalendarEvent;
  partial?: { message: string; missing: string[] };
  /** Recoverable problems (a stage failed, the rest went on). */
  notes: string[];
  /** Set when the run could not produce a plan. */
  error?: string;
  outOfScope?: string;
  summary?: RunSummary;
};

export const initialRunState: RunState = {
  phase: "idle",
  text: "",
  runKey: 0,
  startedAt: 0,
  statuses: [],
  steps: {},
  stepOrder: [],
  stubs: [],
  tips: [],
  conflicts: [],
  notes: [],
};

export type RunAction =
  | { type: "start"; text: string; at: number }
  /** Back to the first screen; keepText leaves the last sentence in the field for editing. */
  | { type: "reset"; keepText?: boolean }
  | { type: "event"; event: PipelineEvent; at: number }
  /** The stream ended (normally after `done`). */
  | { type: "end"; at: number }
  | { type: "fail"; message: string; at: number };

export function runReducer(s: RunState, a: RunAction): RunState {
  switch (a.type) {
    case "start":
      return { ...initialRunState, phase: "running", text: a.text, runKey: s.runKey + 1, startedAt: a.at };
    case "reset":
      return { ...initialRunState, runKey: s.runKey + 1, text: a.keepText ? s.text : "" };
    case "fail":
      return { ...s, phase: "error", error: a.message, finishedAt: a.at };
    case "end":
      if (s.phase !== "running") return s;
      return { ...s, phase: "error", error: "The connection closed before the plan was finished. Try again.", finishedAt: a.at };
    case "event":
      return applyEvent(s, a.event, a.at);
  }
}

function applyEvent(s: RunState, e: PipelineEvent, at: number): RunState {
  switch (e.type) {
    case "status":
      return { ...s, statuses: [...s.statuses, { id: s.statuses.length, message: e.message.replace(/\s+/g, " ").trim(), actor: e.actor, domain: e.domain, cached: e.cached, replay: e.replay, at }] };
    case "profile":
      return {
        ...s,
        profile: { profile: e.profile, assumptions: e.assumptions, people: e.people, partnerNotes: e.partnerNotes, source: e.source },
      };
    case "out_of_scope":
      return { ...s, phase: "out_of_scope", outOfScope: e.message, finishedAt: at };
    case "step": {
      const known = e.step.id in s.steps;
      return {
        ...s,
        steps: { ...s.steps, [e.step.id]: e.step },
        stepOrder: known ? s.stepOrder : [...s.stepOrder, e.step.id],
      };
    }
    case "stub":
      return { ...s, stubs: [...s.stubs.filter((x) => x.id !== e.stub.id), e.stub] };
    case "graph":
      return { ...s, graph: { graph: e.graph, criticalNode: e.criticalNode, order: e.order, deadlocks: e.deadlocks } };
    case "tip":
      return { ...s, tips: [...s.tips, e.tip] };
    case "conflict":
      return { ...s, conflicts: [...s.conflicts, e.conflict] };
    case "schedule":
      return { ...s, schedule: { schedule: e.schedule, criticalPath: e.criticalPath, visitChoices: e.visitChoices, baseline: e.baseline } };
    case "calendar":
      return { ...s, calendar: { events: e.events, icsUrl: e.icsUrl } };
    case "partial":
      return { ...s, partial: { message: e.message, missing: e.missing } };
    case "error":
      if (e.recoverable) {
        // A rejected request (empty / too long) arrives as a single recoverable error and nothing else.
        const nothingYet = s.statuses.length === 0 && !s.profile;
        return nothingYet ? { ...s, phase: "error", error: e.message, finishedAt: at } : { ...s, notes: [...s.notes, e.message] };
      }
      return { ...s, error: e.message };
    case "done": {
      const nothing = s.stepOrder.length === 0;
      if (nothing && s.stubs.length > 0 && !s.error)
        return { ...s, summary: e.summary, phase: "error", error: "I couldn't read the official sources right now, so I won't guess. Please try again in a moment, or check migri.fi and dvv.fi directly.", finishedAt: at };
      return { ...s, summary: e.summary, phase: s.error && nothing && s.stubs.length === 0 ? "error" : "done", finishedAt: at };
    }
  }
}

/** Parse an NDJSON body into events (browser). */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<PipelineEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as PipelineEvent;
    }
    if (done) break;
  }
  if (buf.trim()) yield JSON.parse(buf) as PipelineEvent;
}

/** True when the server is playing back a saved demo run (status lines paced from demo-cache). */
export const isReplaying = (statuses: readonly StatusLine[]) => statuses.some((s) => s.replay);
