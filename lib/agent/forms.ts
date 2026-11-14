// Official forms (phase 1: link + guidance). For each required step, read its official source pages with the
// links Exa found on them (getPages extras.links) and pick out forms a verified sentence says are needed.
// No LLM and no guessing: a form is shown only when (a) a sentence on an official page (or an existing
// verified quote of the step) names it by number, checked against the page text like every other quote, and
// (b) any link shown comes from the page's own links, on an official domain, and carries that number.
import type { Progress } from "../events/context";
import { cityDomains, trustOf } from "../exa/domains";
import { getPages } from "../exa/search";
import type { Citation, ExaDoc, Step, StepForm } from "../types";
import { findQuote, MATCH_THRESHOLD, MIN_QUOTE_TOKENS, normalizeUrl } from "./verifyCitations";

/** "form 6150e", "Form OL 1", "lomake 6150e", "application form 4001". Group 1 is the form's number. */
const FORM_MENTION = /\b(?:application\s+)?(?:form|forms|lomake|blankett)\s+(?:no\.?\s*|number\s+)?((?:[A-Z]{1,3}[ _-]?)?\d{1,5}[a-z]?(?:[_-][a-z0-9]+)?)(?![\w])/gi;

/** Words that make a sentence say a form is needed or what to do with it. */
const NEEDED = /\b(fill(ed)? (it )?(in|out)|complete[d]?|submit(ted)?|attach(ed)?|enclose[d]?|bring|take|sign(ed)?|must|need(s|ed)?|required|requires?|have to|apply (with|using|by)|use (the )?form|send)\b/i;

const MAX_PAGES_PER_STEP = 3;
const MAX_FORMS_PER_STEP = 3;
const PAGE_CHARS = 20_000;
const MAX_LINKS = 100;

export type FormPage = { url: string; text: string; links: string[]; fetchedAt: string };

const compact = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** Sentences of a page as readable text (markdown links reduced to their words). */
export function sentences(text: string): string[] {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/(?<=[.!?:])\s+(?=[A-Z0-9"“(])|\n+/)
    .map((s) => s.replace(/^[\s>*#\-•]+/, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 25 && s.length <= 400);
}

/** What the sentence says to do with the form, in a few words. Null when it says nothing of the kind. */
export function guidanceOf(sentence: string): string | null {
  const parts: string[] = [];
  const before = /\b(fill(ed)? (it )?(in|out)|complete[d]?)\b[^.]*\b(before|beforehand|in advance|prior to)\b|\b(before|beforehand|in advance)\b[^.]*\bfill(ed)? (in|out)\b/i.test(sentence);
  const sign = /\bsign(ed)?\b[^.]*\b(at (the )?(tax )?(office|service point|police|station)|in person|in the presence|there)\b/i.test(sentence);
  const online = /\b(fill(ed)? (it )?(in|out)|submit(ted)?|send|sent|complete[d]?)\b[^.]*\b(online|electronically|e-?service|OmaVero|Enter Finland)\b/i.test(sentence);
  if (before) parts.push("fill in before you go");
  else if (online) parts.push("fill in online");
  if (sign) parts.push("sign at the office");
  if (!parts.length && /\b(bring|take)\b/i.test(sentence)) parts.push("bring it filled in");
  return parts.length ? parts.join(", ") : null;
}

/** A readable title when the sentence gives one: "form 6150e (Tax card application)" or "form 6150e, Tax card". */
function nameOf(id: string, sentence: string): string {
  const after = sentence.slice(sentence.toLowerCase().indexOf(id.toLowerCase()) + id.length);
  const paren = after.match(/^\s*\(([^()]{4,60})\)/);
  return paren ? `Form ${id} (${paren[1].trim()})` : `Form ${id}`;
}

const fileOf = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
};

/** The page's own link for a form number: official domain, the number in the file name or path, PDFs first. */
export function linkFor(id: string, links: string[], extraOfficial: string[]): string | null {
  // The number must stand alone in the file name: "6150e" in "6150e_en.pdf", not in "16150e.pdf".
  const pattern = new RegExp(`(?<![a-z0-9])${id.toLowerCase().replace(/[^a-z0-9 _-]/g, "").replace(/[ _-]+/g, "[ _-]?")}(?![a-z0-9])`);
  const hits = links.filter((u) => /^https:\/\//i.test(u) && trustOf(u, extraOfficial) === "official" && pattern.test(fileOf(u).toLowerCase()));
  const pdf = hits.find((u) => /\.pdf(\?|#|$)/i.test(u));
  return pdf ?? hits[0] ?? null;
}

const isPdf = (url: string) => /\.pdf(\?|#|$)/i.test(url);

/**
 * Forms named on a step's official pages. Pure: pages with their text and links in, forms out.
 * A form needs a verified sentence; its link, if any, must come from the same pages.
 */
export function formsFromPages(pages: FormPage[], extraOfficial: string[] = [], now = new Date().toISOString()): StepForm[] {
  const out = new Map<string, StepForm>();
  for (const page of pages) {
    if (trustOf(page.url, extraOfficial) !== "official") continue;
    for (const sentence of sentences(page.text)) {
      for (const m of sentence.matchAll(FORM_MENTION)) {
        const id = m[1].trim();
        // A bare small number ("form 2") is a count, not a form code.
        if (!/\d{3,}|[A-Za-z]/.test(id.replace(/^form/i, "")) || /^\d{1,2}$/.test(id)) continue;
        const key = compact(id);
        // Same quality bar as every citation: enough words, and found in the page text itself.
        if (sentence.split(/\s+/).length < MIN_QUOTE_TOKENS) continue;
        if (findQuote(sentence, page.text).score < MATCH_THRESHOLD) continue;
        // The sentence must say the applicant needs or uses the form, not merely mention it.
        if (!NEEDED.test(sentence)) continue;
        const url = linkFor(id, page.links, extraOfficial);
        const citation: Citation = { url: page.url, quote: sentence, trust: "official", fetchedAt: page.fetchedAt || now };
        const form: StepForm = { id, name: nameOf(id, sentence), url, type: url ? (isPdf(url) ? "pdf" : "web") : null, guidance: guidanceOf(sentence), citation };
        const prev = out.get(key);
        // Keep the mention that tells the most: a link first, then guidance.
        if (!prev || score(form) > score(prev)) out.set(key, { ...form, url: form.url ?? prev?.url ?? null, type: form.type ?? prev?.type ?? null });
      }
    }
  }
  return [...out.values()].slice(0, MAX_FORMS_PER_STEP);
}
const score = (f: StepForm) => (f.url ? 2 : 0) + (f.guidance ? 1 : 0);

/** A step needs forms looked up when it is a real, required step with official sources. */
export function formTargets(steps: Step[]): Step[] {
  return steps.filter((s) => !s.milestone && !s.done && !s.derived && s.necessity !== "optional" && officialUrls(s).length > 0);
}

/** The step's official source pages (its citations and claim citations), distinct, best-supported first. */
export function officialUrls(step: Step, extraOfficial: string[] = []): string[] {
  const seen = new Map<string, number>();
  for (const c of [...step.citations, ...(step.claims ?? []).map((x) => x.citation)]) {
    if (trustOf(c.url, extraOfficial) !== "official") continue;
    seen.set(c.url, (seen.get(c.url) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, MAX_PAGES_PER_STEP);
}

/** Look up forms for every required step (one getPages call per step). Failures leave a step without forms. */
export async function findForms(steps: Step[], city: string, onProgress?: Progress): Promise<Map<string, StepForm[]>> {
  const extraOfficial = cityDomains(city);
  const result = new Map<string, StepForm[]>();
  await Promise.all(
    formTargets(steps).map(async (step) => {
      const urls = officialUrls(step, extraOfficial);
      onProgress?.(`looking for official forms: ${step.title}`, "exa");
      let docs: ExaDoc[] = [];
      try {
        docs = (await getPages(urls, { maxCharacters: PAGE_CHARS, links: MAX_LINKS, extraOfficial })).docs;
      } catch {
        /* the step simply has no forms */
      }
      const pages: FormPage[] = docs.map((d) => ({ url: d.url, text: d.text ?? "", links: d.links ?? [], fetchedAt: d.fetchedAt }));
      // The step's own verified quotes count too, with whatever page they came from.
      for (const c of [...step.citations, ...(step.claims ?? []).map((x) => x.citation)]) {
        if (!pages.some((p) => normalizeUrl(p.url) === normalizeUrl(c.url))) pages.push({ url: c.url, text: c.quote, links: [], fetchedAt: c.fetchedAt });
      }
      const forms = formsFromPages(pages, extraOfficial);
      if (forms.length) result.set(step.id, forms);
    }),
  );
  return result;
}
