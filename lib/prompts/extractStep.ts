// Prompt + output schema for extracting one step's claims from sources (lib/agent/findSteps).
// Same text for every provider; lib/llm decides how it is sent.
import { z } from "zod";
import type { LlmTask } from "../llm";
import type { Profile } from "../types";
import { MILESTONES, type StepDef } from "../agent/stepTaxonomy";

export const CLAIM_KINDS = [
  "applies",
  "requires",
  "provides",
  "same_visit",
  "mode",
  "document",
  "cost_of_delay",
  "processing_time",
  "address",
  "hours",
  "booking_url",
] as const;

/** 6 properties, 2 levels: inside Exa's outputSchema limits (checked by lib/llm/schema.ts). */
export const StepExtraction = z.object({
  title: z.string().describe("Short English name of this step as the sources describe it"),
  claims: z
    .array(
      z.object({
        kind: z.enum(CLAIM_KINDS),
        value: z
          .string()
          .describe(
            "requires: exactly one id from the allowed list; provides: personal_identity_code; same_visit: the other step's id; mode: online | in_person | either; applies: yes; otherwise a short plain-English value",
          ),
        url: z.string().describe("URL of the page the quote is copied from"),
        quote: z
          .string()
          .describe("ONE complete sentence copied character-for-character from that page. No paraphrase, no translation, no merging of sentences."),
      }),
    )
    .max(12),
});
export type StepExtraction = z.infer<typeof StepExtraction>;

export const extractStepTask: LlmTask = {
  name: "extractStep",
  version: "5",
  systemPrompt: `You extract facts about ONE bureaucratic step for a person moving to Finland, from official sources only.

Return claims. Each claim has a kind, a value, the url of the page, and a quote.
The quote is the evidence: exactly one sentence copied character-for-character from that page, in the page's language. Do not paraphrase, shorten, translate, or join sentences. If you cannot quote a sentence that states the claim, leave the claim out. Fewer true claims are better than many weak ones.

Kinds:
- applies: a sentence showing this step must be done by someone in the person's situation. value "yes". Include at most two.
- requires: a sentence stating this step cannot be done until another step is completed. value = the id of that other step from the allowed list. Use a separate claim per prerequisite step. Never put ordinary documents (passport, contract) here, BUT if a required document is the result of another step in the allowed list (for example a registration certificate, a residence permit card, a bank account), also make a requires claim for that step, quoting the sentence that asks for the document.
  Only MANDATORY prerequisites for THIS person's situation count. Do NOT make a requires claim when:
  - the sentence is conditional on a situation that does not match the person ("if you apply on the basis of studies…" for someone who also works, "if you need a permit…" for someone who doesn't);
  - the prerequisite is only needed for one of several ways to do the step ("you can do it online if you have online banking codes" when it can also be done in person);
  - the thing can be obtained as part of this step itself, at the same office or in the same application (for example an identifier that this same authority issues during the step);
  - the sentence only says who issues something, or that something is "useful" or "usually" needed.
  When in doubt, leave the requires claim out.
  Personal identity code: if the sentence says you need a Finnish personal identity code (henkilötunnus) for this step, ALWAYS make a requires claim with value personal_identity_code, even when this same authority can issue the code (the exclusions above do not apply here; the plan handles where the code comes from). NEVER use dvv_registration for this. Use dvv_registration only when the sentence requires being registered in the Population Information System or having a municipality of residence.
- provides: a sentence stating that this step gives the person a Finnish personal identity code (it is issued during or as a result of this step). value = personal_identity_code.
- same_visit: a sentence stating that this step and another step from the allowed list can be done at the same service desk in ONE visit (for example getting a personal identity code and a tax card at the same Vero desk). value = the id of that other step; for getting the identity code at the same desk use the step that issues it there (e.g. vero_identity_code), never personal_identity_code. Only when the sentence says both happen at the same place in the same visit.
- document: something to bring or attach (passport, employment contract, lease...). value = the document.
- mode: whether it is done online, in person, or either. value = online | in_person | either.
- cost_of_delay: what happens if this step is late or missing (penalty, extra tax withheld, no access to a service). value = short consequence.
- processing_time: how long processing takes. value = the duration.
- address, hours, booking_url: where and when to do it in person, and the booking link, for the person's city.`,
};

function describeProfile(p: Profile): string {
  const who =
    p.citizenship === "EU"
      ? "an EU citizen (not from a Nordic country)"
      : p.citizenship === "NORDIC"
        ? "a citizen of a Nordic country"
        : p.temporaryProtection
          ? "a non-EU citizen under temporary protection"
          : "a non-EU citizen";
  const parts = [`The person is ${who}, moving to ${p.city}, Finland, for ${p.purpose.join(" and ")}.`];
  if (p.arrivalDate) parts.push(`Arrival: ${p.arrivalDate}.`);
  if (p.monthlySalaryEur) parts.push(`Monthly salary about ${p.monthlySalaryEur} EUR.`);
  if (p.hasFamily) parts.push("Moving with family.");
  if (p.stayMonths) parts.push(`Planned stay: ${p.stayMonths} months.`);
  return parts.join(" ");
}

/** Per-call context: profile, which step, and the ids `requires` may point to. */
export function extractStepContext(profile: Profile, step: StepDef, allSteps: StepDef[]): string {
  const ids = [
    ...allSteps.filter((s) => s.id !== step.id).map((s) => `- ${s.id}: ${s.label}`),
    ...Object.entries(MILESTONES).map(([id, m]) => `- ${id}: having a ${m.label} (from any authority)`),
  ].join("\n");
  return `${describeProfile(profile)}

Step being researched: ${step.id} (${step.label}).

Allowed step ids for "requires" claims:
${ids}`;
}
