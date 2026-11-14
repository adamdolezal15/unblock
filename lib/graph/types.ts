import type { Step } from "../types";

/** A node in the dependency graph. Placeholder nodes stand in for `requires` ids no step defines. */
export type GraphNode = {
  id: string;
  title: string;
  authority: string;
  mode: Step["mode"];
  costOfDelay?: string;
  /** true when some step requires this id but no step with this id was found. */
  unresolved: boolean;
  /** The original step; absent on unresolved placeholders. */
  step?: Step;
};

/** `source` must be done before `target` can start ("target requires source"). React Flow convention. */
export type GraphEdge = { id: string; source: string; target: string };

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** A requirement cycle. `stepIds` is ordered so each step requires the next, and the last requires the first. */
export type Deadlock = { stepIds: string[]; explanation: string };

export type TopoResult = {
  /** Steps that can actually be done, prerequisites first. */
  order: string[];
  deadlocks: Deadlock[];
  /** Steps that cannot be ordered: members of a cycle or downstream of one. */
  blocked: string[];
};

/** Per-step duration in working days. Comes from community data when available. */
export type DurationEstimate = {
  /** Working days of the user's own effort (the visit, filling the form). */
  durationDays?: number;
  /** Working days waiting for the authority afterwards (processing, card in the mail). */
  waitDays?: number;
};

export type ScheduleOptions = {
  /** YYYY-MM-DD in Helsinki. Defaults to the current Helsinki date. */
  today?: string;
  /** Known estimates by step id (typically from community tips). */
  estimates?: Record<string, DurationEstimate>;
  /** Used for whatever `estimates` does not cover. Results are flagged `estimated: true`. */
  defaults?: Required<DurationEstimate>;
  /** Extra non-working days (YYYY-MM-DD), e.g. Finnish public holidays. */
  holidays?: string[];
};

export type ScheduledStep = {
  stepId: string;
  /** First working day of the step. */
  startDate: string;
  /** Last working day of the user's own effort. */
  endDate: string;
  /** Last day of waiting: the outcome is in hand at the end of this day. */
  doneDate: string;
  /** First working day dependents may start. */
  readyDate: string;
  /** Working-day offsets from the schedule start (day 0). */
  startIndex: number;
  readyIndex: number;
  durationDays: number;
  waitDays: number;
  /** true when either duration fell back to a default. */
  estimated: boolean;
};

export type Schedule = {
  /** First working day on or after max(arrival, today). */
  startDate: string;
  items: Record<string, ScheduledStep>;
  /** Scheduled step ids, in topological order. */
  order: string[];
  /** Steps left unscheduled because they are in or behind a deadlock. */
  blocked: string[];
  deadlocks: Deadlock[];
};

export type CriticalPath = {
  stepIds: string[];
  /** Working days from the schedule start until the last step on the path is done. */
  totalDays: number;
  /** Calendar days, start date and done date inclusive (0 for an empty path). */
  calendarDays: number;
};
