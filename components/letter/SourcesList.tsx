"use client";
import { useState } from "react";
import type { Trust } from "@/lib/types";
import { say } from "@/lib/ui/counts";
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
export function SourcesList({ sources, bare = false }: { sources: Source[]; /** Opened from the footer: no heading or button, the list shown. */ bare?: boolean }) {
  // Collapsed by default: the numbers in the text already open each quote.
  const [opened, setOpen] = useState(false);
  const open = bare || opened;
  const official = sources.filter((s) => s.trust === "official").length;
  return (
    <section aria-labelledby="sources">
      <h2 id="sources" className={bare ? "sr-only" : "text-[28px] font-bold text-ink"}>
        Sources
      </h2>
      <p className={bare ? "text-[15px] text-muted" : "mt-1 text-[17px] text-muted"}>
        {say.sources(sources.length)}, {official} of them official. Each quote was checked word for word.
      </p>
      {!bare && <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="btn-secondary mt-4"
      >
        {open ? "Hide sources" : `Show all ${sources.length} sources`}
      </button>}
      {open && (
        <div className={`${bare ? "mt-5" : "mt-8"} grid gap-x-12 gap-y-8 text-left md:grid-cols-2`}>
          {GROUPS.map((g) => {
            const list = sources.filter((s) => s.trust === g.trust).sort((a, b) => a.n - b.n);
            if (!list.length) return null;
            return (
              <div key={g.trust}>
                <h3 className="text-[17px] font-semibold text-ink">
                  {g.title} <span className="num font-normal text-muted">({list.length})</span>
                </h3>
                <ol className="mt-2 space-y-2">
                  {list.map((s) => (
                    <li key={s.n} id={`source-${s.n}`} className="flex gap-3 text-[15px] leading-snug">
                      <span className="num w-7 shrink-0 text-right text-muted">{s.n}.</span>
                      <a
                        href={quoteLink(s.url, s.quotes[0] ?? "")}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 break-words link"
                      >
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
      )}
    </section>
  );
}
