// The design switch (Classic | Journey): the URL wins, then the stored choice, then Classic.
import { describe, expect, it } from "vitest";
import { designFrom, urlWithDesign } from "../../lib/ui/useDesign";

describe("designFrom", () => {
  it("defaults to Classic", () => {
    expect(designFrom("", null)).toBe("classic");
    expect(designFrom("?demo=marta", "nonsense")).toBe("classic");
  });
  it("uses the stored choice", () => {
    expect(designFrom("?demo=marta", "journey")).toBe("journey");
  });
  it("lets ?design= override the stored choice", () => {
    expect(designFrom("?demo=marta&design=classic", "journey")).toBe("classic");
    expect(designFrom("?design=journey", null)).toBe("journey");
  });
  it("ignores an unknown ?design=", () => {
    expect(designFrom("?design=retro", "journey")).toBe("journey");
  });
});

describe("urlWithDesign", () => {
  it("leaves a URL without ?design= alone", () => {
    expect(urlWithDesign("http://x/?demo=marta#days", "journey")).toBe("http://x/?demo=marta#days");
  });
  it("updates ?design= and keeps the rest", () => {
    expect(urlWithDesign("http://x/?demo=marta&design=classic#map", "journey")).toBe("http://x/?demo=marta&design=journey#map");
  });
});
