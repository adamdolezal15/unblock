// Prompt + output schema for "Ready to send" drafts (lib/agent/drafts). The model only phrases sentences from
// numbered facts that the run already verified; code checks every sentence (ids, numbers, emails, phones,
// urls) and adds the greeting, sign-off, footnotes and source list itself.
import { z } from "zod";
import type { LlmTask } from "../llm";

/** 3 properties, 2 levels. */
export const DraftExtraction = z.object({
  subject: z.string().describe("Short subject line (for a booking note: a short title). No names, numbers or dates unless a fact states them."),
  sentences: z
    .array(
      z.object({
        text: z.string().describe("One sentence of the draft, in the person's voice."),
        factIds: z.array(z.string()).describe("Ids of the facts (F1, P2, ...) this sentence relies on. Empty only for a sentence that states no fact."),
      }),
    )
    .max(10),
});
export type DraftExtraction = z.infer<typeof DraftExtraction>;

export const draftTask: LlmTask = {
  name: "draft",
  version: "1",
  systemPrompt: `You write a short, polite, plain-English draft for a person who is moving to Finland. The person will read it, edit it and send it themselves.

You get a GOAL and a numbered list of FACTS inside <user_input>. F-facts were verified on official or provider web pages; P-facts come from the person's own plan. Rules:
- Use only the facts. Every sentence that states something lists the ids of the facts it relies on in factIds. A sentence with an empty factIds may only be a courtesy or a request ("Could you please send me ...?") and must not state any fact.
- Never write a name, email address, phone number, street address, amount, percentage or date that is not written in the facts you cite. For anything personal or unknown, write a placeholder in square brackets: [Your name], [Employer name], [Bank name], [Your phone number], [Your start date], [Your address].
- Do not add a greeting or a sign-off; code adds them. Do not add footnote numbers or links; code adds them.
- 4 to 8 sentences, calm and friendly, no legal advice, no exaggeration. Paraphrase facts faithfully; keep numbers exactly as written in the facts.
- When a fact quotes a regulator (for example FIN-FSA), you may quote it in the sentence with quotation marks, word for word.`,
};

/** Per kind: what the draft is for. Code-written, never from the model. */
export const DRAFT_GOALS: Record<"employer" | "bank" | "booking", string> = {
  employer:
    "An email to the person's new employer (HR or payroll). 1) Say when they plan to get the Finnish tax card and that they will deliver it before the first payday, so that the higher withholding stated in the facts is not applied. 2) Ask the employer for the employment contract or employment certificate the person needs for their registration, as stated in the facts.",
  bank:
    "An email to a Finnish bank asking for an appointment to open an account with basic banking services (peruspankkipalvelut). Say what the person will bring, as stated in the facts. If a fact quotes the Finnish Financial Supervisory Authority (FIN-FSA) about what banks may require, mention it politely and quote it.",
  booking:
    "A short note the person keeps open while booking or at the service desk: which service to choose, what to write in a free-text field, what to bring and when they plan to go, all from the facts. Not an email: no request for a reply.",
};
