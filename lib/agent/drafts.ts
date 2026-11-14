// "Ready to send" drafts, generated on demand (a button click, POST /api/drafts), never during the run.
// The model phrases sentences from the run's verified facts (lib/prompts/drafts.ts) through lib/llm extract,
// so every draft is disk-cached (LLM_CACHE, demo-cache/ for the demo). Code then checks each sentence
// (lib/agent/draftOffers checkSentences) and adds greeting, footnotes and sources. If too little survives,
// a plain template built from the same facts is used instead: a draft never states an unverified fact.
import { extract } from "../llm";
import { DRAFT_GOALS, DraftExtraction, draftTask } from "../prompts/drafts";
import {
  bookingLink,
  checkedSubject,
  checkSentences,
  draftFacts,
  draftOffers,
  factsBlock,
  renderDraft,
  templateSentences,
  type Draft,
  type DraftSource,
} from "./draftOffers";

export { draftOffers } from "./draftOffers";
export type { Draft, DraftOffer, DraftSource } from "./draftOffers";

/** Fewer checked sentences than this (with at least one footnote) and the template is used. */
const MIN_SENTENCES = 3;

export async function generateDraft(src: DraftSource, offerId: string): Promise<Draft | null> {
  const offer = draftOffers(src).find((o) => o.id === offerId);
  if (!offer) return null;
  const facts = draftFacts(src, offer);
  if (!facts.some((f) => f.url)) return null;
  const step = src.steps.find((s) => s.id === offer.stepId);
  const bookingUrl = offer.kind === "booking" ? bookingLink(step) : undefined;

  let raw: DraftExtraction | null = null;
  try {
    const res = await extract(
      draftTask,
      {
        query: `GOAL: ${DRAFT_GOALS[offer.kind]}\n\nFACTS:\n${factsBlock(facts)}`,
        context: offer.kind === "booking" ? `Note for: ${step?.title ?? offer.stepId} (${step?.authority ?? ""})` : `Draft: ${offer.title}`,
        includeDomains: [],
        docs: [],
      },
      DraftExtraction,
    );
    raw = res.data;
  } catch (e) {
    console.warn(`[drafts] model draft failed (${e instanceof Error ? e.message.slice(0, 120) : "error"}); using the template`);
  }

  const checked = raw ? checkSentences(raw.sentences, facts) : null;
  if (raw && checked && checked.sentences.length >= MIN_SENTENCES && checked.sources.length > 0) {
    return renderDraft(offer, checkedSubject(raw.subject, offer.kind, facts, offer.title), checked.sentences, checked.sources, "claude", bookingUrl);
  }
  const t = checkSentences(templateSentences(offer.kind, facts), facts);
  return renderDraft(offer, checkedSubject("", offer.kind, facts, offer.title), t.sentences, t.sources, "template", bookingUrl);
}
