"use client";
import { useState } from "react";
import type { ProfileEvent } from "@/lib/ui/runState";
import { profileParts, type Field } from "@/lib/ui/profileSentence";

type Props = { profile: ProfileEvent; text: string; disabled: boolean; onCorrect: (field: Field, value: string) => void };

/** "You're a Czech citizen, working and studying in Helsinki from 1 December…" with editable, underlined parts. */
export function ProfileSentence({ profile, text, disabled, onCorrect }: Props) {
  const [editing, setEditing] = useState<Field | null>(null);
  const parts = profileParts(profile.profile, profile.assumptions, text);

  return (
    <div className="text-[17px] leading-[1.7] text-muted">
      <p>
        {parts.map((p, i) =>
          "t" in p ? (
            <span key={i}>{p.t}</span>
          ) : editing === p.field ? (
            <EditField
              key={i}
              value={p.value}
              onCancel={() => setEditing(null)}
              onSave={(v) => {
                setEditing(null);
                if (v && v !== p.value) onCorrect(p.field, v);
              }}
            />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => setEditing(p.field)}
              title={p.title ? `${p.title} Click to correct it and re-plan.` : "Click to change this and re-plan"}
              className="text-ink underline decoration-rule-strong decoration-dotted decoration-[1.5px] underline-offset-[5px] hover:text-accent hover:decoration-accent disabled:cursor-default disabled:hover:text-ink"
            >
              {p.value}
            </button>
          ),
        )}
      </p>
      {profile.partnerNotes.map((n) => (
        <p key={n} className="mt-1">
          For your partner: {n} I haven&apos;t researched their steps.
        </p>
      ))}
    </div>
  );
}

function EditField({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      className="inline"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft.trim());
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onBlur={onCancel}
        size={Math.max(6, draft.length + 1)}
        className="rounded-[3px] border-b-2 border-accent bg-accent-soft px-1 text-ink focus:outline-none"
        aria-label="Change this and press Enter to re-plan"
      />
      <span className="ml-2 text-[14px] text-muted">Enter to re-plan</span>
    </form>
  );
}
