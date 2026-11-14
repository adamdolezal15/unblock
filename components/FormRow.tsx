import { Prose } from "./letter/LetterView";
import { IconExternal } from "./icons";
import type { FormLine } from "@/lib/ui/forms";

/** "Form 6150e: fill in before you go, sign at the office¹ · Open official form". */
export function FormRow({ line }: { line: FormLine }) {
  return (
    <>
      <Prose segs={line.segs} />
      {" · "}
      <a href={line.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
        {line.linkLabel} <IconExternal className="h-3.5 w-3.5" />
      </a>
    </>
  );
}

/** Phase 2 hook: not wired to anything yet, and says so. */
export function SuggestFill() {
  return (
    <span aria-disabled="true" title="Coming soon" className="cursor-not-allowed text-[14px] text-muted/70">
      Suggest how to fill it (coming soon)
    </span>
  );
}
