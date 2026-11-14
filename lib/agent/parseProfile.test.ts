import { describe, expect, it } from "vitest";
import { DEMO_SENTENCES } from "../demo/sentences";
import { parseDate, parseProfile, parseSalary } from "./parseProfile";

const TODAY = "2026-11-14";

async function ok(text: string) {
  const r = await parseProfile(text, TODAY);
  if (!r.ok) throw new Error(`unexpected out of scope: ${text}`);
  return r;
}

describe("parseProfile: test-queries.md", () => {
  it("1: Czech, Helsinki, job + master's at Aalto", async () => {
    const { profile } = await ok("Czech citizen moving to Helsinki on 1 Sept for a job, also starting a master's at Aalto");
    expect(profile).toMatchObject({ citizenship: "EU", city: "Helsinki", arrivalDate: "2027-09-01" });
    expect(profile.purpose).toEqual(expect.arrayContaining(["work", "study"]));
  });

  it("2: Brazilian PhD student, Tampere, with wife", async () => {
    const { profile, assumptions } = await ok("Brazilian PhD student moving to Tampere with my wife");
    expect(profile).toMatchObject({ citizenship: "NON_EU", city: "Tampere", hasFamily: true });
    expect(profile.purpose).toEqual(expect.arrayContaining(["study", "family"]));
    expect(assumptions.some((a) => a.includes("PhD"))).toBe(true);
  });

  it("3: Swedish, Espoo, work", async () => {
    const { profile } = await ok("Swedish citizen moving to Espoo for work");
    expect(profile).toMatchObject({ citizenship: "NORDIC", city: "Espoo", purpose: ["work"] });
  });

  it("4: Indian engineer, arriving next week", async () => {
    const { profile } = await ok("Indian software engineer, Helsinki, arriving next week, no residence permit card yet");
    expect(profile).toMatchObject({ citizenship: "NON_EU", city: "Helsinki", arrivalDate: "2026-11-21", purpose: ["work"] });
  });

  it("5: German exchange student, 5 months", async () => {
    const { profile } = await ok("German exchange student, Helsinki, 5 months");
    expect(profile).toMatchObject({ citizenship: "EU", purpose: ["study"], stayMonths: 5 });
  });

  it("6: Ukrainian under temporary protection", async () => {
    const { profile, assumptions } = await ok("Ukrainian under temporary protection, Helsinki");
    expect(profile).toMatchObject({ citizenship: "NON_EU", temporaryProtection: true });
    expect(assumptions).toContain("Purpose not stated; assumed work.");
  });

  it("7: bank account, EU citizen, no city -> Helsinki assumed", async () => {
    const { profile, assumptions } = await ok("I want to open a bank account in Finland, I am EU citizen");
    expect(profile).toMatchObject({ citizenship: "EU", city: "Helsinki" });
    expect(assumptions).toContain("No Finnish city named; assumed Helsinki.");
  });

  it("8: out of scope", async () => {
    const r = await parseProfile("Plan my wedding in Rome", TODAY);
    expect(r.ok).toBe(false);
  });
});

describe("parseProfile: details", () => {
  it("demo: Marta", async () => {
    const { profile, assumptions } = await ok(DEMO_SENTENCES.marta);
    expect(profile).toEqual({
      citizenship: "EU",
      purpose: ["work", "study"],
      city: "Helsinki",
      arrivalDate: "2026-12-01",
      monthlySalaryEur: 3200,
    });
    expect(assumptions).toEqual([]);
  });

  it("demo: Brazilian PhD student, Tampere, wife, January", async () => {
    const { profile } = await ok(DEMO_SENTENCES.brazil);
    expect(profile).toMatchObject({ citizenship: "NON_EU", city: "Tampere", hasFamily: true, arrivalDate: "2027-01-01" });
    expect(profile.purpose).toEqual(expect.arrayContaining(["study", "family"]));
  });

  it("demo: Indian engineer arriving next week", async () => {
    const { profile } = await ok(DEMO_SENTENCES.india);
    expect(profile).toMatchObject({ citizenship: "NON_EU", city: "Helsinki", purpose: ["work"], arrivalDate: "2026-11-21" });
  });

  it("no nationality -> NON_EU assumption", async () => {
    const { profile, assumptions } = await ok("Moving to Oulu for a job");
    expect(profile.citizenship).toBe("NON_EU");
    expect(assumptions.some((a) => a.startsWith("Citizenship not stated"))).toBe(true);
  });

  it("Swedish city names", async () => {
    expect((await ok("Danish, moving to Helsingfors")).profile.city).toBe("Helsinki");
  });

  it("dates", () => {
    expect(parseDate("on September 1", TODAY)).toBe("2027-09-01");
    expect(parseDate("on 20 December", TODAY)).toBe("2026-12-20");
    expect(parseDate("2027-01-15", TODAY)).toBe("2027-01-15");
    expect(parseDate("tomorrow", TODAY)).toBe("2026-11-15");
    expect(parseDate("in 2 weeks", TODAY)).toBe("2026-11-28");
    expect(parseDate("for work", TODAY)).toBeUndefined();
    expect(parseDate("with my wife in January", TODAY)).toBe("2027-01-01");
    expect(parseDate("in December", TODAY)).toBe("2026-12-01");
    expect(parseDate("may need a bank", TODAY)).toBeUndefined();
  });

  it("salary", () => {
    expect(parseSalary("salary 3200 EUR")).toBe(3200);
    expect(parseSalary("€3,500/month")).toBe(3500);
    expect(parseSalary("45k EUR a year")).toBe(3750);
    expect(parseSalary("salary of 60000")).toBe(5000);
    expect(parseSalary("on 1 Sept")).toBeUndefined();
  });
});
