"use client";
import { BrandStripe, MiniMark } from "./brand";
import { IconDownload } from "./icons";

/** Results header: back to edit the situation, the wordmark, and the calendar download. No prompt field. */
export function TopBar({ onEdit, onHome, icsUrl, progress }: { onEdit: () => void; onHome: () => void; icsUrl?: string; progress?: number }) {
  return (
    <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-[2px]">
      <BrandStripe progress={progress} />
      <div className="mx-auto grid max-w-[1040px] grid-cols-[1fr_auto_1fr] items-center px-6 py-3">
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 justify-self-start rounded-[8px] px-2 py-1.5 text-[15px] text-ink hover:bg-sunk">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M13 8H3M7 4L3 8l4 4" />
          </svg>
          Edit your situation
        </button>
        <button type="button" onClick={onHome} className="inline-flex items-center gap-2.5" aria-label="Unblock, start over">
          <MiniMark />
          <span className="font-serif text-[22px] font-semibold text-ink">Unblock</span>
        </button>
        <div className="justify-self-end">
          {icsUrl && (
            <a href={icsUrl} className="inline-flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[15px] text-ink hover:bg-sunk">
              <IconDownload className="h-4 w-4" /> Calendar (.ics)
            </a>
          )}
        </div>
      </div>
      <div className="h-px bg-rule" />
    </header>
  );
}
