// parseProfile through the LLM, answered from the git-tracked cache (demo-cache/llm). No network, no key.
// Refill after a prompt change: npm run parse-table -- --export
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PARSE_CASES, PARSE_TODAY } from "../../tests/parse/inputs";
import { MILESTONE_IDS, doneSteps, selectSteps } from "./stepTaxonomy";
import { partnerDifferences } from "./partnerSteps";
import { resolveArrival } from "./parseProfileLlm";
import type { ProfileResult } from "./parseProfile";

process.env.LLM_CACHE = "read";
process.env.LLM_PROVIDER = "anthropic";

const results = new Map<number, ProfileResult>();
beforeAll(async () => {
  const { parseProfile } = await import("./parseProfile");
  for (const c of PARSE_CASES) results.set(c.n, await parseProfile(c.text, PARSE_TODAY));
});

function ok(n: number) {
  const r = results.get(n)!;
  if (!r.ok) throw new Error(`#${n} unexpectedly out of scope: ${r.outOfScope}`);
  expect(r.source).toBe("llm");
  return r;
}

describe("test-queries.md through the LLM", () => {
  it("1 Marta", () => {
    const { profile } = ok(1);
    expect(profile).toMatchObject({ citizenship: "EU", city: "Helsinki", arrivalDate: "2026-12-01", monthlySalaryEur: 3200 });
    expect(profile.purpose).toEqual(expect.arrayContaining(["work", "study"]));
  });
  it("2 Brazilian PhD + wife, Tampere, January", () => {
    const { profile, people } = ok(2);
    expect(profile).toMatchObject({ citizenship: "NON_EU", city: "Tampere", arrivalDate: "2027-01-01", hasFamily: true });
    expect(people).toHaveLength(2);
  });
  it("3 Swedish, Espoo", () => expect(ok(3).profile).toMatchObject({ citizenship: "NORDIC", city: "Espoo" }));
  it("4 Indian, next week; the permit card is NOT done", () => {
    const { profile } = ok(4);
    expect(profile).toMatchObject({ citizenship: "NON_EU", arrivalDate: "2026-11-21" });
    expect(profile.alreadyDone ?? []).not.toContain("residence_permit");
  });
  it("5 German exchange student, 5 months", () =>
    expect(ok(5).profile).toMatchObject({ citizenship: "EU", stayMonths: 5, purpose: ["study"] }));
  it("6 Ukrainian temporary protection", () =>
    expect(ok(6).profile).toMatchObject({ citizenship: "NON_EU", temporaryProtection: true }));
  it("7 EU citizen, bank account, no city -> Helsinki assumed", () => {
    const { profile, assumptions } = ok(7);
    expect(profile).toMatchObject({ citizenship: "EU", city: "Helsinki" });
    expect(assumptions).toContain("No Finnish city named; assumed Helsinki.");
    expect(profile.alreadyDone ?? []).not.toContain("bank_account"); // wants one, does not have one
  });
  it("8 wedding in Rome is out of scope", () => {
    const r = results.get(8)!;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.outOfScope).toMatch(/Finland/);
  });
});

describe("adversarial", () => {
  it("9 typos", () =>
    expect(ok(9).profile).toMatchObject({ citizenship: "NORDIC", city: "Tampere", arrivalDate: "2026-11-21" }));
  it("10 Finnish", () =>
    expect(ok(10).profile).toMatchObject({ citizenship: "NORDIC", city: "Oulu", arrivalDate: "2027-01-01", monthlySalaryEur: 4000 }));
  it("11 Czech", () =>
    expect(ok(11).profile).toMatchObject({ citizenship: "EU", city: "Turku", purpose: ["study"], arrivalDate: "2027-01-01" }));
  it("12 vague: in scope, defaults reported as assumptions", () => {
    const { profile, assumptions } = ok(12);
    expect(profile.city).toBe("Helsinki");
    expect(profile.arrivalDate).toBeUndefined();
    expect(assumptions.join(" ")).toMatch(/Citizenship not stated/);
    expect(assumptions.join(" ")).toMatch(/Arrival date not stated/);
  });
  it("13 other city, yearly salary -> monthly", () =>
    expect(ok(13).profile).toMatchObject({ citizenship: "EU", city: "Jyväskylä", monthlySalaryEur: 4500, arrivalDate: "2027-02-03" }));
  it("14 'I already have' -> done steps; relative date", () => {
    const { profile } = ok(14);
    expect(profile).toMatchObject({ city: "Vantaa", arrivalDate: "2026-11-28" });
    expect(profile.alreadyDone).toEqual(expect.arrayContaining(["bank_account", "personal_identity_code"]));
  });
  it("15 Swedish + Brazilian wife", () => {
    const r = ok(15);
    expect(r.profile).toMatchObject({ citizenship: "NORDIC", city: "Espoo", hasFamily: true });
    expect(r.people.map((p) => p.citizenship)).toEqual(["NORDIC", "NON_EU"]);
    expect(r.people[1].relation).toBe("spouse");
    const diff = partnerDifferences(r.people);
    expect(diff).toHaveLength(1);
    expect(diff[0].extra.map((s) => s.id)).toContain("residence_permit");
  });
  it("16 injection + real content: real content wins", () =>
    expect(ok(16).profile).toMatchObject({ citizenship: "EU", city: "Turku" }));
  it("17 injection with nothing real: out of scope", () => expect(results.get(17)!.ok).toBe(false));
  it("18 leaving Finland: out of scope", () => expect(results.get(18)!.ok).toBe(false));
});

describe("fallback and helpers", () => {
  it("LLM cache miss falls back to the deterministic parser", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseProfile } = await import("./parseProfile");
    const r = await parseProfile("Swedish citizen moving to Espoo for work, text never seen by the cache", PARSE_TODAY);
    warn.mockRestore();
    expect(r.ok && r.source).toBe("deterministic");
    expect(r.ok && r.profile.city).toBe("Espoo");
  });

  it("resolveArrival: relative, month-only, past and impossible dates", () => {
    const base = { day: null, month: null, year: null, offsetDays: null };
    expect(resolveArrival({ ...base, kind: "relative", offsetDays: 7 }, PARSE_TODAY).date).toBe("2026-11-21");
    expect(resolveArrival({ ...base, kind: "date", month: 1 }, PARSE_TODAY)).toMatchObject({ date: "2027-01-01" });
    expect(resolveArrival({ ...base, kind: "date", month: 12, day: 1 }, PARSE_TODAY)).toEqual({ date: "2026-12-01" });
    expect(resolveArrival({ ...base, kind: "date", month: 2, day: 30 }, PARSE_TODAY).assumption).toMatch(/Only the month/);
    expect(resolveArrival({ ...base, kind: "date", month: 3, day: 1, year: 2020 }, PARSE_TODAY).date).toBeUndefined();
    expect(resolveArrival({ ...base, kind: "none" }, PARSE_TODAY).date).toBeUndefined();
  });

  it("already-done steps are not searched and become done milestones", () => {
    const profile = {
      citizenship: "NON_EU" as const,
      purpose: ["work" as const],
      city: "Vantaa",
      alreadyDone: ["bank_account", "personal_identity_code"],
    };
    const ids = selectSteps(profile).map((s) => s.id);
    expect(ids).not.toContain("bank_account");
    expect(ids).not.toContain("vero_identity_code");
    expect(ids).toContain("strong_identification");
    const done = doneSteps(profile);
    expect(done.map((s) => s.id).sort()).toEqual(["bank_account", "personal_identity_code"]);
    expect(done.every((s) => s.done && s.milestone && s.citations.length === 0 && s.mode === "online")).toBe(true);
    expect(MILESTONE_IDS.has("personal_identity_code")).toBe(true);
  });

  it("a done step is satisfied on day 0 and does not hold up its dependents", async () => {
    const { buildGraph, schedule } = await import("../graph");
    const profile = { citizenship: "NON_EU" as const, purpose: ["work" as const], city: "Vantaa", alreadyDone: ["bank_account"] };
    const strong = {
      id: "strong_identification", title: "Strong ID", authority: "Bank", mode: "in_person" as const,
      requires: ["bank_account"], citations: [],
    };
    const g = buildGraph([...doneSteps(profile), strong]);
    const s = schedule(g, { arrivalDate: "2026-12-01" }, { today: "2026-11-14" });
    expect(s.items.bank_account).toMatchObject({ startDate: "2026-12-01", durationDays: 0, waitDays: 0 });
    expect(s.items.strong_identification.startDate).toBe("2026-12-01");
  });

  it("deterministic parser also reads 'I already have'", async () => {
    const { parseAlreadyDone } = await import("./parseProfile");
    expect(parseAlreadyDone("I already have a bank account and a personal identity code")).toEqual([
      "bank_account",
      "personal_identity_code",
    ]);
    expect(parseAlreadyDone("I want to open a bank account")).toEqual([]);
  });
});
