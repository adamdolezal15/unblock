import type { Trust } from "@/lib/types";
import type { Source } from "@/lib/ui/letter";
import { quoteLink } from "./QuoteCard";

const GROUPS: { trust: Trust; title: string }[] = [
  { trust: "official", title: "Official" },
  { trust: "provider", title: "Banks and providers" },
  { trust: "university", title: "Universities" },
  { trust: "news", title: "News" },
  { trust: "community", title: "People who did it" },
];

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname).replace(/\/$/, "");
    return p.length > 64 ? `${p.slice(0, 61)}…` : p;
  } catch {
    return "";
  }
}

/** All sources of the run, numbered like the footnotes, grouped by trust tier. */
export function SourcesList({ sources }: { sources: Source[] }) {
  return (
    <section aria-labelledby="sources" className="border-t border-rule pt-8">
      <h2 id="sources" className="font-serif text-[26px] font-semibold text-ink">
        Sources
      </h2>
      <p className="mt-1 max-w-[680px] text-[16px] text-muted">
        Every number in the text points to one of these pages. Each quote was checked word for word against the page text.
      </p>
      <div className="mt-6 grid gap-x-12 gap-y-8 md:grid-cols-2">
        {GROUPS.map((g) => {
          const list = sources.filter((s) => s.trust === g.trust).sort((a, b) => a.n - b.n);
          if (!list.length) return null;
          return (
            <div key={g.trust}>
              <h3 className="text-[16px] font-semibold text-ink">
                {g.title} <span className="num font-normal text-muted">({list.length})</span>
              </h3>
              <ol className="mt-2 space-y-1.5">
                {list.map((s) => (
                  <li key={s.n} id={`source-${s.n}`} className="flex gap-3 text-[15px] leading-snug">
                    <span className="num w-7 shrink-0 text-right text-muted">{s.n}.</span>
                    <a href={quoteLink(s.url, s.quotes[0] ?? "")} target="_blank" rel="noreferrer" className="min-w-0 break-words text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                      {s.domain}
                      <span className="text-muted">{pathOf(s.url)}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
