"use client";
import { VIEWS, type View } from "@/lib/ui/useView";

/** Plain text tabs, the active one underlined. */
export function ViewTabs({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <nav aria-label="Views" className="flex justify-center gap-9 border-b border-rule">
      {VIEWS.map((v) => {
        const active = v.id === view;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 pt-1 text-[17px] transition-colors ${
              active ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:border-rule-strong hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </nav>
  );
}
