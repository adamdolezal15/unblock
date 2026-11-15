"use client";
import { BrandStripe } from "../brand";
import { JourneyLogo } from "./Logo";

type Props = {
  onEdit: () => void;
  onHome: () => void;
  progress?: number;
  demo?: boolean;
  /** Distinct sources the plan was checked against (lib/ui/counts); null until the run summary arrives. */
  sources: number | null;
  /** The design switch. */
  right: React.ReactNode;
};

/** The Journey header: the mark (back to the start), "Plan checked against N sources", edit, the design switch. */
export function JourneyHeader({ onEdit, onHome, progress, demo, sources, right }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-j-bg/95 backdrop-blur-[2px]">
      {progress !== undefined && <BrandStripe progress={progress} />}
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-10 sm:py-[22px]">
        <button type="button" onClick={onHome} aria-label="Unblock, start over" className="rounded-[12px]">
          <JourneyLogo />
        </button>
        <div className="flex min-w-0 items-center gap-x-5 gap-y-2">
          {sources !== null && sources > 0 && (
            <p className="hidden items-center gap-2.5 text-[14px] text-j-muted md:flex">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-j-done" />
              Plan checked against {sources} {sources === 1 ? "source" : "sources"}
            </p>
          )}
          {!demo && (
            <button type="button" onClick={onEdit} className="inline-flex whitespace-nowrap rounded-[8px] px-2 py-1 text-[14px] text-j-ink hover:bg-j-chip">
              <span className="sm:hidden">Edit</span>
              <span className="hidden sm:inline">Edit your situation</span>
            </button>
          )}
          {right}
        </div>
      </div>
    </header>
  );
}
