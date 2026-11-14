import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Prose } from "../../components/letter/LetterView";
import type { Ref } from "../../lib/ui/letter";

const ref = (n: number): Ref => ({ n, citation: { url: `https://example.fi/${n}`, quote: "q", trust: "official", fetchedAt: "2026-11-14T00:00:00Z" } });

describe("footnotes in prose", () => {
  it("renders adjacent numbers tight (5,6) and glues them to the word before", () => {
    const html = renderToStaticMarkup(<Prose segs={[{ t: "Banks may not require it " }, { ref: ref(5) }, { ref: ref(6) }, { t: ". Ask anyway." }]} />);
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toBe("Banks may not require it5,6. Ask anyway.");
    expect(html).toMatch(/<span class="whitespace-nowrap">it<sup/);
    expect(html.match(/<sup/g)).toHaveLength(1);
  });
});
