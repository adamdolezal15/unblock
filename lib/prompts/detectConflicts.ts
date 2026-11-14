// Prompt + output schema for cross-source conflicts on ONE step (lib/agent/detectConflicts).
// Both quotes are verified in code; anything not verified, or not judged a contradiction, is dropped.
import { z } from "zod";
import type { LlmTask } from "../llm";
import type { Profile, Step } from "../types";
import { describeProfile } from "./extractStep";

/** 9 properties, 2 levels: inside Exa's outputSchema limits. */
export const ConflictExtraction = z.object({
  conflicts: z
    .array(
      z.object({
        topic: z.string().describe("The single fact both sources talk about, e.g. 'personal identity code needed to open an account'"),
        aUrl: z.string(),
        aQuote: z.string().describe("ONE sentence copied character-for-character from the page at aUrl"),
        bUrl: z.string(),
        bQuote: z.string().describe("ONE sentence copied character-for-character from the page at bUrl"),
        verdict: z
          .enum(["contradiction", "nuance", "same"])
          .describe("contradiction only if both sentences cannot be true for this person at the same time"),
        note: z.string().describe("One sentence naming each source by organisation or site, e.g. 'DVV says …; FIN-FSA says …'"),
        whatToDo: z.string().describe("Two or three sentences of practical guidance (see the rules); not legal advice"),
      }),
    )
    .max(4),
});
export type ConflictExtraction = z.infer<typeof ConflictExtraction>;

export const detectConflictsTask: LlmTask = {
  name: "detectConflicts",
  version: "1",
  systemPrompt: `You check whether sources DISAGREE about one fact of ONE bureaucratic step for a person moving to Finland.

Each source has a trust label: official (Finnish authorities and regulators), provider (banks and other service providers stating their own rules), university, news, community (forums, blogs). Authorities and regulators outrank providers; providers outrank universities, news and community.

Report a pair only when two sources state incompatible things about the same fact for this person: one says X is required / takes N days / is possible, the other says X is not required / takes a clearly different time / is not possible. Precision matters more than recall:
- Not a conflict: one source is more detailed, covers a different situation, a different city or office, or a different step; "usually" vs a specific case; a general rule and its stated exception on the same page.
- A regulator saying a service may not be made conditional on something, while a provider or another authority says that thing is needed, IS a conflict about the same fact.
- Mark verdict "contradiction" only when both cannot be true at the same time for this person. Otherwise "nuance" or "same".

Quotes: copy exactly one sentence character-for-character from each source, the sentence that states that source's side. Use the exact url of each source. A and B must be different pages.

whatToDo: practical guidance in plain English, two or three sentences. Say which source to rely on and why (who sets or enforces the rule vs who applies it, how recent or first-hand it is), and what the person can do in practice (for example ask for the service by its official name, bring a document anyway, check with the authority). Phrase it as guidance, not legal advice: no "you are legally entitled", no guarantees.`,
};

export function detectConflictsContext(profile: Profile, step: Pick<Step, "id" | "title" | "authority">): string {
  return `${describeProfile(profile)}

Step: ${step.id} (${step.title}). Authority: ${step.authority}.`;
}
