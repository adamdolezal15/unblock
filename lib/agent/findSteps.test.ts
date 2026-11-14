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
