import type { Coverage } from "@/lib/ui/coverage";
import { coverageSentence } from "@/lib/ui/coverage";

/** A calm amber note under the headline; the plan below is never hidden. */
export function CoverageNotice({ coverage }: { coverage: Coverage }) {
  return (
    <p role="note" className="mt-4 max-w-[680px] rounded-[12px] border border-amber-line bg-amber-soft px-4 py-3 text-[15px] leading-normal text-ink">
      {coverageSentence(coverage)}{" "}
      <a href={coverage.link.url} target="_blank" rel="noreferrer" className="link">
        {coverage.link.label}
      </a>
      .
    </p>
  );
}
