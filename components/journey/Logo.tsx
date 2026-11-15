/**
 * The Journey mark, copied from the reference: a rounded dark-green square with a white U-shaped route (a dot at
 * its start) and a small coral arrow at its end, and the "unblock." wordmark with a coral dot.
 */
export function JourneyLogo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <svg aria-hidden width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
        <rect width="40" height="40" rx="12" fill="#0F2A23" />
        <path d="M12 11 V21 a8 8 0 0 0 16 0 V15" fill="none" stroke="#F3F6F4" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="12" cy="11" r="3" fill="#F3F6F4" />
        <path d="M28 9.5 l3.6 4.4 h-7.2 z" fill="#FF6B4A" />
      </svg>
      <span className="font-j-serif text-[24px] font-bold leading-none tracking-[-0.5px] text-j-ink">
        unblock<span className="text-[#FF6B4A]">.</span>
      </span>
    </span>
  );
}
