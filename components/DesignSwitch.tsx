"use client";
import { DESIGNS, type Design } from "@/lib/ui/useDesign";

/** "Classic | Journey": a small segmented control in the result header. Uses the theme tokens, so it fits both. */
export function DesignSwitch({ design, onChange }: { design: Design; onChange: (d: Design) => void }) {
  return (
    <div role="group" aria-label="Design" className="inline-flex shrink-0 rounded-full border border-hairline bg-surface p-[3px] text-[13px]">
      {DESIGNS.map((d) => {
        const on = d.id === design;
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(d.id)}
            className={`rounded-full px-3 py-[3px] font-semibold transition-colors ${on ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
