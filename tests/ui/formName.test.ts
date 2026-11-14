// A form is shown under its name only when the extracted name looks like one; a sentence fragment is "Official form".
import { describe, expect, it } from "vitest";
import { displayFormName } from "../../lib/ui/forms";

describe("displayFormName", () => {
  it("keeps real form names", () => {
    expect(displayFormName("Form 6150e (Registration information on a foreigner staying in Finland temporarily)")).toBe(
      "Form 6150e (Registration information on a foreigner staying in Finland temporarily)",
    );
    expect(displayFormName("Request a personal identity code (online form)")).toBe("Request a personal identity code (online form)");
    expect(displayFormName("6150e")).toBe("6150e");
  });
  it("never shows an extracted fragment as a title (India's 'your application the')", () => {
    expect(displayFormName("your application the")).toBe("Official form");
  });
});
