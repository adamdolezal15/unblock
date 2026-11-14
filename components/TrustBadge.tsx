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

/** Labelled badge for the side panel and quotes. Official sources get the ink treatment; the rest are outlined. */
export function TrustBadge({ trust }: { trust: Trust }) {
  const strong = trust === "official";
  return (
    <span
      title={TRUST_HELP[trust]}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-semibold uppercase leading-none tracking-[0.06em] ${
        strong ? "bg-ink text-paper" : trust === "community" ? "border border-dashed border-rule-strong text-muted" : "border border-rule-strong text-ink"
      }`}
    >
      {TRUST_LABEL[trust]}
    </span>
  );
}
