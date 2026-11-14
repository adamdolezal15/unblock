"use client";
import type { RefineRow } from "@/lib/refine/refine";
import type { RefineKey } from "@/lib/refine/refine";

/**
 * "Make it more accurate": up to three yes/no answers that matter for this plan. Clicking one recomputes the
 * dates on the spot from what the run already found (nothing is searched again) and is kept in the URL.
 */
export function Refine({ rows, onChange }: { rows: RefineRow[]; onChange: (keys: RefineKey[]) => void }) {
  if (!rows.length) return null;
  return (
    <section aria-label="Make it more accurate" className="mt-6 max-w-[640px]">
      <h3 className="text-[17px] font-bold text-ink">Make it more accurate</h3>
      <p className="mt-1 text-[15px] text-muted">Tell me what I had to guess. The dates update right away.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-start gap-3 text-[17px] leading-snug text-ink">
              <input
                type="checkbox"
                checked={r.checked}
                onChange={() => onChange(r.next)}
                className="mt-[3px] h-[18px] w-[18px] shrink-0 cursor-pointer accent-accent"
              />
              <span>{r.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
