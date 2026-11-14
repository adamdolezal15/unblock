// "Bring" lists without near-duplicates, from the demo runs' real wordings.
import { describe, expect, it } from "vitest";
import { dedupeBring } from "../../lib/ui/bring";

const v = (xs: string[]) => dedupeBring(xs.map((value) => ({ value }))).map((x) => x.value);

describe("dedupeBring", () => {
  it("Marta's Vero visit: one passport, one income estimate", () => {
    expect(
      v([
        "valid passport or official proof of identity with a photograph",
        "employment contract",
        "Application for tax card, tax prepayment or tax number – current or former foreign residents (5042e), for stays over 6 months",
        "estimate of total annual income including wages and possible fringe benefits, holiday pay, bonuses",
        "valid passport or identity card",
        "estimate of total annual income including wages and fringe benefits, holiday pay, bonuses",
      ]),
    ).toEqual([
      "valid passport or official proof of identity with a photograph",
      "employment contract",
      "Application for tax card, tax prepayment or tax number – current or former foreign residents (5042e), for stays over 6 months",
      "estimate of total annual income including wages and possible fringe benefits, holiday pay, bonuses",
    ]);
  });

  it("keeps a passport photograph apart from the passport, and a different ID apart", () => {
    expect(v(["valid passport or identity card", "passport photograph taken within the last 6 months"])).toHaveLength(2);
    expect(v(["Official identification document such as a passport", "Foreigner’s identity card issued by Finnish police (for non-EU citizens)"])).toHaveLength(2);
  });

  it("keeps different documents (Migri, DVV lists unchanged)", () => {
    const migri = [
      "valid passport or identity card",
      "proof of grounds for residence in Finland (e.g. employment or studies)",
      "proof of sufficient financial resources",
      "authorised translation of attachments not in Finnish, Swedish or English",
      "debit or credit card for paying the fee if not paid online",
    ];
    expect(v(migri)).toEqual(migri);
    const dvv = ["valid passport", "residence permit card or other proof of legal residence in Finland", "proof of studies in Finland, e.g. certificate of student status"];
    expect(v(dvv)).toEqual(dvv);
  });

  it("drops exact repeats regardless of case", () => {
    expect(v(["Employment contract", "employment contract"])).toEqual(["Employment contract"]);
  });
});
