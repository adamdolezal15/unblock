// "Ready to send" drafts. Marta's drafts come from demo-cache (npx tsx scripts/warm-drafts.ts marta), no network.
// Checks: only drafts the run has facts for, no invented emails / phones / urls / numbers, every fact sentence
// has a footnote whose source is a verified citation of the run.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

import { checkSentences, draftFacts, draftOffers, mailtoHref, supportedBy, type Draft, type DraftSource } from "../../lib/agent/draftOffers";
import type { Step } from "../../lib/types";
import { DEMO_SENTENCES } from "../../lib/demo/sentences";

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s()-]{6,}\d/g;

let src: DraftSource;
const drafts = new Map<string, Draft>();

beforeAll(async () => {
  const { runStream, readEvents } = await import("../../lib/agent/runStream");
  const { initialRunState, runReducer } = await import("../../lib/ui/runState");
  const { draftSource } = await import("../../lib/ui/useDrafts");
  const { generateDraft } = await import("../../lib/agent/drafts");
  let st = runReducer(initialRunState, { type: "start", text: DEMO_SENTENCES.marta, at: 0 });
  for await (const e of readEvents(runStream(DEMO_SENTENCES.marta, { fast: true, persist: false, today: "2026-11-14" }))) st = runReducer(st, { type: "event", event: e, at: 1 });
  src = draftSource(st)!;
  for (const o of draftOffers(src)) drafts.set(o.id, (await generateDraft(src, o.id))!);
}, 120_000);

describe("drafts: Marta (works and studies, Helsinki)", () => {
  it("offers at most 3 drafts: employer email, bank email, then the first visit that needs booking", () => {
    expect([...drafts.keys()]).toEqual(["employer", "bank", "booking:eu_registration"]);
  });

  it("every draft was written by Claude from the cache (none fell back to the template)", () => {
    for (const [id, d] of drafts) expect(d.by, id).toBe("claude");
  });

  it("contains no invented email address, phone number, url or number", () => {
    for (const [id, d] of drafts) {
      const offer = draftOffers(src).find((o) => o.id === id)!;
      const facts = draftFacts(src, offer);
      const all = facts.map((f) => `${f.text} ${f.quote ?? ""}`).join(" ");
      const text = d.body.split("\nSources:")[0];
      for (const e of text.match(EMAIL) ?? []) expect(all, `${id}: ${e}`).toContain(e);
      for (const p of text.match(PHONE) ?? []) expect(all.replace(/\D/g, ""), `${id}: ${p}`).toContain(p.replace(/\D/g, ""));
      for (const s of d.sentences) expect(supportedBy(s.text, all), `${id}: ${s.text}`).toBe(true);
      // Personal data stays a placeholder.
      if (d.email) expect(d.body).toMatch(/\[Your name\]/);
    }
  });

  it("every fact sentence ends with a footnote, and every source is a verified citation of the run", () => {
    const verified = new Set<string>();
    for (const s of src.steps) for (const c of [...s.citations, ...(s.claims ?? []).map((x) => x.citation)]) verified.add(`${c.url}|${c.quote}`);
    for (const c of src.conflicts) for (const side of [c.a, c.b]) verified.add(`${side.url}|${side.quote}`);
    for (const [id, d] of drafts) {
      expect(d.sources.length, id).toBeGreaterThan(0);
      for (const s of d.sources) expect(verified.has(`${s.url}|${s.quote}`), `${id}: ${s.url}`).toBe(true);
      for (const s of d.sentences) for (const n of s.refs) expect(d.body, id).toContain(`[${n}] ${d.sources[n - 1].url}`);
      // Each source is used by at least one sentence, and each sentence's [n] appears right after it.
      for (const src of d.sources) expect(d.sentences.some((s) => s.refs.includes(src.n)), `${id}: [${src.n}] unused`).toBe(true);
      for (const s of d.sentences.filter((x) => x.refs.length)) expect(d.body).toContain(`${s.text} ${s.refs.map((n) => `[${n}]`).join("")}`);
    }
  });

  it("the employer email covers the tax card (60%) and asks for the employment proof", () => {
    const d = drafts.get("employer")!;
    expect(d.body).toMatch(/60\s?%/);
    expect(d.body).toMatch(/employment (contract|certificate)/i);
  });

  it("the bank email asks for basic banking services and quotes FIN-FSA (the conflict exists)", () => {
    const d = drafts.get("bank")!;
    expect(d.body).toMatch(/basic banking services|peruspankkipalvelut/i);
    expect(d.sources.some((s) => /finanssivalvonta\.fi/.test(s.url))).toBe(true);
  });

  it("mailto carries subject and body", () => {
    const d = drafts.get("bank")!;
    const href = mailtoHref(d);
    expect(href.startsWith("mailto:?subject=")).toBe(true);
    expect(decodeURIComponent(href.split("&body=")[1])).toBe(d.body);
  });
});

describe("drafts: offers follow the facts", () => {
  const run = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/run-mwgiunwf-37c4f9759584.json"), "utf8")) as { profile: DraftSource["profile"]; steps: Step[] };

  it("a student without a job gets no employer email", () => {
    const offers = draftOffers({ profile: run.profile, steps: run.steps, conflicts: [], dates: {} });
    expect(offers.map((o) => o.id)).not.toContain("employer");
  });

  it("no tax card step, no employer email, even for a worker", () => {
    const offers = draftOffers({ profile: { ...run.profile, purpose: ["work"] }, steps: run.steps, conflicts: [], dates: {} });
    expect(offers.map((o) => o.id)).not.toContain("employer");
  });
});

describe("booking notes: one per visit, only where booking is needed", () => {
  const claim = (stepId: string, kind: string, value: string) => ({ stepId, kind, value, matchScore: 1, citation: { url: "https://vero.fi/x", quote: value, trust: "official", fetchedAt: "" } });
  const step = (id: string, kinds: [string, string][]) =>
    ({ id, title: id, authority: "Vero", mode: "in_person", requires: [], citations: [], claims: kinds.map(([k, v]) => claim(id, k, v)) }) as unknown as Step;
  const base: DraftSource = {
    profile: { citizenship: "EU", purpose: ["study"], city: "Helsinki" },
    steps: [step("vero_identity_code", [["booking_url", "vero.fi/book"]]), step("tax_card", [["hours", "weekdays 9:00-16:00"]]), step("police_id_card", [["hours", "Mon-Fri 8:00-16:15"]])],
    conflicts: [],
    dates: { vero_identity_code: "2026-12-01", tax_card: "2026-12-01", police_id_card: "2026-12-10" },
    visits: { vero_identity_code: "visit:v", tax_card: "visit:v" },
  };
  it("a merged visit gets one note covering both steps; a visit with hours only gets none", () => {
    const offers = draftOffers(base);
    expect(offers.map((o) => o.id)).toEqual(["booking:vero_identity_code"]);
    expect(offers[0].stepIds.sort()).toEqual(["tax_card", "vero_identity_code"]);
    expect(offers[0].title).toBe("Booking note: Vero visit");
    const facts = draftFacts(base, offers[0]).map((f) => f.text);
    expect(facts).toEqual(expect.arrayContaining(["How to book: vero.fi/book", "Opening hours: weekdays 9:00-16:00"]));
    expect(new Set(facts).size).toBe(facts.length);
  });
  it("never more than 3", () => {
    const many = { ...base, visits: {}, steps: ["a", "b", "c", "d"].map((id) => step(id, [["booking_url", "x.fi"]])), dates: { a: "2026-12-01", b: "2026-12-02", c: "2026-12-03", d: "2026-12-04" } };
    expect(draftOffers(many).map((o) => o.id)).toEqual(["booking:a", "booking:b", "booking:c"]);
  });
});

describe("checkSentences drops anything the facts don't state", () => {
  const facts = [
    { id: "F1", text: "60% of salary withheld as advance tax if employer has no tax card", quote: "60% withheld", url: "https://www.suomi.fi/x", trust: "official" as const },
    { id: "P1", text: "I arrive in Helsinki on 1 December 2026." },
  ];
  it.each([
    ["an invented email", "Please write to hr@example.com about it.", ["F1"]],
    ["an invented phone number", "Call me on +358 40 123 4567.", ["P1"]],
    ["an invented url", "See vero.fi for details.", ["F1"]],
    ["an invented number", "I will start on 15 December.", ["P1"]],
    ["an unknown fact id", "Something verified.", ["F9"]],
    ["a number with no fact cited", "Usually it takes 3 days.", []],
  ])("drops %s", (_name, text, ids) => {
    expect(checkSentences([{ text, factIds: ids }], facts).sentences).toEqual([]);
  });

  it("keeps placeholders and facts it cites, with a footnote", () => {
    const r = checkSentences(
      [
        { text: "I will send the tax card to [Employer name] so that 60% is not withheld", factIds: ["F1"] },
        { text: "I arrive on 1 December 2026.", factIds: ["P1"] },
      ],
      facts,
    );
    expect(r.sentences).toEqual([
      { text: "I will send the tax card to [Employer name] so that 60% is not withheld.", refs: [1] },
      { text: "I arrive on 1 December 2026.", refs: [] },
    ]);
    expect(r.sources).toEqual([{ n: 1, url: "https://www.suomi.fi/x", quote: "60% withheld", trust: "official" }]);
  });
});
