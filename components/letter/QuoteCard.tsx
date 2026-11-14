import type { Citation } from "@/lib/types";
import { domainOf, fmtDate } from "@/lib/ui/format";
import { Favicon } from "../ActivityFeed";
import { IconExternal } from "../icons";
import { TrustBadge } from "../TrustBadge";

/** Link that opens the page scrolled to the quote (URL text fragment; browsers without support just open the page). */
export function quoteLink(url: string, quote: string): string {
  const words = quote.replace(/[“”"]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 4) return url;
  const enc = (w: string[]) => encodeURIComponent(w.join(" ")).replace(/-/g, "%2D").replace(/,/g, "%2C");
  const frag = words.length > 10 ? `${enc(words.slice(0, 5))},${enc(words.slice(-5))}` : enc(words);
  return `${url}${url.includes("#") ? "" : "#"}:~:text=${frag}`;
}

/** A verified quote as a document excerpt: serif blockquote, then where it is from and how much to trust it. */
export function QuoteCard({ citation, n, size = "md" }: { citation: Citation; n?: number; size?: "md" | "sm" }) {
  const domain = domainOf(citation.url);
  return (
    <figure>
      <blockquote className={`border-l-2 border-rule-strong pl-4 font-serif text-ink ${size === "md" ? "text-[18px] leading-[1.55]" : "text-[16px] leading-[1.5]"}`}>
        “{citation.quote}”
      </blockquote>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-[18px] text-[14px] text-muted">
        {n !== undefined && <span className="num font-semibold text-ink">{n}.</span>}
        <span className="flex items-center gap-1.5">
          <Favicon domain={domain} />
          <span className="text-ink">{domain}</span>
        </span>
        <TrustBadge trust={citation.trust} />
        <span className="num">Retrieved {fmtDate(citation.fetchedAt)}</span>
        <a href={quoteLink(citation.url, citation.quote)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          Open the page <IconExternal className="h-3.5 w-3.5" />
        </a>
      </figcaption>
    </figure>
  );
}
