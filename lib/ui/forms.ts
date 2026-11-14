// Official forms as the UI shows them: one line per form with its footnote, and the list for "Ready to send".
// Pure. A form is on a step only if lib/agent/forms found a verified sentence for it.
import type { Citation, Step, StepForm } from "@/lib/types";
import type { Ref, Seg } from "./letter";
import type { RunState } from "./runState";

export type FormLine = { form: StepForm; segs: Seg[]; /** The link: the form itself, else the official page that names it. */ href: string; linkLabel: string };

/** "Form 6150e: fill in before you go, sign at the office" + its footnote. */
export function formLine(form: StepForm, ref: (c: Citation) => Ref): FormLine {
  const text = form.guidance ? `${form.name}: ${form.guidance}` : form.name;
  return {
    form,
    segs: [{ t: text }, { ref: ref(form.citation) }],
    href: form.url ?? form.citation.url,
    linkLabel: form.url ? (form.type === "pdf" ? "Open official form (PDF)" : "Open official form") : "Open the official page",
  };
}

/** The forms of the steps a person actually has to do: not done, not optional, not milestones. */
export function requiredForms(state: RunState): { stepId: string; step: Step; form: StepForm }[] {
  return state.stepOrder
    .map((id) => state.steps[id])
    .filter((s): s is Step => !!s && !s.milestone && !s.done && s.necessity !== "optional")
    .flatMap((step) => (step.forms ?? []).map((form) => ({ stepId: step.id, step, form })));
}

/** Every form once (same number on two steps is one form), with the steps that ask for it. */
export function allForms(state: RunState): { form: StepForm; steps: Step[] }[] {
  const by = new Map<string, { form: StepForm; steps: Step[] }>();
  for (const { step, form } of requiredForms(state)) {
    const key = form.id.toLowerCase().replace(/[\s_-]+/g, "");
    const e = by.get(key);
    if (e) {
      if (!e.steps.includes(step)) e.steps.push(step);
      if (!e.form.url && form.url) e.form = form;
    } else by.set(key, { form, steps: [step] });
  }
  return [...by.values()];
}
