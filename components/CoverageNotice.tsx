import type { Coverage } from "@/lib/ui/coverage";
import { coverageSentence } from "@/lib/ui/coverage";

/** A calm amber note under the headline; the plan below is never hidden. */
export function CoverageNotice({ coverage }: { coverage: Coverage }) {
  return (
    <p role="note" className="mt-5 max-w-[680px] rounded-[3px] border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-[15px] leading-snug text-amber-950">
      {coverageSentence(coverage)}{" "}
      <a href={coverage.link.url} target="_blank" rel="noreferrer" className="underline underline-offset-[3px]">
        {coverage.link.label}
      </a>
      .
    </p>
  );
}
