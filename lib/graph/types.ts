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
  /** A state, not an action (e.g. "has a personal identity code"): takes no time, never the critical node. */
  milestone: boolean;
  /** Steps sharing a visitId are done together in one visit at the same service desk. */
  visitId?: string;
  /** The original step; absent on unresolved placeholders. */
  step?: Step;
};

/**
 * `source` must be done before `target` can start ("target requires source"). React Flow convention.
 * Edges with the same `anyOf` group id are alternatives: ONE of them is enough.
 */
export type GraphEdge = { id: string; source: string; target: string; anyOf?: string };

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
  /** Where waitDays comes from. Community-sourced waits must be labelled as such to the user. */
  waitSource?: import("../types").Trust;
  /** Provenance shown with the schedule item, e.g. "wait from community reports (reddit.com), not official". */
  note?: string;
};

export type ScheduleOptions = {
  /** YYYY-MM-DD in Helsinki. Defaults to the current Helsinki date. */
  today?: string;
  /** Known estimates by step id (typically from community tips). */
  estimates?: Record<string, DurationEstimate>;
  /** Used for whatever `estimates` does not cover. Results are flagged `estimated: true`. */
  defaults?: Required<DurationEstimate>;
  /**
   * Non-working days besides weekends. Default: Finnish public holidays (incl. Christmas Eve and
   * Midsummer Eve) for the start year and the two after. Pass [] for none.
   */
  holidays?: (string | { date: string; name: string })[];
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
  /** true when the wait fell back to a default (no cited or community-reported wait). */
  estimated: boolean;
  /** Provenance of waitDays, copied from the estimate. */
  waitSource?: import("../types").Trust;
  note?: string;
  /** Set when a public holiday pushed this step's start, e.g. { from: "2026-12-24", holiday: "Christmas Eve" }. */
  movedBy?: { from: string; holiday: string };
  /** Set when this step is done in a shared visit (same start day as its visit-mates). */
  visitId?: string;
  /** The declared visit group this step belongs to (see Schedule.visitChoices), merged or not. */
  visitGroup?: string;
};

export type Schedule = {
  /** First working day on or after max(arrival, today). */
  startDate: string;
  /** The calendar day the scheduler started from (arrival or today, before skipping weekends and holidays). Re-planning passes it back as "today". */
  origin?: string;
  items: Record<string, ScheduledStep>;
  /** Scheduled step ids, in topological order. */
  order: string[];
  /** Steps left unscheduled because they are in or behind a deadlock. */
  blocked: string[];
  deadlocks: Deadlock[];
  /** One per visit group: merged vs separate, the scheduler's pick, and the rejected alternative. */
  visitChoices: import("./schedule").VisitChoice[];
};

export type CriticalPath = {
  stepIds: string[];
  /** Working days from the schedule start until the last step on the path is done. */
  totalDays: number;
  /** Calendar days, start date and done date inclusive (0 for an empty path). */
  calendarDays: number;
};
