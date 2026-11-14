import { describe, expect, it } from "vitest";
import { NEWS, PROVIDER, TRUST_RANK, trustOf } from "./domains";

describe("trustOf tiers", () => {
  it("labels every provider domain, incl. subdomains and www", () => {
    for (const d of PROVIDER) expect(trustOf(`https://www.${d}/x`)).toBe("provider");
    expect(trustOf("https://www.op.fi/en")).toBe("provider");
  });
  it("labels news domains", () => {
    for (const d of NEWS) expect(trustOf(`https://${d}/a`)).toBe("news");
  });
  it("keeps official, university, community", () => {
    expect(trustOf("https://dvv.fi/x")).toBe("official");
    expect(trustOf("https://studies.helsinki.fi/x")).toBe("university");
    expect(trustOf("https://reddit.com/r/Finland")).toBe("community");
    expect(trustOf("https://notop.fi/x")).toBe("community");
  });
});

describe("TRUST_RANK", () => {
  it("orders official > provider > university > news > community", () => {
    const order = ["official", "provider", "university", "news", "community"] as const;
    for (let i = 0; i < order.length - 1; i++) expect(TRUST_RANK[order[i]]).toBeGreaterThan(TRUST_RANK[order[i + 1]]);
  });
});
