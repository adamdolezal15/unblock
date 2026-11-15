"use client";
// The pre-run questions: when the sentence leaves citizenship or purpose open, the first screen asks with chips
// instead of guessing (lib/agent/profileAnswers). City and date keep their defaults and are marked as assumed.
import type { Answers, ClarifyField, PurposeAnswer } from "@/lib/agent/profileAnswers";
import { longDate } from "@/lib/ui/letter";

type Kind = "EU" | "NORDIC" | "NON_EU";
const CITIZENSHIP: { kind: Kind; label: string; sentence: string }[] = [
  { kind: "EU", label: "EU / EEA / Swiss", sentence: "an EU / EEA / Swiss citizen" },
  { kind: "NORDIC", label: "Nordic", sentence: "a Nordic citizen" },
  { kind: "NON_EU", label: "Other", sentence: "a non-EU citizen" },
];
const PURPOSE: { key: PurposeAnswer; label: string; sentence: string }[] = [
  { key: "work", label: "Work", sentence: "working" },
  { key: "study", label: "Study", sentence: "studying" },
  { key: "work_study", label: "Work + study", sentence: "working and studying" },
  { key: "family", label: "Family", sentence: "joining family" },
];

const chip = (on: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-[15px] leading-tight transition-colors ${
    on ? "border-accent bg-accent text-surface" : "border-hairline bg-surface text-ink hover:border-accent"
  }`;

export function Clarify({ fields, answers, onChange, soFar }: {
  /** The questions this sentence needs (stable while the panel is open). */
  fields: ClarifyField[];
  answers: Answers;
  onChange: (a: Answers) => void;
  soFar: { city: string; cityAssumed: boolean; arrivalDate?: string } | null;
}) {
  const c = answers.citizenship;
  const typed = c?.kind === "country" ? c.country : "";
  const who = c ? (c.kind === "country" ? (typed.trim() ? `a citizen of ${typed.trim()}` : null) : CITIZENSHIP.find((x) => x.kind === c.kind)!.sentence) : null;
  const doing = answers.purpose ? PURPOSE.find((x) => x.key === answers.purpose)!.sentence : null;
  const blank = (s: string) => <span className="rounded-[6px] border border-dashed border-hairline-strong px-1.5 text-muted">{s}</span>;

  return (
    <section aria-label="A few questions before planning" className="mt-3 rounded-[16px] border border-rule-strong bg-raised px-4 py-4 text-left shadow-[0_1px_0_rgba(27,35,48,0.04)] sm:px-5">
      {soFar && (
        <p className="text-[15px] leading-relaxed text-ink">
          You&apos;re {fields.includes("citizenship") ? (who ?? blank("citizenship?")) : "moving"},{" "}
          {fields.includes("purpose") ? (doing ?? blank("why?")) : null}
          {fields.includes("purpose") ? " " : ""}in {soFar.city}
          {soFar.cityAssumed && <span className="text-muted"> (assumed)</span>}
          {soFar.arrivalDate ? <> from {longDate(soFar.arrivalDate)}</> : <span className="text-muted">, planning from today (assumed)</span>}.
        </p>
      )}
      <div className="mt-4 space-y-4">
        {fields.includes("citizenship") && (
          <fieldset>
            <legend className="text-[15px] font-semibold text-ink">Your citizenship</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {CITIZENSHIP.map((o) => (
                <button key={o.kind} type="button" aria-pressed={c?.kind === o.kind} onClick={() => onChange({ ...answers, citizenship: { kind: o.kind } })} className={chip(c?.kind === o.kind)}>
                  {o.label}
                </button>
              ))}
              <label className="sr-only" htmlFor="clarify-country">
                Or type your country
              </label>
              <input
                id="clarify-country"
                type="text"
                value={typed}
                maxLength={60}
                placeholder="or type a country"
                onChange={(e) => onChange({ ...answers, citizenship: e.target.value ? { kind: "country", country: e.target.value } : undefined })}
                className={`w-44 rounded-full border bg-surface px-3.5 py-1.5 text-[15px] leading-tight text-ink placeholder:text-muted focus:border-accent ${typed ? "border-accent" : "border-hairline"}`}
              />
            </div>
          </fieldset>
        )}
        {fields.includes("purpose") && (
          <fieldset>
            <legend className="text-[15px] font-semibold text-ink">Why you&apos;re moving</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PURPOSE.map((o) => (
                <button key={o.key} type="button" aria-pressed={answers.purpose === o.key} onClick={() => onChange({ ...answers, purpose: o.key })} className={chip(answers.purpose === o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </section>
  );
}
