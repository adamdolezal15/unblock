// Pipeline step 1: text -> Profile. LLM first (parseProfileLlm, cached through lib/llm); the deterministic
// parser below is the fallback when there is no key, the cache misses in read mode, or the LLM fails.
// Everything not stated in the text and filled by a default goes into `assumptions`. Answers from the clarify
// step (a "Citizenship: …. Purpose: …." clause, lib/agent/profileAnswers) override both parsers.
import { resolveProviderName } from "../llm";
import { parseProfileLlm } from "./parseProfileLlm";
import { applyAnswers } from "./profileAnswers";
import { helsinkiToday, parseProfileDeterministic, type ProfileResult } from "./parseProfileDeterministic";

export {
  has, helsinkiToday, parseAlreadyDone, parseDate, parseProfileDeterministic, parseSalary, SCOPE_MESSAGE, type ProfileResult,
} from "./parseProfileDeterministic";

export async function parseProfile(text: string, today: string = helsinkiToday()): Promise<ProfileResult> {
  if (resolveProviderName() === "anthropic") {
    try {
      const r = await parseProfileLlm(text.trim(), today);
      return applyAnswers({ ...r, source: "llm" }, text);
    } catch (e) {
      console.warn(`[parseProfile] LLM parse failed (${e instanceof Error ? e.message.slice(0, 120) : "error"}); using the deterministic parser`);
    }
  }
  return applyAnswers(parseProfileDeterministic(text, today), text);
}
