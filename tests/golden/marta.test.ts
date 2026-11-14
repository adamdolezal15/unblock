// Golden test for the demo sentence. Runs fully offline from .cache (EXA_CACHE=read, LLM_CACHE=read,
// anthropic extractor). If it fails with "no cached response", run once with network:
//   npm run warm-demo
import { beforeAll, describe, expect, it } from "vitest";

process.env.EXA_CACHE = "read";
process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";
process.env.EXA_LOG = "0";

const TODAY = "2026-11-14"; // pins "1 December" to 2026-12-01 for the date assertions

type Modules = {
  graph: typeof import("../../lib/graph");
  agent: typeof import("../../lib/agent/findSteps");
};

let m: Modules;
let result: Awaited<ReturnType<Modules["agent"]["findSteps"]>>;
let g: ReturnType<Modules["graph"]["buildGraph"]>;
let sched: ReturnType<Modules["graph"]["schedule"]>;

const hardEdge = (source: string, target: string) => g.edges.some((e) => !e.anyOf && e.source === source && e.target === target);

beforeAll(async () => {
  const { parseProfile } = await import("../../lib/agent/parseProfile");
  const { estimatesFromSteps } = await import("../../lib/agent/estimates");
  const MARTA = (await import("../../lib/demo/sentences")).DEMO_SENTENCES.marta;
  m = { graph: await import("../../lib/graph"), agent: await import("../../lib/agent/findSteps") };
  const parsed = await parseProfile(MARTA, TODAY);
  if (!parsed.ok) throw new Error("Marta parsed as out of scope");
  result = await m.agent.findSteps(parsed.profile);
  g = m.graph.buildGraph(result.steps);
  sched = m.graph.schedule(g, parsed.profile, { today: TODAY, estimates: estimatesFromSteps(result.steps) });
}, 60_000);

describe("golden: Marta", () => {
  it("eu_registration -> dvv_registration", () => {
    expect(hardEdge("eu_registration", "dvv_registration")).toBe(true);
  });

  it("personal_identity_code is an any-of: DVV registration OR a Vero tax office", () => {
    const pic = result.steps.find((s) => s.id === "personal_identity_code");
    expect(pic?.milestone).toBe(true);
    const groups = pic?.requiresAnyOf ?? [];
    expect(groups.some((gr) => gr.includes("dvv_registration") && gr.includes("vero_identity_code"))).toBe(true);
    // the tax card needs the code, never DVV directly
    expect(hardEdge("personal_identity_code", "tax_card")).toBe(true);
    expect(hardEdge("dvv_registration", "tax_card")).toBe(false);
  });

  it("bank account + strong ID merged into one visit on 10 Dec; alternative = separate", () => {
    const bank = sched.items.bank_account;
    const sid = sched.items.strong_identification;
    expect(bank).toMatchObject({ startDate: "2026-12-10" });
    expect(sid).toMatchObject({ startDate: "2026-12-10" });
    expect(bank.visitId).toBeDefined();
    expect(sid.visitId).toBe(bank.visitId);

    const choice = sched.visitChoices.find((c) => c.members.includes("bank_account"))!;
    expect(choice.chosen).toMatchObject({ mode: "merged", visits: 1 });
    const alt = choice.alternative;
    expect(alt).toMatchObject({ mode: "separate", visits: 2 });
    // separately the account opens earlier (7 Dec, via the Vero ID code) and is ready sooner…
    expect(alt.members.bank_account.startDate).toBe("2026-12-07");
    expect(alt.memberShift.bank_account.readyDays).toBeLessThan(0);
    // …but strong ID then waits for the account, and the whole plan ends later
    expect(alt.memberShift.strong_identification.readyDays).toBeGreaterThan(0);
    expect(alt.planEndShift.calendarDays).toBeGreaterThan(0);
  });

  it("tax card visit: merged is chosen, separate is the alternative", () => {
    const choice = sched.visitChoices.find((c) => c.members.includes("tax_card"))!;
    expect(choice.chosen.mode).toBe("merged");
    expect(choice.alternative.mode).toBe("separate");
  });

  it("bank_account -> kela_registration and bank_account -> strong_identification", () => {
    expect(hardEdge("bank_account", "kela_registration")).toBe(true);
    expect(hardEdge("bank_account", "strong_identification")).toBe(true);
  });

  it("tax_card is NOT after dvv_registration", () => {
    expect(m.graph.necessaryPrerequisites(g).get("tax_card")?.has("dvv_registration")).toBe(false);
    expect(sched.items.tax_card.startIndex).toBeLessThan(sched.items.dvv_registration.readyIndex);
  });

  it("tax card on day 1: same Vero visit as the identity code", () => {
    const tax = result.steps.find((s) => s.id === "tax_card")!;
    expect(tax.visitId).toBeDefined();
    expect(result.steps.find((s) => s.id === "vero_identity_code")!.visitId).toBe(tax.visitId);
    expect(tax.claims?.some((c) => c.kind === "same_visit") ||
      result.steps.find((s) => s.id === "vero_identity_code")!.claims?.some((c) => c.kind === "same_visit")).toBe(true);
    expect(sched.items.tax_card).toMatchObject({ startIndex: 0, startDate: "2026-12-01" });
  });

  it("every edge is backed by a verified claim", () => {
    const step = (id: string) => result.steps.find((s) => s.id === id)!;
    for (const e of g.edges) {
      const claims = step(e.target).claims ?? [];
      const backed = e.anyOf
        ? claims.some((c) => c.kind === "provides" && c.stepId === e.source)
        : claims.some((c) => c.kind === "requires" && c.value === e.source);
      expect(backed, `${e.source} -> ${e.target}`).toBe(true);
    }
  });

  it("0 unverified claims: every quote re-found verbatim in the text Exa returned for its URL", async () => {
    const { findQuote, normalizeUrl } = await import("../../lib/agent/verifyCitations");
    const { getPages } = await import("../../lib/exa/search");
    const textByUrl = new Map<string, string[]>();
    for (const d of result.sources) {
      const k = normalizeUrl(d.url);
      textByUrl.set(k, [...(textByUrl.get(k) ?? []), ...d.highlights, ...(d.text ? [d.text] : [])]);
    }
    const unverified: string[] = [];
    let checked = 0;
    for (const s of result.steps) {
      expect(s.citations.length, `${s.id} has no citation`).toBeGreaterThan(0);
      for (const c of s.claims ?? []) {
        checked++;
        const quote = c.citation.quote;
        let found = (textByUrl.get(normalizeUrl(c.citation.url)) ?? []).some((t) => findQuote(quote, t).score === 1);
        if (!found) {
          // verifyCitations fetched the page for this one, so it is in the Exa cache
          const page = (await getPages([c.citation.url], { maxCharacters: 50_000 })).docs[0]?.text ?? "";
          found = findQuote(quote, page).score === 1;
        }
        if (!found || c.matchScore < 0.9) unverified.push(`${s.id}.${c.kind}: ${quote.slice(0, 80)} (${c.citation.url})`);
      }
    }
    expect(checked).toBeGreaterThan(30);
    expect(unverified).toEqual([]);
  }, 60_000);
});
