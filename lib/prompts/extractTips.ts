// Prompt + output schema for community tips about ONE step (lib/agent/findCommunityTips).
// The extractor never supplies waitDays: those are parsed from the verified quote in code.
import { z } from "zod";
import type { LlmTask } from "../llm";
import type { Profile, Step } from "../types";
import { describeProfile } from "./extractStep";

export const TIP_KINDS = ["wait_time", "trick", "gotcha", "document"] as const;

/** 5 properties, 2 levels: inside Exa's outputSchema limits. */
export const TipExtraction = z.object({
  tips: z
    .array(
      z.object({
        kind: z.enum(TIP_KINDS),
        tip: z.string().describe("One short actionable English sentence for a newcomer, faithful to the quote. No facts the quote does not state."),
        url: z.string().describe("URL of the page the quote is copied from"),
        quote: z
          .string()
          .describe("ONE complete sentence copied character-for-character from that page. No paraphrase, no translation, no merging of sentences."),
      }),
    )
    .max(8),
});
export type TipExtraction = z.infer<typeof TipExtraction>;

export const extractTipsTask: LlmTask = {
  name: "extractTips",
  version: "1",
  systemPrompt: `You extract lived-experience tips about ONE bureaucratic step in Finland from forums, blogs, Q&A sites and university guides.

Return tips. Each tip has a kind, a short tip text, the url of the page, and a quote.
The quote is the evidence: exactly one sentence copied character-for-character from that page, in the page's language. Do not paraphrase, shorten, translate, or join sentences. If you cannot quote a sentence that states the tip, leave the tip out. Fewer true tips are better than many weak ones.

Kinds:
- wait_time: how long people actually waited for THIS step: for an appointment, in the queue for days, or for the result/card to arrive. The quote must contain the duration with its unit (days, weeks, months). Hours spent in a queue on the day are a trick or gotcha, not a wait_time.
- trick: something people did that made it faster or easier (booking at a certain time, cancelled slots, a different office, a walk-in option).
- gotcha: something that went wrong or surprised people (rejected, sent home, extra step nobody mentioned).
- document: something people say they forgot to bring or were asked for unexpectedly.

Rules:
- Only tips about THIS step in Finland. Skip other countries, other steps, and general life advice.
- Skip sentences that only restate an official rule with no experience behind it; official pages are covered elsewhere.
- Prefer the person's city when the source names a city; skip tips that are clearly about a different city's office.
- Skip content that says it is outdated or describes a process the source says has changed.
- The tip text must not add numbers, places or rules that the quote does not state.`,
};

/** Per-call context: profile and which step. */
export function extractTipsContext(profile: Profile, step: Pick<Step, "id" | "title" | "authority">, label: string): string {
  return `${describeProfile(profile)}

Step: ${step.id} (${label}). Authority: ${step.authority}. Title from official sources: ${step.title}.`;
}
