// "Make it more accurate": yes/no answers that re-run only the pure part of the pipeline (necessity +
// graph + schedule + calendar + counts) on the steps a run already found. No Exa, no LLM, no network, so it
// is instant in the browser and the server can repeat it for the .ics. Nothing is searched again and no
// claim is added: an answer only marks a step done, optional, or changes the stay length used for "optional".
import { attachTips } from "../agent/attachTips";
import { classifyNecessity } from "../agent/necessity";
import { doneSteps } from "../agent/stepTaxonomy";
import { buildGraph, criticalNode, topoOrder } from "../graph";
import type { Deadlock, Graph } from "../graph/types";
import type { Profile, Step, Tip } from "../types";
import { planCounts, schedulePlan, type PlanCounts, type SchedulePlan } from "./plan";

export const REFINE_KEYS = ["has_code", "has_bank", "no_bank", "short_stay", "long_stay"] as const;
export type RefineKey = (typeof REFINE_KEYS)[number];

export const REFINE_LABEL: Record<RefineKey, string> = {
  has_code: "I already have a Finnish personal identity code",
  has_bank: "I already have a Finnish bank account",
  no_bank: "I don't need a Finnish bank account",
  short_stay: "I'm staying less than 12 months",
  // Only ever shown as the unchecked state of "I'm staying less than 12 months" (a run that assumed a one-term stay).
  long_stay: "I'm staying 12 months or longer",
};

/** The URL parameter that holds the answers: /?r=has_code,no_bank */
export const REFINE_PARAM = "r";

const CODE = "personal_identity_code";
const VERO_CODE = "vero_identity_code";
const BANK = "bank_account";
/** Months used for the stay answers: only "under 12 months or not" matters for what is optional. */
const SHORT_STAY_MONTHS = 6;
const LONG_STAY_MONTHS = 12;

/** Answers that exclude each other: the first one named wins. */
const EXCLUDES: Partial<Record<RefineKey, RefineKey>> = { has_bank: "no_bank", no_bank: "has_bank", short_stay: "long_stay", long_stay: "short_stay" };

/** Valid keys from a URL value, in canonical order; of two answers that exclude each other, the earlier one wins. */
export function parseRefinements(value: string | null | undefined): RefineKey[] {
  const asked = new Set((value ?? "").split(",").map((x) => x.trim()));
  const keys = REFINE_KEYS.filter((k) => asked.has(k));
  return keys.filter((k) => !(EXCLUDES[k] && keys.indexOf(EXCLUDES[k]!) >= 0 && keys.indexOf(EXCLUDES[k]!) < keys.indexOf(k)));
}

export const serializeRefinements = (keys: readonly RefineKey[]) => REFINE_KEYS.filter((k) => keys.includes(k)).join(",");

/** What a run already holds, as far as re-planning needs it. */
export type RefineInput = {
  profile: Profile;
  /** The steps as the run produced them (after its own necessity pass), in run order. */
  steps: Step[];
  tips: Tip[];
  /** The day the run's schedule started from (Schedule.origin): used as "today", so the refined plan starts the same way. */
  startDate: string;
};

export type RefinedPlan = {
  steps: Step[];
  graph: { graph: Graph; criticalNode: string | null; order: string[]; deadlocks: Deadlock[] };
  plan: SchedulePlan;
  counts: PlanCounts;
};

const has = (steps: Step[], id: string) => steps.some((s) => s.id === id);

/** The steps with the answers applied (done / removed / forced optional). Pure, input untouched. */
function applyAnswers(input: RefineInput, keys: readonly RefineKey[]): { steps: Step[]; profile: Profile; forcedOptional: Set<string> } {
  let steps = input.steps;
  let profile = input.profile;
  const forced = new Set<string>();
  const done = (id: string, drop: string[] = []) => {
    const stand = doneSteps({ citizenship: "EU", purpose: [], city: "", alreadyDone: [id] })[0];
    const gone = new Set(drop);
    steps = steps
      .filter((s) => !gone.has(s.id))
      .map((s) => {
        if (s.id === id) return stand;
        if (!gone.size) return s;
        // No step waits for a step that no longer exists.
        const requiresAnyOf = s.requiresAnyOf?.map((g) => g.filter((x) => !gone.has(x))).filter((g) => g.length);
        return { ...s, requires: s.requires.filter((x) => !gone.has(x)), ...(requiresAnyOf ? { requiresAnyOf } : {}) };
      });
  };
  if (keys.includes("has_code") && has(steps, CODE)) done(CODE, [VERO_CODE]);
  if (keys.includes("has_bank") && has(steps, BANK)) done(BANK);
  else if (keys.includes("no_bank") && has(steps, BANK)) forced.add(BANK);
  if (keys.includes("short_stay")) profile = { ...profile, stayMonths: SHORT_STAY_MONTHS };
  else if (keys.includes("long_stay")) profile = { ...profile, stayMonths: LONG_STAY_MONTHS, termStay: false };
  // A visit shared with a step that is gone is no shared visit.
  const members = new Map<string, number>();
  for (const s of steps) if (s.visitId && !s.milestone) members.set(s.visitId, (members.get(s.visitId) ?? 0) + 1);
  steps = steps.map((s) => {
    if (!s.visitId || (members.get(s.visitId) ?? 0) >= 2) return s;
    const { visitId: _unshared, ...rest } = s;
    void _unshared;
    return rest;
  });
  return { steps, profile, forcedOptional: forced };
}

/** The plan with these answers applied. With no answers it is the run's own plan, recomputed. */
export function refine(input: RefineInput, keys: readonly RefineKey[]): RefinedPlan {
  const r = replan(input, keys);
  // The run compared itself with the usual order, and the person already holds the identity code: nothing is
  // left to route differently, so both orders coincide. Keep the comparison ("matches the usual order")
  // instead of silently dropping it, and never fall back to another yardstick.
  if (keys.length && !r.plan.baseline && keys.includes("has_code") && replan(input, []).plan.baseline) {
    const startDates: Record<string, string> = {};
    const readyDates: Record<string, string> = {};
    for (const [id, it] of Object.entries(r.plan.schedule.items)) {
      startDates[id] = it.startDate;
      readyDates[id] = it.readyDate;
    }
    return { ...r, plan: { ...r.plan, baseline: { endDate: r.counts.criticalPath.endDate, visits: r.counts.inPersonVisits, startDates, readyDates, skipped: [] } } };
  }
  return r;
}

function replan(input: RefineInput, keys: readonly RefineKey[]): RefinedPlan {
  const applied = applyAnswers(input, keys);
  const steps = classifyNecessity(applied.steps, applied.profile, { forcedOptional: applied.forcedOptional });
  const graph = buildGraph(steps);
  const topo = topoOrder(graph);
  // Same shape as the pipeline's `graph` event: nodes do not carry their Step.
  const slim: Graph = { nodes: graph.nodes.map((n) => ({ ...n, step: undefined })), edges: graph.edges };
  const plan = schedulePlan(attachTips(steps, input.tips), input.tips, applied.profile, input.startDate);
  return {
    steps,
    graph: { graph: slim, criticalNode: criticalNode(graph), order: topo.order, deadlocks: topo.deadlocks },
    plan,
    counts: planCounts(steps, plan.schedule, plan.path, plan.events),
  };
}

/** What the person would notice about the plan: when it is done, how many visits, which steps are required. Nothing else counts. */
export function planSignature(r: RefinedPlan): string {
  const required = r.steps.filter((s) => !s.milestone && !s.done && s.necessity !== "optional");
  return JSON.stringify({
    end: r.counts.criticalPath.endDate,
    visits: r.counts.inPersonVisits,
    steps: required.map((s) => s.id).sort(),
  });
}

/** The stay-length answer that flips this run's default: the run took a one-term stay for granted, or knows nothing about the length. */
function stayKey(profile: Profile): RefineKey | null {
  const studyOnly = profile.purpose.length > 0 && profile.purpose.every((p) => p === "study");
  if (!studyOnly || profile.stayMonths !== undefined) return null; // not a study stay, or the person gave a length: nothing to ask
  return profile.termStay ? "long_stay" : "short_stay";
}

/** One yes/no question under the headline. `next` is the full set of answers after clicking it. */
export type RefineRow = { id: string; label: string; checked: boolean; next: RefineKey[] };

/** Click `key`: it is added or removed; an answer that excludes it is cleared. */
export function toggleRefinement(active: readonly RefineKey[], key: RefineKey): RefineKey[] {
  if (active.includes(key)) return active.filter((k) => k !== key);
  return REFINE_KEYS.filter((k) => k === key || (active.includes(k) && k !== EXCLUDES[key]));
}

/**
 * At most `max` questions for this plan, those already answered always among them. A question is only asked when
 * the answer would change the plan ("Set up by", the number of visits, or which steps are required), and only about something this run
 * could not know or assumed: the personal identity code, the bank account, the stay length.
 */
export function refineRows(input: RefineInput, active: readonly RefineKey[], max = 3): RefineRow[] {
  const base = planSignature(refine(input, []));
  const stay = stayKey(input.profile);
  const hasStep = (id: string) => input.steps.some((s) => s.id === id && !s.done && !s.milestone);
  const candidates: { id: string; key: RefineKey; label: string; applies: boolean; invert?: boolean }[] = [
    { id: "has_code", key: "has_code", label: REFINE_LABEL.has_code, applies: input.steps.some((s) => s.id === CODE && !s.done) },
    // The run assumed a one-term stay (checked): unchecking it says "12 months or longer".
    { id: "stay", key: stay ?? "short_stay", label: REFINE_LABEL.short_stay, applies: stay !== null, invert: stay === "long_stay" },
    { id: "has_bank", key: "has_bank", label: REFINE_LABEL.has_bank, applies: hasStep(BANK) },
    { id: "no_bank", key: "no_bank", label: REFINE_LABEL.no_bank, applies: hasStep(BANK) },
  ];
  const rows = candidates
    // Only a question whose answer visibly changes this plan; an answer that would change nothing is not shown, even if the URL holds it.
    .filter((c) => c.applies && planSignature(refine(input, [c.key])) !== base)
    .map((c) => ({
      answered: active.includes(c.key),
      row: { id: c.id, label: c.label, checked: c.invert ? !active.includes(c.key) : active.includes(c.key), next: toggleRefinement(active, c.key) } satisfies RefineRow,
    }));
  const chosen = new Set(rows.filter((r) => r.answered).map((r) => r.row.id));
  for (const r of rows) if (chosen.size < max) chosen.add(r.row.id);
  return rows.filter((r) => chosen.has(r.row.id)).map((r) => r.row);
}
