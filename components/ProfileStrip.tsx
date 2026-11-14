"use client";
import { useState } from "react";
import type { Profile } from "@/lib/types";
import type { ProfileEvent } from "@/lib/ui/runState";
import { fmtDate, fmtEur } from "@/lib/ui/format";
import { assumptionLabel } from "@/lib/ui/assumptionLabel";
import { IconPencil } from "./icons";

const CITIZENSHIP: Record<Profile["citizenship"], string> = { EU: "EU citizen", NON_EU: "Non-EU citizen", NORDIC: "Nordic citizen" };
const PURPOSE: Record<Profile["purpose"][number], string> = { work: "Work", study: "Study", family: "Family" };

function facts(p: Profile): string[] {
  return [
    CITIZENSHIP[p.citizenship],
    p.purpose.map((x) => PURPOSE[x]).join(" + "),
    p.city,
    p.arrivalDate ? `Arriving ${fmtDate(p.arrivalDate)}` : null,
    p.monthlySalaryEur ? `${fmtEur(p.monthlySalaryEur)} / month` : null,
    p.hasFamily ? "With family" : null,
    p.temporaryProtection ? "Temporary protection" : null,
    p.stayMonths ? `Staying ${p.stayMonths} months` : null,
    p.alreadyDone?.length ? `Already has: ${p.alreadyDone.map((x) => x.replace(/_/g, " ")).join(", ")}` : null,
  ].filter((x): x is string => !!x);
}

type Props = {
  profile: ProfileEvent;
  disabled: boolean;
  /** Re-run with this correction to an assumption. */
  onCorrect: (assumption: string, correction: string) => void;
};

export function ProfileStrip({ profile, disabled, onCorrect }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Your situation</span>
        {facts(profile.profile).map((f) => (
          <span key={f} className="num rounded-full border border-rule bg-raised px-3 py-1 text-[14px] text-ink">
            {f}
          </span>
        ))}
        {profile.assumptions.map((a) => (
          <AssumptionChip key={a} text={a} disabled={disabled} onSave={(c) => onCorrect(a, c)} />
        ))}
      </div>
      {profile.partnerNotes.length > 0 && (
        <ul className="space-y-1 text-[14px] text-muted">
          {profile.partnerNotes.map((n) => (
            <li key={n}>
              <span className="font-medium text-ink">Partner: </span>
              {n} <span className="italic">Not researched for them.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssumptionChip({ text, disabled, onSave }: { text: string; disabled: boolean; onSave: (correction: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  if (editing) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          if (draft.trim() && draft.trim() !== text) onSave(draft.trim());
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (setEditing(false), setDraft(text))}
          className="w-[min(32rem,60vw)] rounded-full border border-accent bg-raised px-3 py-1 text-[14px] text-ink focus:outline-none"
          aria-label="Correct this assumption"
        />
        <button type="submit" className="rounded-full bg-accent px-3 py-1 text-[14px] font-medium text-white hover:bg-accent-hover">
          Re-plan
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      title={`${text} (click to correct it and re-plan)`}
      aria-label={`Assumed: ${text} Click to correct it.`}
      className="flex items-center gap-1.5 rounded-full border border-dashed border-rule-strong px-3 py-1 text-left text-[14px] text-muted hover:border-accent hover:text-accent disabled:opacity-60"
    >
      <span>
        <span className="font-medium">Assumed:</span> {assumptionLabel(text)}
      </span>
      <IconPencil className="h-3.5 w-3.5 shrink-0" />
    </button>
  );
}
