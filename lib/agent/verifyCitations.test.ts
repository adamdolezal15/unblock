import { describe, expect, it } from "vitest";
import type { ExaDoc, RawClaim } from "../types";
import { findQuote, verifyCitations } from "./verifyCitations";

const PAGE = `## Opening a bank account

When you have a Finnish personal identity code, you can usually open a bank account.
Banks must offer basic banking services to everyone legally resident in the EU.

* Bring your passport and **proof of address**.`;

const doc = (url: string, highlights: string[]): ExaDoc => ({
  url,
  title: "t",
  domain: new URL(url).hostname,
  trust: "official",
  highlights,
  fetchedAt: "2026-11-14T00:00:00Z",
});

const claim = (over: Partial<RawClaim>): RawClaim => ({
  stepId: "bank_account",
  kind: "requires",
  value: "dvv_registration",
  url: "https://www.suomi.fi/bank",
  quote: "When you have a Finnish personal identity code, you can usually open a bank account.",
  ...over,
});

const opts = {
  allowedDomains: ["suomi.fi", "dvv.fi"],
  knownStepIds: new Set(["bank_account", "dvv_registration"]),
  fetchPage: async () => null,
};

describe("findQuote", () => {
  it("exact match ignores whitespace, case, quotes and markdown", () => {
    const m = findQuote("bring your passport and “proof of address”", PAGE);
    expect(m.score).toBe(1);
    expect(m.span).toBe("Bring your passport and **proof of address");
  });

  it("small edit still passes the 0.9 threshold", () => {
    const m = findQuote("When you have a Finnish personal identity code, you can normally open a bank account.", PAGE);
    expect(m.score).toBeGreaterThanOrEqual(0.9);
    expect(m.span).toContain("you can usually open a bank account");
  });

  it("paraphrase fails", () => {
    const m = findQuote("A bank account requires a personal identity code in Finland.", PAGE);
    expect(m.score).toBeLessThan(0.9);
  });
});

describe("verifyCitations", () => {
  it("verifies against highlights and replaces quote with page span", async () => {
    const { verified, dropped } = await verifyCitations(
      [claim({ quote: "when you have a finnish personal identity code you can usually open a bank account" })],
      [doc("https://suomi.fi/bank/", [PAGE])],
      opts,
    );
    expect(dropped).toEqual([]);
    expect(verified[0].citation.quote).toBe(
      "When you have a Finnish personal identity code, you can usually open a bank account",
    );
    expect(verified[0].citation.trust).toBe("official");
  });

  it("falls back to fetching the page", async () => {
    const { verified } = await verifyCitations([claim({})], [], { ...opts, fetchPage: async () => PAGE });
    expect(verified).toHaveLength(1);
  });

  it("drops with reasons", async () => {
    const { verified, dropped } = await verifyCitations(
      [
        claim({ url: "https://example.com/x" }),
        claim({ value: "made_up_step" }),
        claim({ value: "bank_account" }),
        claim({ quote: "open a bank account" }),
        claim({ quote: "Banks always need a Finnish ID number before opening any account for newcomers." }),
        claim({ url: "https://dvv.fi/missing" }),
        claim({ kind: "mode", value: "by carrier pigeon" }),
      ],
      [doc("https://www.suomi.fi/bank", [PAGE])],
      opts,
    );
    expect(verified).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual([
      "url_not_allowed",
      "unknown_step_id",
      "unknown_step_id",
      "too_short",
      "quote_not_found",
      "page_unavailable",
      "invalid_value",
    ]);
  });
});

describe("numbersSupported", () => {
  it("numbers in the value must be in the quote", async () => {
    const { numbersSupported } = await import("./verifyCitations");
    expect(numbersSupported("60 % withheld", "your employer must apply 60% as the withholding rate")).toBe(true);
    expect(numbersSupported("2 months", "The processing time starts when you have proved your identity")).toBe(false);
    expect(numbersSupported("maximum of ten business days", "anything")).toBe(true);
  });
});
