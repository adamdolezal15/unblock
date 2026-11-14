import { describe, expect, it } from "vitest";
import type { VerifiedClaim } from "../types";
import { isConsequence } from "../ui/panel";
import { localVisitClaims, policeIdentificationClaims, policeIdentificationStep, sentencesOf } from "./derive";

const claim = (kind: VerifiedClaim["kind"], value: string, quote: string, url = "https://example.fi/x"): VerifiedClaim => ({
  stepId: "s",
  kind,
  value,
  matchScore: 1,
  citation: { url, quote, trust: "official", fetchedAt: "2026-11-14" },
});

describe("localVisitClaims: addresses for the person's city", () => {
  const hki = claim("address", "Pasilanraitio 11, Helsinki", "Visit us at Pasilanraitio 11, Helsinki.");
  const oulu = claim("address", "Torikatu 1, Oulu", "The Oulu service point is at Torikatu 1, Oulu.");
  const other = claim("document", "passport", "Bring your passport with you to the visit.");

  it("keeps only the local address when a local source exists", () => {
    expect(localVisitClaims([hki, oulu, other], "Oulu")).toEqual([oulu, other]);
  });
  it("drops an address that names a different city when no local one exists", () => {
    expect(localVisitClaims([hki, other], "Oulu")).toEqual([other]);
  });
  it("keeps a city-less address when nothing says otherwise", () => {
    const plain = claim("address", "Main street 5", "The office is at Main street 5 in the centre.");
    expect(localVisitClaims([plain], "Oulu")).toEqual([plain]);
  });
});

describe("isConsequence: 'If you skip it' never shows a prerequisite", () => {
  it.each(["Cannot apply for this permit without confirmed employment", "Need a residence permit to stay in Finland longer than 90 days", "You must have a bank account"])(
    "%s is a prerequisite",
    (v) => expect(isConsequence(v)).toBe(false),
  );
  it.each(["employer must withhold 60% of your salary as advance tax", "Without the identity code you cannot get a tax card", "no access to Kela benefits"])(
    "%s is a consequence",
    (v) => expect(isConsequence(v)).toBe(true),
  );
});

describe("police identification", () => {
  const doc = claim("document", "identity verification at a police station if passport is not from EEA", "You should be prepared to verify your identity at a police station if your passport is not from an EEA country.");
  it("turns the document into a requires claim of its own step, for non-EEA passports only", () => {
    const runs = [{ id: "bank_account", verified: [doc] }];
    const out = policeIdentificationClaims({ citizenship: "NON_EU" }, runs);
    expect(out).toHaveLength(1);
    expect(out[0].requires).toMatchObject({ kind: "requires", value: "police_identification" });
    expect(runs[0].verified).toEqual([]); // no longer a Bring item
    expect(policeIdentificationClaims({ citizenship: "EU" }, [{ id: "bank_account", verified: [doc] }])).toEqual([]);
    const step = policeIdentificationStep(out)!;
    expect(step).toMatchObject({ id: "police_identification", mode: "in_person", derived: true });
    expect(step.confirmation).toMatchObject({ by: "required_by", stepIds: ["bank_account"] });
  });
  it("needs the police in the quote, not only in the extracted value", () => {
    const valueOnly = claim("document", "Foreigner's identity card issued by the Finnish police", "Banks require a foreigner's identity card issued by the Finnish authorities for strong identification.");
    const runs = [{ id: "strong_identification", verified: [valueOnly] }];
    expect(policeIdentificationClaims({ citizenship: "NON_EU" }, runs)).toEqual([]);
    expect(runs[0].verified).toEqual([valueOnly]);
  });
});

describe("sentencesOf", () => {
  it("splits highlights into sentences", () => {
    const s = sentencesOf([{ url: "u", title: "", domain: "d", trust: "official", highlights: ["First sentence is long enough here. Second sentence is long enough too.\n\n- A bullet that is long enough to count"], fetchedAt: "" }]);
    expect(s.map((x) => x.sentence)).toEqual(["First sentence is long enough here.", "Second sentence is long enough too.", "A bullet that is long enough to count"]);
  });
});
