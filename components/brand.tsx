// Visual identity: a route of stops with an "either one" diamond, the last leg in the critical-path blue
// ending in a check. Used large on the first screen and small next to the wordmark.

export function RouteMark({ className = "h-7 w-[220px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 28" className={className} aria-hidden>
      <line x1="10" y1="14" x2="166" y2="14" stroke="#c4bdb0" strokeWidth="1.5" />
      <line x1="166" y1="14" x2="208" y2="14" stroke="#003580" strokeWidth="3" strokeLinecap="round" />
      <circle cx="10" cy="14" r="4.5" fill="#16181d" />
      <circle cx="58" cy="14" r="4.5" fill="#16181d" />
      <rect x="99" y="7" width="14" height="14" transform="rotate(45 106 14)" fill="#f7f5f0" stroke="#16181d" strokeWidth="1.5" />
      <circle cx="160" cy="14" r="4.5" fill="#16181d" />
      <circle cx="208" cy="14" r="7" fill="#003580" />
      <path d="M204.5 14.2l2.4 2.4 4.6-4.8" fill="none" stroke="#f7f5f0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Small mark for the top bar: three stops, last one blue. */
export function MiniMark({ className = "h-4 w-[44px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 16" className={className} aria-hidden>
      <line x1="5" y1="8" x2="28" y2="8" stroke="#c4bdb0" strokeWidth="1.5" />
      <line x1="28" y1="8" x2="38" y2="8" stroke="#003580" strokeWidth="2.5" />
      <circle cx="5" cy="8" r="3" fill="#16181d" />
      <circle cx="20" cy="8" r="3" fill="#16181d" />
      <circle cx="38" cy="8" r="4.5" fill="#003580" />
    </svg>
  );
}

/** The thin Finnish-blue stripe along the top of every screen. */
export function BrandStripe() {
  return <div className="h-[3px] w-full bg-accent" aria-hidden />;
}
