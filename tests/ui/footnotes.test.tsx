import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Prose } from "../../components/letter/LetterView";
import type { Ref } from "../../lib/ui/letter";

const ref = (n: number): Ref => ({ n, citation: { url: `https://example.fi/${n}`, quote: "q", trust: "official", fetchedAt: "2026-11-14T00:00:00Z" } });

describe("footnotes in prose", () => {
  it("puts one number at the end of the paragraph, never in the middle of the text", () => {
    const html = renderToStaticMarkup(<Prose segs={[{ t: "Proof of your right of residence " }, { ref: ref(10) }, { t: " in Finland. Ask anyway " }, { ref: ref(11) }, { t: "." }]} />);
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toBe("Proof of your right of residence in Finland. Ask anyway.10");
    expect(html.match(/<sup/g)).toHaveLength(1);
    expect(html).toMatch(/<span class="whitespace-nowrap">anyway\.<sup[^>]*style="line-height:0;vertical-align:super/);
  });

  it("renders plain text when there is no source", () => {
    expect(renderToStaticMarkup(<Prose segs={[{ t: "Just words." }]} />)).toBe("Just words.");
  });
});
