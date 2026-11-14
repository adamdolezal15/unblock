import type { Trust } from "@/lib/types";

export const TRUST_LABEL: Record<Trust, string> = {
  official: "Official",
  provider: "Provider",
  university: "University",
  news: "News",
  community: "Community",
};

const TRUST_HELP: Record<Trust, string> = {
  official: "Official: a Finnish authority's own site",
  provider: "Provider: the bank or service provider itself",
  university: "University: a university's guide for newcomers",
  news: "News: a news outlet",
  community: "Community: forums and blogs by people who did it",
};

/** Compact glyph for graph nodes: filled = official, half = provider, ring = university / news, dashed ring = community. */
export function TrustGlyph({ trust, className = "h-3.5 w-3.5" }: { trust?: Trust; className?: string }) {
  if (!trust) return null;
  return (
    <svg viewBox="0 0 14 14" className={className} role="img" aria-label={TRUST_HELP[trust]}>
      <title>{TRUST_HELP[trust]}</title>
      {trust === "official" && <circle cx="7" cy="7" r="5.5" fill="currentColor" />}
      {trust === "provider" && (
        <>
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 2a5 5 0 0 1 0 10z" fill="currentColor" />
        </>
      )}
      {(trust === "university" || trust === "news") && <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.75" />}
      {trust === "community" && <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.8" />}
    </svg>
  );
}

/** Trust tier next to a source: the glyph and the tier name, sentence case. */
export function TrustBadge({ trust }: { trust: Trust }) {
  return (
    <span title={TRUST_HELP[trust]} className={`inline-flex items-center gap-1.5 text-[14px] ${trust === "official" ? "font-semibold text-ink" : "text-muted"}`}>
      <TrustGlyph trust={trust} className="h-3.5 w-3.5" />
      {TRUST_LABEL[trust]}
    </span>
  );
}
