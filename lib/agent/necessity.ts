// Required or optional, per step, from the profile (purpose + stay length). Pure, no new facts.
// For a study stay under 12 months (stated, or a one-term stay like Erasmus), the everyday-life steps are
// optional: a bank account, strong ID, the police ID card and Kela. A step stays required when one of its own
// verified sentences says the person must do it, or when a required step needs it (closure over requires).
import type { Profile, Step } from "../types";

export const OPTIONAL_FOR_SHORT_STUDY: ReadonlySet<string> = new Set(["bank_account", "strong_identification", "police_id_card", "kela_registration"]);

/** Study only, staying under 12 months (stated length, or a one-term stay). */
export function shortStudyStay(p: Pick<Profile, "purpose" | "stayMonths" | "termStay">): boolean {
  const studyOnly = p.purpose.length > 0 && p.purpose.every((x) => x === "study");
  return studyOnly && ((p.stayMonths !== undefined && p.stayMonths < 12) || (p.stayMonths === undefined && !!p.termStay));
}

/** An obligation addressed to the person ("you must", "is compulsory"), not "you can" / "usually". */
const MUST = /\byou (must|need to|have to|are required to|are obliged to)\b|\b(is|are) (compulsory|mandatory|obligatory)\b|\bobliged\b/i;
/** ...that holds for everyone, not only for long or permanent residents. */
const LONG_ONLY = /\bpermanent(ly)?\b|\b(longer|more) than (a|one|1) year\b|\bat least (a|one|1) year\b|\b(1[2-9]|[2-9]\d) months\b|\bif you (live|work)\b/i;

/** A verified sentence on this step saying the person must do it. */
export function verifiedMust(step: Step): boolean {
  return (step.claims ?? []).some((c) => (c.kind === "applies" || c.kind === "cost_of_delay") && c.stepId === step.id && MUST.test(c.citation.quote) && !LONG_ONLY.test(c.citation.quote));
}

export function classifyNecessity(steps: Step[], profile: Profile, opts: { forcedOptional?: ReadonlySet<string> } = {}): Step[] {
  const short = shortStudyStay(profile);
  const forced = opts.forcedOptional ?? new Set<string>();
  const reason = new Map<string, "short_stay" | "your_choice">();
  const optional = new Set<string>();
  for (const s of steps) {
    if (s.done || s.milestone) continue;
    // "I don't need it" is the person's own statement and outranks a verified "must" (a required step still pulls it back in below).
    if (forced.has(s.id)) {
      optional.add(s.id);
      reason.set(s.id, "your_choice");
    } else if (short && OPTIONAL_FOR_SHORT_STUDY.has(s.id) && !verifiedMust(s)) {
      optional.add(s.id);
      reason.set(s.id, "short_stay");
    }
  }
  // Whatever a required step needs is required too (a plain requirement or a one-option group).
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of steps) {
      if (optional.has(s.id)) continue;
      // An any-of group with no required option: its first option becomes required.
      const needs = [...s.requires, ...(s.requiresAnyOf ?? []).filter((g) => g.length && g.every((o) => optional.has(o))).map((g) => g[0])];
      for (const id of needs) if (optional.delete(id)) changed = true;
    }
  }
  return steps.map((s) => {
    const { optionalReason: _old, ...rest } = s;
    void _old;
    return optional.has(s.id)
      ? { ...rest, necessity: "optional" as const, optionalReason: reason.get(s.id) }
      : { ...rest, necessity: "required" as const };
  });
}
