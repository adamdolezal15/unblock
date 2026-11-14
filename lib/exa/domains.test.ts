import { describe, expect, it } from "vitest";
import { CITY_DOMAINS, cityDomains, NEWS, officialDomains, PROVIDER, TRUST_RANK, trustOf } from "./domains";

describe("cityDomains whitelist", () => {
  it("maps known cities (Finnish or Swedish name, any case/diacritics) to their real domain", () => {
    expect(cityDomains("Helsinki")).toEqual(["hel.fi"]);
    expect(cityDomains("Helsingfors")).toEqual(["hel.fi"]);
    expect(cityDomains(" tampere ")).toEqual(["tampere.fi"]);
    expect(cityDomains("Jyväskylä")).toEqual(["jyvaskyla.fi"]);
    expect(cityDomains("Åbo")).toEqual(["turku.fi"]);
    expect(cityDomains("Oulu")).toEqual(["ouka.fi"]);
    expect(cityDomains("Uleåborg")).toEqual(["ouka.fi"]);
  });
  it("covers ~20 municipalities", () => {
    expect(new Set(Object.values(CITY_DOMAINS)).size).toBeGreaterThanOrEqual(20);
  });
  it("unknown cities get no domain and nothing is marked official", () => {
    for (const c of ["Inari", "Kittilä", "Springfield", "", "   ", undefined]) expect(cityDomains(c)).toEqual([]);
    expect(trustOf("https://www.inari.fi/x", cityDomains("Inari"))).toBe("community");
    expect(officialDomains("Inari")).not.toContain("inari.fi");
    // The University of Oulu's domain is not the city's.
    expect(trustOf("https://www.oulu.fi/en", cityDomains("Oulu"))).toBe("community");
    expect(trustOf("https://www.ouka.fi/en", cityDomains("Oulu"))).toBe("official");
  });
});

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
