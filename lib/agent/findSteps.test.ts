import { describe, expect, it } from "vitest";
import type { VerifiedClaim } from "../types";
import { confirmSteps } from "./findSteps";

const claim = (stepId: string, kind: VerifiedClaim["kind"], value = "yes"): VerifiedClaim => ({
  stepId,
  kind,
  value,
  matchScore: 1,
  citation: { url: `https://kela.fi/${stepId}`, quote: `${stepId} ${kind} ${value}`, trust: "official", fetchedAt: "now" },
});

describe("confirmSteps", () => {
  it("confirms by applies, by a confirmed step's requirement, and transitively", () => {
    const c = confirmSteps([
      { id: "kela_registration", verified: [claim("kela_registration", "applies"), claim("kela_registration", "requires", "bank_account")] },
      { id: "bank_account", verified: [claim("bank_account", "requires", "dvv_registration")] },
      { id: "dvv_registration", verified: [] },
      { id: "police_id_card", verified: [claim("police_id_card", "document", "passport")] },
    ]);
    expect(c.get("kela_registration")).toEqual({ by: "applies" });
    expect(c.get("bank_account")).toMatchObject({ by: "required_by", stepIds: ["kela_registration"] });
    expect(c.get("dvv_registration")).toMatchObject({ by: "required_by", stepIds: ["bank_account"] });
    expect(c.has("police_id_card")).toBe(false);
  });

  it("an unconfirmed step's requirement confirms nothing", () => {
    const c = confirmSteps([
      { id: "a", verified: [claim("a", "requires", "b")] },
      { id: "b", verified: [] },
    ]);
    expect(c.size).toBe(0);
  });
});

describe("milestones (any-of)", () => {
  it("a required milestone confirms every step that provides it", async () => {
    const c = confirmSteps([
      { id: "tax_card", verified: [claim("tax_card", "applies"), claim("tax_card", "requires", "personal_identity_code")] },
      { id: "vero_identity_code", verified: [claim("vero_identity_code", "provides", "personal_identity_code")] },
      { id: "dvv_registration", verified: [claim("dvv_registration", "provides", "personal_identity_code"), claim("dvv_registration", "requires", "eu_registration")] },
      { id: "eu_registration", verified: [] },
    ]);
    expect(c.get("personal_identity_code")).toMatchObject({ by: "required_by", stepIds: ["tax_card"] });
    expect(c.get("vero_identity_code")).toMatchObject({ by: "required_by", stepIds: ["personal_identity_code"] });
    expect(c.get("eu_registration")).toMatchObject({ by: "required_by", stepIds: ["dvv_registration"] });
  });

  it("re-points 'needs a personal identity code' from DVV to the milestone, but keeps real registration", async () => {
    const { remapIdentityCode } = await import("./findSteps");
    const req = (quote: string): VerifiedClaim => ({ ...claim("tax_card", "requires", "dvv_registration"), citation: { ...claim("x", "applies").citation, quote } });
    expect(remapIdentityCode(req("To apply for the card, you need a Finnish personal identity code")).value).toBe("personal_identity_code");
    expect(
      remapIdentityCode(req("you must have a Finnish personal identity code and be entered in the Population Information System")).value,
    ).toBe("dvv_registration");
  });
});

describe("estimates from cited processing times", () => {
  it("parses ranges, units and immediacy", async () => {
    const { parseWaitDays } = await import("./estimates");
    expect(parseWaitDays("2–3 weeks")).toBe(15);
    expect(parseWaitDays("normally from 1 to 3 business days")).toBe(3);
    expect(parseWaitDays("within 10 banking days")).toBe(10);
    expect(parseWaitDays("Application processing time in most cases | 2 months")).toBe(42);
    expect(parseWaitDays("about two weeks")).toBe(10);
    expect(parseWaitDays("You will get the code immediately")).toBe(0);
    expect(parseWaitDays("The processing time starts when you have proved your identity")).toBeUndefined();
  });
});

describe("requiresFromDocuments", () => {
  it("a document that another step produces becomes a cited requirement on that step", async () => {
    const { requiresFromDocuments } = await import("./findSteps");
    const doc = (quote: string): VerifiedClaim => ({ ...claim("dvv_registration", "document", "certificate"), citation: { ...claim("x", "applies").citation, quote } });
    const out = requiresFromDocuments(
      "dvv_registration",
      [doc("a certificate of registration of the right of residence for EU citizens"), doc("a valid passport")],
      new Set(["eu_registration", "dvv_registration"]),
    );
    expect(out.map((c) => [c.kind, c.value, c.citation.quote])).toEqual([
      ["requires", "eu_registration", "a certificate of registration of the right of residence for EU citizens"],
    ]);
    // target step not in this plan -> nothing
    expect(requiresFromDocuments("dvv_registration", [doc("a residence permit card")], new Set(["dvv_registration"]))).toEqual([]);
  });
});
