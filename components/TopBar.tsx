"use client";
import { BrandStripe } from "./brand";

/** Results header: back to edit the situation and the wordmark. The calendar is the answer header's one button. */
type Props = {
  onEdit: () => void;
  onHome: () => void;
  progress?: number;
  /** A saved demo: no "Edit your situation" (there is nothing of yours to edit). */
  demo?: boolean;
  /** The right-hand cell (the design switch). */
  right?: React.ReactNode;
};

export function TopBar({ onEdit, onHome, progress, demo, right }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-[2px]">
      <BrandStripe progress={progress} />
      <div className="mx-auto grid max-w-[1040px] grid-cols-[1fr_auto_1fr] items-center px-4 py-3 sm:px-6">
        {demo ? <div /> : <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 justify-self-start whitespace-nowrap rounded-[8px] px-2 py-2 text-[15px] text-ink hover:bg-sunk">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M13 8H3M7 4L3 8l4 4" />
          </svg>
          {/* Short on phones, so the design switch fits on the same row. */}
          <span className="sm:hidden">Edit</span>
          <span className="hidden sm:inline">Edit your situation</span>
        </button>}
        <button type="button" onClick={onHome} className="inline-flex items-center gap-2" aria-label="Unblock, start over">
          <span className="text-[20px] font-bold text-ink">Unblock</span>
        </button>
        <div className="justify-self-end">{right}</div>
      </div>
      <div className="h-px bg-rule" />
    </header>
  );
}
