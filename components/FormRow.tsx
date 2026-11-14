import { Prose } from "./letter/LetterView";
import { Footnotes } from "./letter/Footnote";
import { IconDocument, IconExternal } from "./icons";
import type { FormLine } from "@/lib/ui/forms";

const link = "inline-flex items-center gap-1 whitespace-nowrap font-semibold text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";

/**
 * An official form as its own row: document icon, the form name in bold, what to do with it (sourced), Open.
 * "card" sits on a step card as a distinct row; "inline" is a Bring list item; "list" is in Ready to send.
 */
export function FormRow({ line, variant = "card" }: { line: FormLine; variant?: "card" | "inline" | "list" }) {
  const hasGuide = line.guide.some((s) => "t" in s);
  const ref = line.guide.find((s) => "ref" in s);
  const body = (
    <span className="min-w-0">
      <span className="font-bold text-ink">{line.name}</span>
      {hasGuide ? (
        <>
          <span className="text-muted" aria-hidden>
            {" · "}
          </span>
          <span className="text-ink">
            <Prose segs={line.guide} />
          </span>
        </>
      ) : (
        ref && "ref" in ref && <Footnotes refs={[ref.ref]} />
      )}
      <span className="text-muted" aria-hidden>
        {" · "}
      </span>
      <a href={line.href} target="_blank" rel="noreferrer" aria-label={`${line.linkLabel}: ${line.name}`} className={link}>
        {line.shortLabel} <IconExternal className="h-3.5 w-3.5" />
      </a>
    </span>
  );
  const icon = <IconDocument className="mt-[3px] h-[18px] w-[18px] shrink-0 text-accent" />;
  if (variant === "card")
    return (
      <p className="mt-2 flex max-w-[62ch] items-start gap-2.5 text-[15px] leading-snug">
        {icon}
        {body}
      </p>
    );
  return (
    <span className="flex items-start gap-2.5 text-[16px] leading-snug">
      {icon}
      {body}
    </span>
  );
}
